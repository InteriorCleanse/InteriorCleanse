/**
 * Walk-forward. The windows must roll forward correctly — each test window
 * follows its train window, and with step = test size they tile without
 * overlap — and every test window's trades must show up exactly once in the
 * combined out-of-sample result.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walkForward } from '../../src/backtest/walkForward.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'

const DAY = 86_400_000
function trade(dayIndex: number, r = 1): TradeLike {
  return { time: dayIndex * DAY, rMultiple: r, pnlUsd: r * 100, outcome: r >= 0 ? 'WIN' : 'LOSS' }
}

test('folds roll forward: each test window immediately follows its train window', () => {
  // 90 days, train 30, test 10, step 10.
  const wf = walkForward([], 0, 90 * DAY, 30, 10, 10)
  assert.ok(wf.folds.length >= 1)
  for (const f of wf.folds) {
    assert.equal(f.test.from, f.train.to, 'test starts where train ends')
    assert.equal(f.train.to - f.train.from, 30 * DAY)
    assert.equal(f.test.to - f.test.from, 10 * DAY)
  }
})

test('with step = test size, consecutive test windows tile without overlap', () => {
  const wf = walkForward([], 0, 120 * DAY, 30, 10, 10)
  for (let i = 1; i < wf.folds.length; i++) {
    assert.equal(wf.folds[i].test.from, wf.folds[i - 1].test.to, 'no gap, no overlap between test windows')
    assert.equal(wf.folds[i].train.from, wf.folds[i - 1].train.from + 10 * DAY, 'train rolls forward by the step')
  }
})

test('every fold advances the window start by exactly stepDays', () => {
  const wf = walkForward([], 0, 200 * DAY, 30, 10, 10)
  for (let i = 1; i < wf.folds.length; i++) {
    assert.equal(wf.folds[i].train.from - wf.folds[i - 1].train.from, 10 * DAY)
  }
})

test('combined OOS is exactly the union of every test window, each trade once', () => {
  // A trade at day 35 falls in the test window of the first fold (train 0-30, test 30-40).
  const trades = [trade(5), trade(35), trade(45), trade(55)]
  const wf = walkForward(trades, 0, 90 * DAY, 30, 10, 10)
  // day 5 is only ever in a train window (never a test window) → excluded from OOS.
  // days 35/45/55 each land in exactly one test window.
  assert.equal(wf.combinedOos.trades, 3)
  assert.equal(wf.combinedOos.totalR, 3)
})

test('too little history for even one fold yields zero folds and empty OOS', () => {
  const wf = walkForward([trade(1)], 0, 20 * DAY, 30, 10, 10)
  assert.equal(wf.folds.length, 0)
  assert.equal(wf.combinedOos.trades, 0)
})

test('walk-forward is deterministic for the same inputs', () => {
  const trades = [trade(35, 2), trade(45, -1), trade(55, 1)]
  const a = walkForward(trades, 0, 90 * DAY, 30, 10, 10)
  const b = walkForward(trades, 0, 90 * DAY, 30, 10, 10)
  assert.equal(a.folds.length, b.folds.length)
  assert.equal(a.combinedOos.totalR, b.combinedOos.totalR)
})
