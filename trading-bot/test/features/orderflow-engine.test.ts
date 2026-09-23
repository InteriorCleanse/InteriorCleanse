/**
 * The order-flow block through the feature engine: available and exact
 * when the tape saw the whole candle, and — the honest part — unavailable
 * with a reason the moment the stream has a gap, with CVD restarting from
 * a marked point rather than silently carrying a wrong number.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FeatureEngine } from '../../src/features/engine.ts'
import { TradeAccumulator } from '../../src/features/trades.ts'
import type { Candle, SessionName } from '../../src/types.ts'
import type { Book, Trade } from '../../src/data/types.ts'

const STEP = 300_000
const t0 = Date.UTC(2026, 0, 15, 14, 0)
const mk = (openTime: number): Candle => ({ openTime, closeTime: openTime + STEP - 1, open: 100, high: 100.5, low: 99.5, close: 100, volume: 4 })
const trade = (id: number, time: number, price: number, qty: number, side: 'buy' | 'sell'): Trade => ({ id, time, price, qty, side, receivedAt: time, source: 'stream' })
const ctx = (session: SessionName | null = 'newYork', book?: Book | null) => ({ dayKey: 'D', session, atr: 4, book })

test('with the tape trusting the whole day, delta, CVD, footprint and speed are available and from the tape', () => {
  const candles = [mk(t0), mk(t0 + STEP), mk(t0 + 2 * STEP)]
  const tape = new TradeAccumulator(STEP, 2, 1_000_000)
  tape.markUp(t0 - 1000)
  tape.add(trade(1, t0 + 10, 100, 3, 'buy'))
  tape.add(trade(2, t0 + 20, 100, 1, 'sell'))
  tape.add(trade(3, t0 + STEP + 10, 100, 2, 'buy'))
  tape.add(trade(4, t0 + 2 * STEP + 10, 100, 1, 'sell'))
  const fe = new FeatureEngine(tape)
  let s = fe.step(candles, 0, ctx())
  for (let i = 1; i < candles.length; i++) s = fe.step(candles, i, ctx())
  const f = s.flow
  assert.equal(f.stream.trusted, true)
  assert.equal(f.delta.available, true)
  assert.equal(f.delta.source, 'trades')
  assert.equal(f.delta.value!.delta, -1, 'the last candle: one sell')
  assert.equal(f.cvd.available, true)
  assert.equal(f.cvd.value!.complete, true)
  assert.equal(f.cvd.value!.value, 3 - 1 + 2 - 1, 'running delta over the whole day')
  assert.equal(f.footprint.available, true)
  assert.ok(Math.abs(f.footprint.value!.rows.reduce((a, r) => a + r.total, 0) - 1) < 1e-9)
  assert.equal(f.tapeSpeed.available, true)
  // No book was provided, so imbalance is unavailable and says so.
  assert.equal(f.bookImbalance.available, false)
  assert.match(f.bookImbalance.note ?? '', /No order book|book update/)
  // The chart series carries delta and CVD.
  const pt = fe.series().slice(-1)[0]
  assert.equal(pt.delta, -1)
  assert.equal(pt.cvd, 3)
})

test('a gap makes this candle\'s flow unavailable with a reason, and CVD restarts from the trusted point', () => {
  const candles = [mk(t0), mk(t0 + STEP), mk(t0 + 2 * STEP)]
  const tape = new TradeAccumulator(STEP, 2, 1_000_000)
  tape.markUp(t0 - 1000)
  tape.add(trade(1, t0 + 10, 100, 5, 'buy'))
  const fe = new FeatureEngine(tape)
  fe.step(candles, 0, ctx())
  // The stream reports a gap PART WAY THROUGH the second candle, so that
  // candle was not seen in full even though a trade landed in it.
  const gapAt = t0 + STEP + 50
  tape.add(trade(2, t0 + STEP + 10, 100, 2, 'buy'))
  tape.markGap(gapAt)
  tape.add(trade(3, t0 + 2 * STEP + 10, 100, 1, 'buy'))
  const s2 = fe.step(candles, 1, ctx())
  // The second candle's own bucket opened before trust was restored: not exact.
  assert.equal(s2.flow.delta.available, false)
  assert.match(s2.flow.delta.note ?? '', /gap|late|down/i)
  assert.equal(s2.flow.cvd.available, false, 'the day anchor predates the gap')
  const s3 = fe.step(candles, 2, ctx())
  // The third candle opened after trust was restored: its delta is exact again.
  assert.equal(s3.flow.delta.available, true)
  assert.equal(s3.flow.cvd.available, false, 'day-anchored CVD still spans the gap')
  assert.equal(s3.flow.cvdSinceGap.available, true)
  assert.equal(s3.flow.cvdSinceGap.value!.restartedAt, gapAt)
  assert.equal(s3.flow.cvdSinceGap.value!.value, 1, 'only the first whole bucket after trust returned')
})

test('with the stream down, every order-flow reading is unavailable — nothing is faked from candles', () => {
  const candles = [mk(t0), mk(t0 + STEP)]
  const tape = new TradeAccumulator(STEP, 2, 1_000_000) // never markUp: the stream never came up
  const fe = new FeatureEngine(tape)
  const s = fe.step(candles, 1, ctx())
  const f = s.flow
  assert.equal(f.stream.trusted, false)
  for (const r of [f.delta, f.cvd, f.cvdSinceGap, f.tapeSpeed, f.largeTrades, f.footprint, f.absorption, f.bookImbalance]) {
    assert.equal(r.available, false)
    assert.notEqual(r.source, 'candles', 'order flow is never approximated from candles')
    assert.ok(r.note, 'and it says why')
  }
})

test('a fresh order book at the candle close gives an imbalance reading; a stale one does not', () => {
  const candles = [mk(t0)]
  const tape = new TradeAccumulator(STEP, 2, 1_000_000)
  tape.markUp(t0 - 1000)
  tape.add(trade(1, t0 + 10, 100, 1, 'buy'))
  const fe = new FeatureEngine(tape)
  const asOf = candles[0].closeTime
  const book = (receivedAt: number, synced = true): Book => ({
    bids: [{ price: 100, qty: 5 }, { price: 99.9, qty: 5 }], asks: [{ price: 100.1, qty: 1 }],
    lastUpdateId: 1, time: receivedAt, receivedAt, source: 'stream', synced,
  })
  const fresh = fe.step(candles, 0, ctx('newYork', book(asOf + 100)))
  assert.equal(fresh.flow.bookImbalance.available, true)
  assert.equal(fresh.flow.bookImbalance.value!.lean, 'bids deeper')
  // A book from long before the candle closed is not used.
  const stale = fe.step(candles, 0, ctx('newYork', book(asOf - 10 * STEP)))
  assert.equal(stale.flow.bookImbalance.available, false)
  // An unsynced book is not used either.
  const unsynced = fe.step(candles, 0, ctx('newYork', book(asOf + 100, false)))
  assert.equal(unsynced.flow.bookImbalance.available, false)
  assert.match(unsynced.flow.bookImbalance.note ?? '', /stitch/)
})

test('CVD anchors at the session when configured, so it resets when the session changes', async () => {
  const { config } = await import('../../config.ts')
  const original = config.features.cvdAnchor
  config.features.cvdAnchor = 'session'
  try {
    const candles = [mk(t0), mk(t0 + STEP), mk(t0 + 2 * STEP)]
    const tape = new TradeAccumulator(STEP, 2, 1_000_000)
    tape.markUp(t0 - 1000)
    tape.add(trade(1, t0 + 10, 100, 5, 'buy'))
    tape.add(trade(2, t0 + STEP + 10, 100, 3, 'buy'))
    tape.add(trade(3, t0 + 2 * STEP + 10, 100, 1, 'buy'))
    const fe = new FeatureEngine(tape)
    fe.step(candles, 0, ctx('london'))
    fe.step(candles, 1, ctx('london'))
    // The session changes on the third candle: the session-anchored CVD counts only from here.
    const s = fe.step(candles, 2, ctx('newYork'))
    assert.equal(s.flow.cvd.value!.value, 1, 'reset at the session boundary')
    assert.equal(s.flow.cvd.value!.anchoredAt, t0 + 2 * STEP)
  } finally {
    config.features.cvdAnchor = original
  }
})
