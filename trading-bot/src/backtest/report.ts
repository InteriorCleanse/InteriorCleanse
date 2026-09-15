/**
 * The backtest report: one object (and a readable text form) that puts the
 * in-sample number next to the out-of-sample number, the walk-forward result
 * and the Monte-Carlo spread — and says, plainly, which number to trust. The
 * only figure worth acting on is the out-of-sample one.
 */

import { config } from '../../config.ts'
import { computeMetrics } from './metrics.ts'
import type { Metrics, TradeLike } from './metrics.ts'
import { timeSplit, tradesIn, tradeRange } from './splits.ts'
import { walkForward } from './walkForward.ts'
import type { WalkForwardResult } from './walkForward.ts'
import { monteCarlo } from './monteCarlo.ts'
import type { MonteCarloResult } from './monteCarlo.ts'

export type BacktestReport = {
  strategy: string
  window: { from: number; to: number } | null
  all: Metrics
  inSample: Metrics
  validation: Metrics
  outOfSample: Metrics
  walkForward: WalkForwardResult | null
  monteCarlo: MonteCarloResult
  notes: string[]
  /** Set (with the reason) when the strategy cannot honestly be backtested on candles at all. */
  notBacktestable: string | null
}

export type BacktestOptions = {
  trainPct?: number
  validationPct?: number
  walkForward?: { trainDays: number; testDays: number; stepDays?: number } | null
  monteCarloSamples?: number
  seed?: number
  /** When set, this strategy is not backtestable on candles; the report says so and quotes no edge. */
  notBacktestable?: string
}

export function buildReport(strategy: string, trades: TradeLike[], opts: BacktestOptions = {}): BacktestReport {
  const taken = trades.filter((t) => !t.blockedByMemory)
  const range = tradeRange(taken)
  const notes: string[] = []

  const split = range ? timeSplit(range.from, range.to, opts.trainPct ?? 0.6, opts.validationPct ?? 0.2) : null
  const inSample = computeMetrics(split ? tradesIn(taken, split.train) : [])
  const validation = computeMetrics(split ? tradesIn(taken, split.validation) : [])
  const outOfSample = computeMetrics(split ? tradesIn(taken, split.oos) : [])

  const wf = range && opts.walkForward ? walkForward(taken, range.from, range.to, opts.walkForward.trainDays, opts.walkForward.testDays, opts.walkForward.stepDays) : null
  const mc = monteCarlo(taken.map((t) => t.rMultiple ?? 0), opts.monteCarloSamples ?? 2000, opts.seed ?? 12345)

  const min = config.replay.minSetupsForConfidence
  if (opts.notBacktestable) {
    return { strategy, window: null, all: computeMetrics([]), inSample: computeMetrics([]), validation: computeMetrics([]), outOfSample: computeMetrics([]), walkForward: null, monteCarlo: mc, notes: [opts.notBacktestable], notBacktestable: opts.notBacktestable }
  }
  if (outOfSample.trades < min) notes.push(`Out-of-sample has only ${outOfSample.trades} trade(s) — under the ${min} needed to trust it. This is a demonstration of the method, not a verdict on the edge.`)
  if (inSample.trades > 0 && outOfSample.trades > 0 && (inSample.avgR ?? 0) > 0 && (outOfSample.avgR ?? 0) <= 0) {
    notes.push('The strategy looked good in-sample and did not hold up out-of-sample — the classic sign of curve-fitting. Trust the out-of-sample number.')
  }
  if (wf && wf.folds.length === 0) notes.push('Not enough history for a single walk-forward fold at these window sizes.')
  notes.push('R is the unit; account size never flatters these. The only number worth acting on is the out-of-sample one.')

  return { strategy, window: range, all: computeMetrics(taken), inSample, validation, outOfSample, walkForward: wf, monteCarlo: mc, notes, notBacktestable: null }
}

/** A compact text form for the terminal. */
export function reportLines(r: BacktestReport): string[] {
  const L: string[] = []
  L.push(`STRATEGY: ${r.strategy}`)
  if (r.notBacktestable) { L.push(`  NOT BACKTESTABLE — ${r.notBacktestable}`); return L }
  const m = (label: string, x: Metrics) => L.push(`  ${label.padEnd(14)} ${String(x.trades).padStart(4)} trades · ${x.winRate !== null ? Math.round(x.winRate * 100) + '% win' : '—'} · ${x.totalR.toFixed(2)}R total · ${x.avgR !== null ? x.avgR.toFixed(2) : '—'}R avg · maxDD ${x.maxDrawdownR.toFixed(1)}R${x.enoughData ? '' : '  (small sample)'}`)
  m('All', r.all)
  m('In-sample', r.inSample)
  m('Validation', r.validation)
  m('OUT-OF-SAMPLE', r.outOfSample)
  if (r.walkForward) L.push(`  Walk-forward   ${r.walkForward.folds.length} fold(s), combined OOS ${r.walkForward.combinedOos.totalR.toFixed(2)}R over ${r.walkForward.combinedOos.trades} trades`)
  const mc = r.monteCarlo
  L.push(`  Monte Carlo    total R p5..p95: ${mc.totalR.p5.toFixed(1)}..${mc.totalR.p95.toFixed(1)} (median ${mc.totalR.median.toFixed(1)}); worst drawdown p95 ${mc.maxDrawdownR.p95.toFixed(1)}R; ${Math.round(mc.profitableShare * 100)}% of runs profitable`)
  for (const n of r.notes) L.push(`  • ${n}`)
  return L
}
