/**
 * Order flow from the tape: delta, CVD, footprint, tape speed, large
 * prints, book imbalance and the absorption heuristic — each against a
 * hand computation on a small, exact stream.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TradeAccumulator } from '../../src/features/trades.ts'
import { deltaOf } from '../../src/features/delta.ts'
import { cvdBetween, cvdSinceTrusted } from '../../src/features/cvd.ts'
import { footprint } from '../../src/features/footprint.ts'
import { tapeSpeed } from '../../src/features/tape.ts'
import { largeTrades } from '../../src/features/largeTrades.ts'
import { bookImbalance } from '../../src/features/imbalance.ts'
import { absorption } from '../../src/features/absorption.ts'
import type { Book, Trade } from '../../src/data/types.ts'
import type { TapeBucket } from '../../src/features/trades.ts'

const STEP = 300_000
const t0 = Date.UTC(2026, 0, 15, 14, 0)
const trade = (id: number, time: number, price: number, qty: number, side: 'buy' | 'sell'): Trade => ({ id, time, price, qty, side, receivedAt: time, source: 'stream' })

/** An accumulator, trusted from before t0, with the given trades added. */
function withTrades(trades: Trade[], bigUsd = 1_000_000): TradeAccumulator {
  const tape = new TradeAccumulator(STEP, 2, bigUsd)
  tape.markUp(t0 - 1000)
  for (const t of trades) tape.add(t)
  return tape
}

test('delta is buyer-initiated minus seller-initiated volume, in units and in dollars', () => {
  const tape = withTrades([
    trade(1, t0 + 10, 100, 3, 'buy'),
    trade(2, t0 + 20, 100, 1, 'sell'),
    trade(3, t0 + 30, 102, 1, 'sell'),
  ])
  const d = deltaOf(tape.bucket(t0)!)
  assert.equal(d.buyV, 3)
  assert.equal(d.sellV, 2)
  assert.equal(d.delta, 1)
  assert.equal(d.buyUsd, 300)
  assert.equal(d.sellUsd, 100 + 102)
  assert.equal(d.deltaUsd, 300 - 202)
  assert.equal(d.volume, 5)
  assert.equal(d.trades, 3)
  assert.ok(Math.abs(d.buyShare - 3 / 5) < 1e-12)
})

test('CVD is the running delta from the anchor, and is complete only when every trade since it was seen', () => {
  const tape = withTrades([
    trade(1, t0 + 10, 100, 5, 'buy'),
    trade(2, t0 + STEP + 10, 100, 2, 'sell'),
    trade(3, t0 + 2 * STEP + 10, 100, 1, 'buy'),
  ])
  const cvd = cvdBetween(tape, t0, t0 + 2 * STEP)!
  assert.equal(cvd.value, 5 - 2 + 1)
  assert.equal(cvd.valueUsd, 500 - 200 + 100)
  assert.equal(cvd.anchoredAt, t0)
  assert.equal(cvd.candles, 3)
  assert.equal(cvd.complete, true)
  // A range with a missing middle bucket is incomplete but still returns what it has.
  const sparse = withTrades([trade(1, t0 + 10, 100, 5, 'buy'), trade(2, t0 + 2 * STEP + 10, 100, 1, 'buy')])
  const g = cvdBetween(sparse, t0, t0 + 2 * STEP)!
  assert.equal(g.complete, false)
  assert.equal(g.value, 6)
  assert.equal(cvdBetween(sparse, t0 + 5 * STEP, t0 + 6 * STEP), null, 'no buckets at all is null, never zero')
})

test('after a gap the anchored CVD is incomplete, and a CVD restarted from the trusted point is marked', () => {
  const tape = withTrades([trade(1, t0 + 10, 100, 5, 'buy')])
  tape.markGap(t0 + STEP) // the stream missed something at the second candle
  tape.add(trade(2, t0 + STEP + 10, 100, 2, 'buy'))
  tape.add(trade(3, t0 + 2 * STEP + 10, 100, 1, 'buy'))
  const anchored = cvdBetween(tape, t0, t0 + 2 * STEP)!
  assert.equal(anchored.complete, false, 'the anchor predates the gap')
  const restarted = cvdSinceTrusted(tape, t0 + 2 * STEP)!
  assert.equal(restarted.complete, true)
  assert.equal(restarted.restartedAt, t0 + STEP)
  assert.equal(restarted.value, 2 + 1, 'only the buckets from the gap onward')
})

test('the footprint splits a candle into price buckets of buy vs sell, and they sum to the candle volume', () => {
  const tape = withTrades([
    trade(1, t0 + 10, 100.0, 2, 'buy'),
    trade(2, t0 + 20, 100.0, 1, 'sell'),
    trade(3, t0 + 30, 100.6, 3, 'buy'),
    trade(4, t0 + 40, 100.6, 1, 'sell'),
  ])
  const b = tape.bucket(t0)!
  const fp = footprint(b, tape.tick(), 0.5) // buckets of $0.50: 100.0 and 100.5
  const sum = fp.rows.reduce((s, r) => s + r.total, 0)
  assert.ok(Math.abs(sum - b.v) < 1e-9, 'footprint totals equal the candle volume')
  assert.equal(fp.volume, 7)
  // Highest price first.
  assert.ok(fp.rows[0].price >= fp.rows[fp.rows.length - 1].price)
  const hi = fp.rows.find((r) => r.price === 100.5)!
  assert.equal(hi.buy, 3)
  assert.equal(hi.sell, 1)
  assert.equal(hi.delta, 2)
  assert.equal(fp.pocPrice, 100.5, 'the busiest bucket by total volume')
})

test('tape speed compares prints in the last window with the window before it', () => {
  const trades: Trade[] = []
  let id = 0
  // 2 trades in the window before, 6 in the last window (60s each).
  for (let k = 0; k < 2; k++) trades.push(trade(++id, t0 + 1000 + k * 100, 100, 1, 'buy'))
  for (let k = 0; k < 6; k++) trades.push(trade(++id, t0 + 61_000 + k * 100, 100, 1, 'buy'))
  const tape = withTrades(trades)
  const s = tapeSpeed(tape, t0 + 120_000, 60)
  assert.equal(s.tradesPerMinute, 6)
  assert.equal(s.previousPerMinute, 2)
  assert.equal(s.acceleration, 3)
  assert.equal(s.label, 'accelerating')
  // A window whose previous 60s held the burst but whose own 60s is empty.
  assert.equal(tapeSpeed(tape, t0 + 180_000, 60).label, 'slowing')
})

test('large prints over a window are counted by side, with the biggest picked out', () => {
  const tape = withTrades([
    trade(1, t0 + 10, 100, 20, 'buy'),   // $2,000
    trade(2, t0 + 20, 100, 5, 'sell'),   // $500
    trade(3, t0 + 30, 100, 30, 'buy'),   // $3,000
  ], 1000) // threshold $1,000
  const r = largeTrades(tape, t0 + 60_000, 15)
  assert.equal(r.count, 2, 'the $500 sell is below the threshold')
  assert.equal(r.buys, 2)
  assert.equal(r.sells, 0)
  assert.equal(r.thresholdUsd, 1000)
  assert.equal(r.largest!.usd, 3000)
  assert.equal(r.netUsd, 5000)
})

test('book imbalance weighs resting dollars within a band either side of the mid', () => {
  const book: Book = {
    bids: [{ price: 100, qty: 3 }, { price: 99.5, qty: 2 }, { price: 90, qty: 100 }],
    asks: [{ price: 100.5, qty: 1 }, { price: 101, qty: 1 }, { price: 130, qty: 100 }],
    lastUpdateId: 1, time: t0, receivedAt: t0, source: 'stream', synced: true,
  }
  const imb = bookImbalance(book, 1)! // mid ~100.25, band 1% ≈ 99.25–101.25
  const bidUsd = 100 * 3 + 99.5 * 2 // the $90 bid is outside the band
  const askUsd = 100.5 * 1 + 101 * 1 // the $130 ask is outside
  assert.ok(Math.abs(imb.bidUsd - bidUsd) < 1e-9)
  assert.ok(Math.abs(imb.askUsd - askUsd) < 1e-9)
  assert.ok(Math.abs(imb.imbalance - bidUsd / (bidUsd + askUsd)) < 1e-12)
  assert.equal(imb.lean, 'bids deeper')
  assert.ok(imb.spreadPct > 0)
})

/** A bucket built by hand for the absorption test. */
function bucketOf(buyV: number, sellV: number, high: number, low: number): TapeBucket {
  return { openTime: t0, pv: 0, v: buyV + sellV, p2v: 0, buyV, sellV, buyPv: 0, sellPv: 0, trades: 10, firstAt: t0, lastAt: t0 + 1000, high, low, hist: new Map(), histBuy: new Map(), histSell: new Map() }
}

test('absorption fires only on heavy, one-sided volume that failed to move price — and stays a labelled hint', () => {
  const rule = { volumeMultiple: 2, maxRangeAtr: 0.25, minDeltaShare: 0.3, minHistory: 6 }
  const prev = Array.from({ length: 6 }, () => bucketOf(5, 5, 100.1, 99.9)) // typical volume 10
  const atr = 4
  // Heavy (30 vs typical 10 = 3×), tight (range 0.4 = 0.1 ATR ≤ 0.25), one-sided (delta 20/30 = 0.67).
  const heavy = absorption(bucketOf(25, 5, 100.2, 99.8), prev, atr, rule)!
  assert.equal(heavy.detected, true)
  assert.equal(heavy.side, 'buyers absorbed')
  assert.equal(heavy.hint, 'bearish', 'heavy buying that did not lift price is sellers holding')
  assert.ok(heavy.volumeMultiple >= 2 && heavy.rangeAtr <= 0.25 && heavy.deltaShare >= 0.3)
  // Same volume and one-sidedness but a wide range: not absorption.
  assert.equal(absorption(bucketOf(25, 5, 102, 98), prev, atr, rule)!.detected, false)
  // Heavy and tight but balanced: not absorption.
  assert.equal(absorption(bucketOf(15, 15, 100.2, 99.8), prev, atr, rule)!.detected, false)
  // Not enough history: no reading at all.
  assert.equal(absorption(bucketOf(25, 5, 100.2, 99.8), prev.slice(0, 3), atr, rule), null)
})
