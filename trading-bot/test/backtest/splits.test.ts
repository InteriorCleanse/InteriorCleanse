/**
 * Time splits. The one property that matters: the windows tile the range
 * exactly and never overlap, so no trade is scored twice and none is skipped.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timeSplit, tradesIn, tradeRange } from '../../src/backtest/splits.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'

function trade(time: number): TradeLike {
  return { time, rMultiple: 1, pnlUsd: 100, outcome: 'WIN' }
}

test('a split tiles the range contiguously: train→validation→oos with no gap', () => {
  const s = timeSplit(0, 1000, 0.6, 0.2)
  assert.equal(s.train.from, 0)
  assert.equal(s.train.to, 600)
  assert.equal(s.validation.from, 600) // begins exactly where train ends
  assert.equal(s.validation.to, 800)
  assert.equal(s.oos.from, 800) // begins exactly where validation ends
  assert.equal(s.oos.to, 1000)
})

test('splits never overlap and every trade lands in exactly one window', () => {
  const s = timeSplit(0, 1000, 0.6, 0.2)
  const trades = Array.from({ length: 1000 }, (_, i) => trade(i))
  const inTrain = tradesIn(trades, s.train)
  const inVal = tradesIn(trades, s.validation)
  const inOos = tradesIn(trades, s.oos)
  // No double counting: the three counts sum to the total.
  assert.equal(inTrain.length + inVal.length + inOos.length, trades.length)
  // No overlap: no trade appears in two windows.
  const ids = new Set<number>()
  for (const t of [...inTrain, ...inVal, ...inOos]) {
    assert.equal(ids.has(t.time), false, `trade at ${t.time} counted twice`)
    ids.add(t.time)
  }
})

test('the boundary trade belongs to the later window (upper bound is exclusive)', () => {
  const s = timeSplit(0, 1000, 0.6, 0.2)
  const boundary = trade(600) // exactly where train ends / validation begins
  assert.equal(tradesIn([boundary], s.train).length, 0)
  assert.equal(tradesIn([boundary], s.validation).length, 1)
})

test('tradeRange spans from the first trade to just past the last', () => {
  const r = tradeRange([trade(10), trade(50), trade(30)])
  assert.deepEqual(r, { from: 10, to: 51 })
})

test('tradeRange is null when no trade has a real time', () => {
  assert.equal(tradeRange([]), null)
  assert.equal(tradeRange([{ time: 0, rMultiple: 1, pnlUsd: 1, outcome: 'WIN' }]), null)
})
