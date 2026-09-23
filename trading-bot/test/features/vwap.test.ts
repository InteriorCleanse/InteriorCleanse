/** VWAP from candles and from the tape, against hand computations. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mk, STEP } from '../fixtures/candles.ts'
import { vwapFromCandles, candleSums, vwapFromSums, typicalPrice, addSums, emptySums } from '../../src/features/vwap.ts'
import { TradeAccumulator, priceTick } from '../../src/features/trades.ts'
import type { Trade } from '../../src/data/types.ts'

const c = (t: number, o: number, h: number, l: number, cl: number, v: number) => ({ ...mk(t, o, h, l, cl), volume: v })

test('VWAP from candles is Σ typical price × volume over Σ volume, with one-deviation bands', () => {
  const cs = [c(0, 100, 102, 98, 100, 10), c(STEP, 100, 104, 100, 102, 20), c(2 * STEP, 102, 103, 99, 100, 30)]
  const tps = cs.map(typicalPrice) // 100, 102, 100.6667
  const v = vwapFromCandles(cs, 0, 2)!
  const hand = (tps[0] * 10 + tps[1] * 20 + tps[2] * 30) / 60
  assert.ok(Math.abs(v.vwap - hand) < 1e-12)
  const variance = (10 * (tps[0] - hand) ** 2 + 20 * (tps[1] - hand) ** 2 + 30 * (tps[2] - hand) ** 2) / 60
  assert.ok(Math.abs(v.sd - Math.sqrt(variance)) < 1e-9)
  assert.ok(Math.abs(v.upper - (hand + v.sd)) < 1e-12 && Math.abs(v.lower - (hand - v.sd)) < 1e-12)
  assert.equal(v.anchoredAt, 0)
  assert.equal(v.candles, 3)
  assert.equal(v.volume, 60)
})

test('an anchor selects the candles: anchoring at the second candle ignores the first', () => {
  const cs = [c(0, 50, 50, 50, 50, 100), c(STEP, 100, 100, 100, 100, 1), c(2 * STEP, 100, 100, 100, 100, 1)]
  assert.equal(vwapFromCandles(cs, 1, 2)!.vwap, 100)
  assert.ok(vwapFromCandles(cs, 0, 2)!.vwap < 51)
  assert.equal(vwapFromCandles(cs, 2, 1), null, 'an empty range is not a reading')
})

test('no volume means no VWAP — never a made-up number', () => {
  const cs = [c(0, 100, 101, 99, 100, 0), c(STEP, 100, 101, 99, 100, 0)]
  assert.equal(vwapFromCandles(cs, 0, 1), null)
  assert.equal(vwapFromSums(emptySums(), 0, 0), null)
})

test('sums add up, so a running total over buckets equals one pass over the candles', () => {
  const cs = Array.from({ length: 6 }, (_, i) => c(i * STEP, 100 + i, 101 + i, 99 + i, 100 + i, 1 + i))
  const whole = candleSums(cs, 0, 5)
  const parts = addSums(candleSums(cs, 0, 2), candleSums(cs, 3, 5))
  assert.ok(Math.abs(whole.pv - parts.pv) < 1e-9 && whole.v === parts.v && Math.abs(whole.p2v - parts.p2v) < 1e-9)
})

test('VWAP from the tape equals the hand computation and is only "exact" when the stream covered the anchor', () => {
  const tape = new TradeAccumulator(STEP)
  const trade = (id: number, time: number, price: number, qty: number, side: 'buy' | 'sell' = 'buy'): Trade => ({ id, time, price, qty, side, receivedAt: time, source: 'stream' })
  tape.markUp(0)
  tape.add(trade(1, 10, 100, 2))
  tape.add(trade(2, 20, 110, 1, 'sell'))
  tape.add(trade(3, STEP + 5, 120, 1))
  const s = tape.sums(0, STEP)!
  assert.equal(s.trades, 3)
  assert.equal(s.buckets, 2)
  assert.equal(s.buyV, 3)
  assert.equal(s.sellV, 1)
  assert.equal(s.exact, true)
  const v = vwapFromSums(s, 0, 2)!
  assert.ok(Math.abs(v.vwap - (100 * 2 + 110 + 120) / 4) < 1e-12)
  // A range that starts before the stream came up cannot be exact.
  const late = new TradeAccumulator(STEP)
  late.markUp(STEP)
  late.add(trade(1, STEP + 1, 100, 1))
  late.add(trade(2, 2 * STEP + 1, 100, 1))
  assert.equal(late.sums(0, 2 * STEP)!.exact, false, 'the first bucket has no trades and predates the stream')
  assert.equal(late.sums(STEP, 2 * STEP)!.exact, true)
  // A gap resets trust from the moment it was noticed.
  late.markGap(2 * STEP)
  assert.equal(late.sums(STEP, 2 * STEP)!.exact, false)
  assert.equal(late.sums(2 * STEP, 2 * STEP)!.exact, true)
  // Down means nothing is trusted until it is back up.
  late.markDown()
  assert.equal(late.sums(2 * STEP, 2 * STEP)!.exact, false)
  assert.equal(late.sums(5 * STEP, 6 * STEP), null, 'no trades at all in the range')
})

test('the price tick is four orders of magnitude below the price', () => {
  assert.equal(priceTick(100_000), 10)
  assert.equal(priceTick(65_432), 1)
  assert.ok(Math.abs(priceTick(100) - 0.01) < 1e-12)
  assert.equal(priceTick(0), 1)
})
