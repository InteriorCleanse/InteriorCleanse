/**
 * THE STRATEGY BUILDER — plain English to rules, rules to code, code to an
 * honest backtest. Every candle series here is a SYNTHETIC TEST FIXTURE built
 * in the test, and the store is the test's temp data directory.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStrategy, renderCode, backtestSpec, holds, runBuilder, saveStrategy, savedStrategies, deleteStrategy, EXAMPLES, MIN_OOS_TRADES } from '../../src/research/builder.ts'
import type { Spec } from '../../src/research/builder.ts'
import type { Candle } from '../../src/types.ts'

const FIVE = 300_000
/** SYNTHETIC: a wandering 5-minute series with regular swings, so RSI and averages both move. */
function series(n: number, start = Date.parse('2026-06-01T00:00:00Z')): Candle[] {
  const out: Candle[] = []
  let p = 60_000
  for (let i = 0; i < n; i++) {
    const t = start + i * FIVE
    const o = p
    const c = p * (1 + Math.sin(i / 9) * 0.004 + Math.sin(i / 47) * 0.002)
    out.push({ openTime: t, closeTime: t + FIVE - 1, open: o, high: Math.max(o, c) * 1.0008, low: Math.min(o, c) * 0.9992, close: c, volume: 10 + (i % 17 === 0 ? 40 : Math.abs(Math.sin(i)) * 5) })
    p = c
  }
  return out
}

test('plain English becomes rules: RSI, averages, stop, target, early exit and time limit', () => {
  const p = parseStrategy('Buy when RSI(14) is below 30 and price is above the 200 EMA. Sell when RSI is above 60. Stop 1.5 ATR, take profit 2R. Exit after 36 candles.')
  assert.equal(p.error, null)
  const s = p.spec!
  assert.equal(s.direction, 'long')
  assert.deepEqual(s.entry, [{ kind: 'rsi', period: 14, op: '<', value: 30 }, { kind: 'price-ma', ma: 'ema', period: 200, op: 'above' }])
  assert.deepEqual(s.exit, [{ kind: 'rsi', period: 14, op: '>', value: 60 }])
  assert.deepEqual(s.stop, { kind: 'atr', value: 1.5 })
  assert.deepEqual(s.target, { kind: 'r', value: 2 })
  assert.equal(s.maxBars, 36)
  assert.equal(p.assumed.length, 0, 'nothing had to be assumed')
})

test('the other phrases: breakouts, volume, crosses, streaks, moves, shorts, percent stops and word numbers', () => {
  const b = parseStrategy('Buy when price breaks above the 20 candle high and volume is 2x the average. Stop 1%, take profit 2%.').spec!
  assert.deepEqual(b.entry, [{ kind: 'breakout', side: 'high', bars: 20 }, { kind: 'volume', mult: 2, bars: 20 }])
  assert.deepEqual(b.stop, { kind: 'pct', value: 1 }); assert.deepEqual(b.target, { kind: 'pct', value: 2 })
  const x = parseStrategy('Buy when the 20 EMA crosses above the 50 EMA. No take profit.').spec!
  assert.deepEqual(x.entry, [{ kind: 'ma-cross', ma: 'ema', fast: 20, slow: 50, op: 'crossAbove' }]); assert.equal(x.target, null)
  const f = parseStrategy('Buy when price drops 2% in 12 candles and three red candles in a row').spec!
  assert.equal(f.entry.length, 2)
  assert.ok(f.entry.some((e) => e.kind === 'streak' && e.color === 'red' && e.count === 3))
  assert.ok(f.entry.some((e) => e.kind === 'move' && e.dir === 'down' && e.pct === 2 && e.bars === 12))
  const sh = parseStrategy('Short when RSI(14) is above 75. Cover when RSI is below 45. 3:1').spec!
  assert.equal(sh.direction, 'short'); assert.deepEqual(sh.exit, [{ kind: 'rsi', period: 14, op: '<', value: 45 }]); assert.deepEqual(sh.target, { kind: 'r', value: 3 })
  assert.deepEqual(parseStrategy('buy on a golden cross').spec!.entry, [{ kind: 'ma-cross', ma: 'sma', fast: 50, slow: 200, op: 'crossAbove' }])
})

test('it says what it assumed and what it did not understand, and never guesses a news rule', () => {
  const p = parseStrategy('Buy when RSI is below 25. Also short airlines after a plane crash headline. Moon soon.')
  assert.ok(p.spec)
  assert.ok(p.assumed.some((a) => /No stop/.test(a)) && p.assumed.some((a) => /No take-profit/.test(a)) && p.assumed.some((a) => /No time limit/.test(a)))
  assert.ok(p.ignored.some((i) => /news-event rule/.test(i)), p.ignored.join(' | '))
  assert.ok(p.ignored.some((i) => /moon soon/.test(i)))
  const none = parseStrategy('make me rich')
  assert.equal(none.spec, null); assert.match(none.error!, /No entry rule/)
  assert.match(parseStrategy('').error!, /Describe a strategy/)
})

test('every example parses, and the code shows each rule', () => {
  for (const e of EXAMPLES) {
    const p = parseStrategy(e.text)
    assert.ok(p.spec, `${e.name}: ${p.error}`)
    const code = renderCode(p.spec!, e.name)
    assert.match(code, /BACKTEST ONLY/)
    assert.match(code, /entry: \(i\) =>/)
    assert.equal(p.ignored.length, 0, `${e.name} ignored: ${p.ignored.join(' | ')}`)
  }
})

test('conditions read only closed candles: changing a later candle never changes an earlier signal', () => {
  const c = series(400)
  const spec: Spec = parseStrategy('Buy when RSI(14) is below 35 and price is above the 50 SMA').spec!
  const s1 = { close: c.map((k) => k.close), high: c.map((k) => k.high), low: c.map((k) => k.low), open: c.map((k) => k.open), volume: c.map((k) => k.volume), cache: new Map() }
  const before = Array.from({ length: 300 }, (_, i) => spec.entry.every((x) => holds(x, s1, i)))
  const c2 = c.map((k, i) => (i >= 300 ? { ...k, close: k.close * 1.5, high: k.high * 1.5 } : k)) // SYNTHETIC: rewrite the future
  const s2 = { close: c2.map((k) => k.close), high: c2.map((k) => k.high), low: c2.map((k) => k.low), open: c2.map((k) => k.open), volume: c2.map((k) => k.volume), cache: new Map() }
  const after = Array.from({ length: 300 }, (_, i) => spec.entry.every((x) => holds(x, s2, i)))
  assert.deepEqual(after, before)
})

test('the backtest fills after the signal, splits in and out of sample, and labels a thin record NOT ENOUGH DATA', () => {
  const c = series(3000)
  const spec = parseStrategy('Buy when RSI(14) is below 35. Sell when RSI is above 60. Stop 1%, take profit 1.5%. Exit after 30 candles.').spec!
  const r = backtestSpec(spec, c)
  assert.equal(r.label, 'BACKTEST')
  assert.ok(r.trades.length > 0, 'the fixture produces trades')
  for (const t of r.trades) { assert.ok(t.time > t.signalAt, 'filled after the signal candle closed'); assert.ok(t.exitTime >= t.time) }
  for (let k = 1; k < r.trades.length; k++) assert.ok(r.trades[k].time > r.trades[k - 1].exitTime - 1, 'one position at a time')
  assert.ok(r.trades.some((t) => t.sample === 'IN-SAMPLE') && r.trades.some((t) => t.sample === 'OUT-OF-SAMPLE'))
  assert.equal(r.inSample.trades + r.outOfSample.trades, r.all.trades)
  assert.ok(r.trades.some((t) => t.reason === 'rule'), 'the early-exit rule fires')
  if (r.outOfSample.trades < MIN_OOS_TRADES) assert.equal(r.verdict, 'NOT ENOUGH DATA')
  assert.equal(r.curve.length, r.trades.length)
  const tiny = backtestSpec(spec, series(250))
  assert.equal(tiny.verdict, 'NOT ENOUGH DATA'); assert.match(tiny.line, /NOT ENOUGH DATA/)
})

test('a run counts as a trial, and saved strategies persist, replace by name and delete', () => {
  const c = series(1200)
  const a = runBuilder('Buy when RSI(14) is below 35. Stop 1%, take profit 1.5%.', c)
  const b = runBuilder('Buy when RSI(14) is below 30. Stop 1%, take profit 1.5%.', c)
  assert.ok(a.report && b.report)
  assert.ok(b.report!.trials > a.report!.trials, 'the second try is deflated harder than the first')
  assert.equal(runBuilder('Buy when RSI is below 30', c.slice(0, 100)).report, null, 'too few candles: no backtest rather than a number')
  saveStrategy('Dip buyer', 'Buy when RSI(14) is below 35.', a.report)
  saveStrategy('dip buyer', 'Buy when RSI(14) is below 30.', b.report)
  const list = savedStrategies()
  assert.equal(list.length, 1, 'same name replaces'); assert.equal(list[0].text, 'Buy when RSI(14) is below 30.')
  assert.equal(deleteStrategy(list[0].id).length, 0)
})
