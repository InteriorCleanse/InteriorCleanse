/**
 * PRICE ACTION — the candlestick method's signals, the trend-level-signal
 * grade, the six-part bias score, and the pattern measurement, which must
 * never use a candle from after the signal.
 *
 * SYNTHETIC / TEST FIXTURE: every candle series below is built by hand or by a
 * seeded random walk. None of it is market data.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Candle } from '../../src/types.ts'
import { candleSignalsAt, confluence, biasScore, patternEvidence, scanHistory, MIN_SAMPLE, BIAS_NOTE } from '../../src/scanner/priceAction.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const NEVER_SAY = /\b(profitable|proven|guaranteed?|superior|best)\b|edge established|expected return/i

const k = (i: number, o: number, h: number, l: number, cl: number, v = 100): Candle => ({ openTime: i * 3_600_000, closeTime: (i + 1) * 3_600_000 - 1, open: o, high: h, low: l, close: cl, volume: v })

/** SYNTHETIC: a flat run of small candles to give the signal something before it. */
const flat = (n: number, at = 100) => Array.from({ length: n }, (_, i) => k(i, at, at + 0.6, at - 0.6, at + (i % 2 ? 0.2 : -0.2)))

/** SYNTHETIC: a seeded random walk. */
function walk(n: number, seed = 3): Candle[] {
  let s = seed, p = 100
  const rnd = () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31 }
  return Array.from({ length: n }, (_, i) => {
    const o = p, cl = p * (1 + (rnd() - 0.5) * 0.02)
    p = cl
    return k(i, o, Math.max(o, cl) * (1 + rnd() * 0.006), Math.min(o, cl) * (1 - rnd() * 0.006), cl, 50 + rnd() * 100)
  })
}
const ids = (c: Candle[], a = 1) => candleSignalsAt(c, c.length - 1, a).map((s) => s.id)

test('pin bars: a long tail two thirds of the range, body at the other end', () => {
  const c = [...flat(10), k(10, 100.2, 100.4, 97.2, 100.3)]
  assert.ok(ids(c).includes('bull-pin') || ids(c).includes('hammer'), ids(c).join(','))
  const d = [...flat(10), k(10, 99.8, 102.9, 99.7, 99.9)]
  assert.ok(ids(d).includes('bear-pin') || ids(d).includes('shooting-star'), ids(d).join(','))
  const small = [...flat(10), k(10, 100.02, 100.04, 99.9, 100.03)]
  assert.ok(!ids(small).includes('bull-pin'), 'a sliver is not a pin bar')
})

test('the fakey: an inside bar breaks one way and closes back inside the mother bar', () => {
  const mother = k(10, 99, 102, 98, 101.5), inside = k(11, 101, 101.5, 99.5, 100)
  const bull = [...flat(10), mother, inside, k(12, 99.8, 100.5, 97.5, 100.2)]
  assert.ok(ids(bull).includes('bull-fakey'), ids(bull).join(','))
  const bear = [...flat(10), mother, inside, k(12, 100.2, 102.6, 99.8, 100.4)]
  assert.ok(ids(bear).includes('bear-fakey'), ids(bear).join(','))
})

test('three white soldiers and three black crows', () => {
  const up = [...flat(10), k(10, 100, 101.1, 99.95, 101), k(11, 101, 102.1, 100.95, 102), k(12, 102, 103.1, 101.95, 103)]
  assert.ok(ids(up).includes('three-soldiers'), ids(up).join(','))
  const dn = [...flat(10), k(10, 100, 100.05, 98.9, 99), k(11, 99, 99.05, 97.9, 98), k(12, 98, 98.05, 96.9, 97)]
  assert.ok(ids(dn).includes('three-crows'), ids(dn).join(','))
})

test('every signal has a bias, words for what would confirm and cancel it, and no profitability claim', () => {
  const c = walk(400)
  const all = scanHistory(c).flatMap((h) => h.signals)
  assert.ok(all.length > 20, 'the walk produces signals')
  for (const s of all) {
    assert.ok(['bull', 'bear', 'neutral'].includes(s.bias))
    assert.ok(s.meaning && s.confirm && s.invalidate, s.id)
    assert.doesNotMatch(`${s.name} ${s.meaning} ${s.confirm} ${s.invalidate}`, NEVER_SAY)
  }
})

test('trend, level, signal: the grade is A, B, C or a dash, with a reason for each check', () => {
  const g = confluence(walk(300))
  assert.ok(['A', 'B', 'C', '—'].includes(g.grade))
  for (const ch of Object.values(g.checks)) assert.ok(typeof ch.ok === 'boolean' && ch.detail.length > 0)
  assert.match(confluence(flat(10)).text, /NOT ENOUGH DATA/)
  for (const h of scanHistory(walk(500))) if (h.grade !== '—') assert.ok(h.gradedId, 'a graded step names its signal')
})

test('bias score: six different readings, bounded to ±6, with a plain lean and a caveat', () => {
  assert.match(biasScore(walk(40)).text, /NOT ENOUGH DATA/)
  const b = biasScore(walk(300))
  assert.equal(b.parts.length, 6)
  assert.deepEqual(b.parts.map((p) => p.key), ['structure', 'averages', 'momentum', 'macd', 'candle', 'volume'])
  assert.ok(b.score >= -6 && b.score <= 6)
  assert.equal(b.lean, b.score >= 3 ? 'long' : b.score <= -3 ? 'short' : 'sit out')
  assert.equal(b.note, BIAS_NOTE)
  // SYNTHETIC: a steady staircase up, with pullbacks, reads long.
  const stairs: Candle[] = []
  let p = 100
  for (let i = 0; i < 200; i++) { const step = i % 10 < 7 ? 0.6 : -0.5; const o = p; p += step; stairs.push(k(i, o, Math.max(o, p) + 0.2, Math.min(o, p) - 0.2, p, i % 10 === 9 ? 300 : 100)) }
  assert.ok(biasScore(stairs).score > 0, JSON.stringify(biasScore(stairs).parts))
})

test('no look-ahead: reading the history up to candle n gives the same step as reading all of it', () => {
  const c = walk(420, 11)
  const full = scanHistory(c)
  for (const n of [80, 150, 233, 300, 419]) {
    const prefix = scanHistory(c.slice(0, n + 1))
    assert.deepEqual(prefix[prefix.length - 1], full.find((h) => h.n === n), `step ${n} must not depend on later candles`)
  }
})

test('pattern evidence: labelled BACKTEST, compared with the baseline, and honest about small samples', () => {
  assert.match(patternEvidence(walk(50)).note, /NOT ENOUGH DATA/)
  const e = patternEvidence(walk(900, 5))
  assert.equal(e.label, 'BACKTEST')
  assert.ok(e.baseline.count > 0 && e.baseline.upRate !== null)
  assert.ok(e.rows.length > 0)
  for (const r of e.rows) {
    assert.equal(r.status, r.count >= MIN_SAMPLE ? 'OK' : 'INSUFFICIENT SAMPLE')
    assert.ok(r.inContext.count <= r.count)
    if (r.hitRate !== null) assert.ok(r.hitRate >= 0 && r.hitRate <= 1)
  }
  assert.match(e.note, /not a forecast/)
  assert.doesNotMatch(e.note, NEVER_SAY)
})

test('walled off: the engine never imports the price-action reader, and the scanner routes stay GET-only', () => {
  for (const f of ['watch.ts', 'fusion.ts', 'riskEngine.ts', 'paperTrader.ts']) assert.doesNotMatch(readFileSync(join(ROOT, 'src', f), 'utf8'), /priceAction/, `${f} must not see price action`)
  const server = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8')
  assert.match(server, /path === '\/api\/scanner\/evidence'/)
  const src = readFileSync(join(ROOT, 'src', 'scanner', 'priceAction.ts'), 'utf8')
  assert.doesNotMatch(src, /\bfetch\(|Date\.now\(/, 'pure: no network, no clock')
})
