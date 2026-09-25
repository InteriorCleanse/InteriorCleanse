/**
 * CHART SCANNER — the rule-based pattern finder finds the shapes it claims,
 * with the points, confirmation and cancellation it reports; the AI
 * screenshot answer is clamped before it is drawn; and none of it reaches
 * the engine.
 *
 * SYNTHETIC / TEST FIXTURE: every candle series below is built by hand to
 * form a textbook shape. None of it is market data.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Candle } from '../../src/types.ts'
import { scanPatterns, pivots, rsiSeries, atr, UNTESTED } from '../../src/scanner/patterns.ts'
import { PICTURE_SCHEMA, cleanPictureRead } from '../../src/scanner/picture.ts'

const ROOT = join(import.meta.dirname, '..', '..')

/** SYNTHETIC: walk straight lines between waypoints, `per` candles per leg. */
function path(points: number[], per = 6, wick = 0.3): Candle[] {
  const closes: number[] = [points[0]]
  for (let k = 1; k < points.length; k++) for (let s = 1; s <= per; s++) closes.push(points[k - 1] + ((points[k] - points[k - 1]) * s) / per)
  return closes.map((c, i) => {
    const o = i ? closes[i - 1] : c
    return { openTime: i * 3_600_000, closeTime: (i + 1) * 3_600_000 - 1, open: o, high: Math.max(o, c) + wick, low: Math.min(o, c) - wick, close: c, volume: 100 }
  })
}
const names = (c: Candle[]) => scanPatterns(c).patterns.map((p) => `${p.name}:${p.status}`)
const find = (c: Candle[], name: string) => scanPatterns(c).patterns.find((p) => p.name === name)

test('too few candles: says NOT ENOUGH DATA instead of guessing', () => {
  const r = scanPatterns(path([100, 101], 5))
  assert.equal(r.patterns.length, 0)
  assert.match(r.summary.text, /NOT ENOUGH DATA/)
})

test('building blocks: swing points, ATR and RSI behave', () => {
  const c = path([100, 110, 100, 110], 6)
  assert.deepEqual(pivots(c).map((p) => `${p.kind}${p.i}`), ['H6', 'L12', 'H18'].filter((x) => x !== 'H18'), 'the last swing needs three candles after it before it counts')
  assert.ok(atr(c)! > 1.5 && atr(c)! < 2.5)
  const rs = rsiSeries(path([100, 130], 30))
  assert.ok(rs[rs.length - 1] > 90, 'a straight climb has RSI near 100')
})

test('double top: two matching highs, a real dip between, confirmed on the neckline break, with a measured move', () => {
  const c = path([100, 120, 110, 120, 104], 8)
  const p = find(c, 'Double top')!
  assert.ok(p, names(c).join(','))
  assert.equal(p.bias, 'bear')
  assert.equal(p.status, 'confirmed')
  assert.equal(p.points.length, 2)
  const neck = p.lines[0].p1
  assert.ok(Math.abs(neck - 109.7) < 0.01, `neckline ${neck}`)
  assert.ok(Math.abs(p.target! - (neck - (120.3 - neck))) < 0.01)
  assert.match(p.confirm, /close below the neckline/)
  assert.match(p.invalidate, /close above/)
})

test('double bottom mirrored, still forming until it breaks the neckline', () => {
  const p = find(path([120, 100, 110, 100, 106], 8), 'Double bottom')!
  assert.equal(p.bias, 'bull')
  assert.equal(p.status, 'forming')
})

test('a double top that runs to new highs is marked failed, not quietly dropped', () => {
  // The second top is a real swing (price dips after it), then price runs through both tops.
  const p = find(path([100, 120, 110, 120, 116, 126], 8), 'Double top')
  assert.equal(p?.status, 'failed')
})

test('head and shoulders: head above both shoulders, neckline through the troughs, confirmed below it', () => {
  const c = path([100, 110, 104, 118, 104, 110, 100], 7)
  const p = find(c, 'Head and shoulders')!
  assert.ok(p, names(c).join(','))
  assert.deepEqual(p.points.map((x) => x.label), ['Left shoulder', 'Head', 'Right shoulder'])
  assert.equal(p.status, 'confirmed')
  assert.equal(p.bias, 'bear')
  const inv = find(path([120, 110, 116, 102, 116, 110, 120], 7), 'Inverse head and shoulders')!
  assert.equal(inv.bias, 'bull')
  assert.equal(inv.status, 'confirmed')
})

test('ascending triangle: flat highs, rising lows, two lines drawn, resistance zone found at the ceiling', () => {
  const c = path([110, 120, 100, 120, 106, 120, 112, 120, 119], 6)
  const t = find(c, 'Ascending triangle')!
  assert.ok(t, names(c).join(','))
  assert.equal(t.status, 'forming')
  // The same shape closing under its rising lower line is reported as a breakdown.
  assert.equal(find(path([110, 120, 100, 120, 106, 120, 112, 120, 114], 6), 'Ascending triangle')?.status ?? find(path([110, 120, 100, 120, 106, 120, 112, 120, 114], 6), 'Symmetrical triangle')?.status, 'breakdown')
  assert.deepEqual(t.lines.map((l) => l.role), ['upper line', 'lower line'])
  const z = scanPatterns(c).patterns.find((p) => p.kind === 'zone' && p.name === 'Resistance zone')!
  assert.ok(z && z.points.length >= 3, 'the 120 ceiling is a zone with several turns')
})

test('candles: bullish engulfing and hammer after a drop; volume spike measured against the 20-candle average', () => {
  const base = path([120, 100], 30)
  const last = base[base.length - 1]
  const engulf = [...base, { ...last, openTime: last.openTime + 3_600_000, open: 100, close: 98, high: 100.2, low: 97.8 }, { ...last, openTime: last.openTime + 7_200_000, open: 97.6, close: 101, high: 101.2, low: 97.4, volume: 450 }]
  const n = names(engulf)
  assert.ok(n.includes('Bullish engulfing:active'), n.join(','))
  assert.ok(n.some((x) => x.startsWith('Volume spike (4.5× average)')), n.join(','))
  const hammer = [...base, { ...last, openTime: last.openTime + 3_600_000, open: 99.6, close: 99.8, high: 99.85, low: 97.5 }]
  assert.ok(names(hammer).includes('Hammer:active'), names(hammer).join(','))
})

test('every pattern says what confirms it, what cancels it and what it means, and none claims to predict', () => {
  const all = [path([100, 120, 110, 120, 104], 8), path([100, 110, 104, 118, 104, 110, 100], 7), path([110, 120, 100, 120, 106, 120, 112, 120, 119], 6)].flatMap((c) => scanPatterns(c).patterns)
  assert.ok(all.length >= 5)
  for (const p of all) {
    assert.ok(p.meaning && p.confirm && p.invalidate, p.name)
    assert.doesNotMatch(`${p.meaning} ${p.confirm} ${p.invalidate}`, /\b(profitable|proven|guaranteed?|superior|best|will (rise|fall))\b|expected return/i, p.name)
  }
  assert.match(UNTESTED, /not tested/)
  assert.match(scanPatterns(path([100, 120, 110, 120, 104], 8)).summary.text, /not a signal/)
})

test('picture schema: every object closed and fully required, no numeric or length limits', () => {
  const walk = (s: Record<string, unknown>) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false)
      assert.deepEqual([...(s.required as string[])].sort(), Object.keys(s.properties as object).sort())
      for (const v of Object.values(s.properties as Record<string, Record<string, unknown>>)) walk(v)
    }
    if (s.type === 'array') walk(s.items as Record<string, unknown>)
    if (Array.isArray(s.anyOf)) for (const v of s.anyOf) walk(v)
    for (const bad of ['minimum', 'maximum', 'minLength', 'maxLength', 'multipleOf']) assert.equal(bad in s, false, bad)
  }
  walk(PICTURE_SCHEMA)
})

test('picture answer is cleaned: positions clamped, lists capped, unknown values replaced, prices kept as read', () => {
  const r = cleanPictureRead({
    readable: true, symbol: 'TEST FIXTURE', timeframe: '1H', trend: 'sideways?', summary: 'x'.repeat(2000),
    patterns: Array.from({ length: 12 }, (_, i) => ({ name: `P${i}`, bias: 'up', status: 'confirmed', box: { x0: 1.4, y0: -2, x1: 0.2, y1: 0.5 }, meaning: 'm', confirm: 'c', invalidate: 'i' })),
    levels: [{ kind: 'support', price: '101.25', y: 0.7, y2: null, note: 'n' }, { kind: 'weird', price: null, y: 3, y2: 9, note: '' }],
    candles: [{ name: 'Hammer', bias: 'bull', x: 0.9, y: 0.8, note: '' }],
    plan: { stance: 'yolo', entry: '100', stop: '98', target: '106', rr: 3000, why: 'w' },
    invalidation: 'below 98', unreadable: ['right axis'], confidence: 'certain', confidenceWhy: 'clear',
  })
  assert.equal(r.kind, 'AI PICTURE READ')
  assert.equal(r.trend, 'unclear')
  assert.equal(r.summary.length, 700)
  assert.equal(r.patterns.length, 8)
  assert.deepEqual(r.patterns[0].box, { x0: 0.2, y0: 0, x1: 1, y1: 0.5 })
  assert.equal(r.patterns[0].bias, 'neutral')
  assert.deepEqual([r.levels[0].price, r.levels[1].kind, r.levels[1].y, r.levels[1].y2], ['101.25', 'support', 1, 1])
  assert.equal(r.plan.stance, 'no-trade')
  assert.equal(r.plan.rr, null, 'an absurd reward-to-risk is dropped, not shown')
  assert.equal(r.confidence, 'low')
  assert.equal(cleanPictureRead(null).readable, false)
})

test('walled off: engine never imports the scanner; the page GETs its own routes and POSTs one picture with the CSRF token', () => {
  for (const f of ['watch.ts', 'fusion.ts', 'riskEngine.ts', 'paperTrader.ts', 'config.ts']) {
    const p = join(ROOT, 'src', f)
    if (existsSync(p)) assert.doesNotMatch(readFileSync(p, 'utf8'), /scanner\//, f)
  }
  const page = readFileSync(join(ROOT, 'web', 'js', 'scanner.js'), 'utf8')
  const urls = [...page.matchAll(/(?:fetch|getJson)\(\s*'([^']*)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(urls)].sort(), ['/api/config', '/api/scanner', '/api/scanner/market?key=', '/api/scanner/picture'])
  assert.match(page, /'x-mrcash-csrf': cfg\.csrf/)
  const server = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8')
  assert.match(server, /path === '\/api\/scanner\/picture' && req\.method === 'POST'/)
  assert.match(server, /checkStateChange\(req\.headers, CSRF_TOKEN/)
})
