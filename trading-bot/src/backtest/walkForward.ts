/**
 * Walk-forward: instead of one train/test split, roll a train window and a
 * test window forward across the whole history, again and again, and judge
 * only on each test window. It answers the question a single split cannot —
 * "does this keep working as the market changes?" — and it is much harder to
 * fool, because every test window is data the fit never saw.
 *
 * Pure over a trade list: a real run builds the trades once and this rolls
 * the windows over them.
 */

import { computeMetrics } from './metrics.ts'
import type { Metrics, TradeLike } from './metrics.ts'
import { tradesIn } from './splits.ts'
import type { Window } from './splits.ts'

export type Fold = { index: number; train: Window; test: Window; trainMetrics: Metrics; testMetrics: Metrics }

export type WalkForwardResult = {
  folds: Fold[]
  /** Every test window's trades scored together — the aggregate out-of-sample result. */
  combinedOos: Metrics
  trainDays: number
  testDays: number
  stepDays: number
}

/**
 * Roll [trainDays train | testDays test] forward by stepDays across
 * [from, to). Each fold trains on its train window and is judged on the test
 * window that immediately follows it; the next fold starts stepDays later.
 * Test windows are the out-of-sample folds and, with step = testDays, they
 * tile without overlap.
 */
export function walkForward(trades: TradeLike[], from: number, to: number, trainDays: number, testDays: number, stepDays = testDays): WalkForwardResult {
  const day = 86_400_000
  const train = trainDays * day
  const test = testDays * day
  const step = Math.max(day, stepDays * day)
  const folds: Fold[] = []
  const oosTrades: TradeLike[] = []
  let start = from
  let index = 0
  while (start + train + test <= to + 1) {
    const trainWin: Window = { from: start, to: start + train }
    const testWin: Window = { from: start + train, to: start + train + test }
    const tt = tradesIn(trades, testWin)
    folds.push({ index, train: trainWin, test: testWin, trainMetrics: computeMetrics(tradesIn(trades, trainWin)), testMetrics: computeMetrics(tt) })
    oosTrades.push(...tt)
    start += step
    index++
  }
  return { folds, combinedOos: computeMetrics(oosTrades), trainDays, testDays, stepDays }
}
