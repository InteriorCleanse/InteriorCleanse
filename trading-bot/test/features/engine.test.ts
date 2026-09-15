/**
 * The feature engine end to end: a snapshot for every candle, every
 * feature saying where it came from, the tape making VWAP exact only
 * when it covered the whole anchor, and the market-state vote reading
 * the same numbers whether or not a snapshot is handed to it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupDay, mk, STEP } from '../fixtures/candles.ts'
import { FeatureEngine } from '../../src/features/engine.ts'
import { TradeAccumulator } from '../../src/features/trades.ts'
import { FEATURE_VERSION } from '../../src/features/types.ts'
import { vwapFromCandles } from '../../src/features/vwap.ts'
import { IctEngine } from '../../src/ictStrategy.ts'
import { assessMarket } from '../../src/regime.ts'
import { sessionAt, tradingDayKey } from '../../src/sessions.ts'
import { atrAt } from '../../src/structure.ts'
import type { Trade } from '../../src/data/types.ts'
import type { FeatureSnapshot } from '../../src/features/types.ts'

function everyFeature(s: FeatureSnapshot) {
  return [s.atr, s.hourly, s.momentum, s.volatility, s.vwapDay, s.vwapSession, s.vwapDayTape, s.profileDay]
}

test('every closed candle gets a snapshot, and every feature says whether it is available, where it came from and as of when', () => {
  const { candles } = setupDay()
  const fe = new FeatureEngine(null)
  for (let i = 0; i < candles.length; i++) {
    const s = fe.step(candles, i, { dayKey: tradingDayKey(candles[i].openTime), session: sessionAt(candles[i].openTime), atr: atrAt(candles, i) })
    assert.equal(s.version, FEATURE_VERSION)
    assert.equal(s.index, i)
    assert.equal(s.asOf, candles[i].closeTime)
    for (const f of everyFeature(s)) {
      assert.equal(typeof f.available, 'boolean')
      assert.ok(['trades', 'candles', 'none'].includes(f.source))
      assert.equal(f.asOf, candles[i].closeTime)
      if (!f.available) assert.equal(f.value, null)
      if (!f.available) assert.ok(f.note, 'an unavailable feature says why')
    }
    assert.equal(s.hourly.available, false, 'the fixture day is far shorter than 60 hours')
    assert.equal(s.vwapDayTape.available, false, 'no tape in this run')
    assert.equal(s.tape.exact, false)
  }
  const last = fe.latest!
  assert.equal(last.vwapDay.source, 'candles')
  assert.equal(last.vwapDay.approximate, true)
  assert.equal(last.profileDay.approximate, true)
  assert.ok(last.profileDay.value && last.profileDay.value.val <= last.profileDay.value.poc && last.profileDay.value.poc <= last.profileDay.value.vah)
  // The day anchor is the first candle of the trading day; the fixture is one day long.
  assert.ok(Math.abs(last.vwapDay.value!.vwap - vwapFromCandles(candles, 0, candles.length - 1)!.vwap) < 1e-12)
  assert.equal(fe.series().length, candles.length)
  assert.equal(fe.series(candles[10].openTime).length, candles.length - 10)
})

test('the session VWAP re-anchors when the session changes and is unavailable between sessions', () => {
  const { candles } = setupDay()
  const fe = new FeatureEngine(null)
  let sawBetween = false
  let sawLondon: FeatureSnapshot | null = null
  let londonStart = -1
  for (let i = 0; i < candles.length; i++) {
    const session = sessionAt(candles[i].openTime)
    if (session === 'london' && londonStart < 0) londonStart = i
    const s = fe.step(candles, i, { dayKey: tradingDayKey(candles[i].openTime), session, atr: atrAt(candles, i) })
    if (session === null) { sawBetween = true; assert.equal(s.vwapSession.available, false); assert.match(s.vwapSession.note ?? '', /between sessions/i) }
    if (session === 'london') sawLondon = s
  }
  assert.ok(sawBetween && sawLondon)
  assert.ok(Math.abs(sawLondon!.vwapSession.value!.vwap - vwapFromCandles(candles, londonStart, sawLondon!.index)!.vwap) < 1e-12)
  assert.equal(sawLondon!.vwapSession.value!.anchoredAt, candles[londonStart].openTime)
})

test('with a tape that covered the whole day the VWAP and profile are exact; after a gap they fall back to candles and say so', () => {
  const t0 = Date.UTC(2026, 0, 15, 14, 0)
  const candles = Array.from({ length: 6 }, (_, i) => ({ ...mk(t0 + i * STEP, 100, 101, 99, 100), volume: 10 }))
  const tape = new TradeAccumulator(STEP)
  tape.markUp(t0 - 1000)
  const trade = (id: number, time: number, price: number, qty: number): Trade => ({ id, time, price, qty, side: 'buy', receivedAt: time, source: 'stream' })
  let id = 0
  for (let i = 0; i < 6; i++) { tape.add(trade(++id, t0 + i * STEP + 10, 100 + i, 1)); tape.add(trade(++id, t0 + i * STEP + 20, 100 + i, 1)) }
  const fe = new FeatureEngine(tape)
  const ctx = (i: number) => ({ dayKey: 'D', session: 'newYork' as const, atr: 2 })
  let s = fe.step(candles, 0, ctx(0))
  for (let i = 1; i < 3; i++) s = fe.step(candles, i, ctx(i))
  assert.equal(s.tape.exact, true)
  assert.equal(s.vwapDayTape.available, true)
  assert.equal(s.vwapDay.source, 'trades')
  assert.equal(s.vwapDay.approximate, false)
  assert.ok(Math.abs(s.vwapDay.value!.vwap - 101) < 1e-12, 'trades at 100, 101, 102, equal size')
  assert.equal(s.vwapSession.source, 'trades')
  assert.equal(s.profileDay.source, 'trades')
  assert.equal(s.profileDay.approximate, false)
  // The stream reports a gap: from here the day's tape is no longer complete.
  tape.markGap(t0 + 3 * STEP)
  for (let i = 3; i < 6; i++) s = fe.step(candles, i, ctx(i))
  assert.equal(s.tape.exact, false)
  assert.equal(s.vwapDayTape.available, false)
  assert.match(s.vwapDayTape.note ?? '', /gap/)
  assert.equal(s.vwapDay.available, true, 'the candle-based VWAP still exists')
  assert.equal(s.vwapDay.source, 'candles')
  assert.equal(s.vwapDay.approximate, true)
  assert.equal(s.profileDay.source, 'candles')
  assert.equal(s.profileDay.approximate, true)
  // A new day anchored after the gap is exact again.
  s = fe.step([...candles, { ...mk(t0 + 6 * STEP, 100, 101, 99, 100), volume: 10 }], 6, { dayKey: 'E', session: 'newYork', atr: 2 })
  assert.equal(s.vwapDayTape.available, false, 'no trades for the new day yet')
  tape.add(trade(++id, t0 + 6 * STEP + 5, 100, 1))
  s = fe.step([...candles, { ...mk(t0 + 6 * STEP, 100, 101, 99, 100), volume: 10 }], 6, { dayKey: 'E', session: 'newYork', atr: 2 })
  assert.equal(s.tape.exact, true)
})

test('the ICT engine carries a snapshot on every analysis, and the vote reads the same numbers with or without it', () => {
  const { candles } = setupDay()
  const engine = new IctEngine(candles)
  let a = engine.step(0)
  for (let i = 1; i < candles.length; i++) a = engine.step(i)
  assert.equal(a.features.index, candles.length - 1)
  assert.equal(a.features.atr.value, a.atr)
  assert.equal(a.features.dayKey, a.dayKey)
  const withSnapshot = assessMarket(candles, a, null, null, candles[candles.length - 1].closeTime)
  const without = assessMarket(candles, { ...a, features: { ...a.features, index: -1 } }, null, null, candles[candles.length - 1].closeTime)
  assert.deepEqual(withSnapshot.evidence, without.evidence)
  assert.equal(withSnapshot.volatility, without.volatility)
  assert.equal(withSnapshot.trend, without.trend)
  assert.equal(withSnapshot.strength, without.strength)
})
