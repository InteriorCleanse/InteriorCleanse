/**
 * THE OUT-OF-SAMPLE REFERENCE — the number the stability gate compares paper
 * against, for a strategy that has no factory passport.
 *
 * WHY THIS EXISTS. The paper validation's `stability` gate asks: is realised
 * paper expectancy within tolerance of what the strategy earned out of sample?
 * It used to source that out-of-sample number from a vault passport only, and
 * passports are minted only from factory campaign survivors. The frozen
 * PAPER_VALIDATION profile trades a built-in strategy, which has no genome and
 * so no passport, so the gate was unreachable — verified at 8/9 on a flawless
 * sample. See docs/FINAL_PRODUCTION_READINESS.md, "The stability gate is
 * unreachable".
 *
 * The evidence the gate wants already existed: `buildReport()` produces an
 * out-of-sample expectancy for any backtestable strategy. This module runs
 * that backtest for the strategy that is actually trading, stores the result
 * with its provenance, and hands the gate the number.
 *
 * WHAT IT DOES NOT DO. It never runs on a GET. A backtest takes seconds and the
 * desk polls every fifteen; the reference is computed only on an explicit
 * POST and read from the store everywhere else. A reference whose out-of-sample
 * segment is under the configured confidence minimum is stored but marked
 * unusable — a mean off three trades is not a reference — and the gate ignores
 * it. Nothing here touches the gate's threshold, the OOS split, or the engine.
 */

import { config } from '../../config.ts'
import { store } from '../store.ts'
import { runBacktest } from '../backtest/runner.ts'
import { defaultAssumptions } from '../sim/fills.ts'
import { VERSION } from '../version.ts'

export type OosReference = {
  strategyId: string
  symbol: string
  interval: string
  /** Always BACKTEST / SIMULATED — printed so it can never be read as paper. */
  source: 'BACKTEST'
  dataType: 'SIMULATED'
  window: { from: number; to: number } | null
  oosTrades: number
  oosAvgR: number | null
  inSampleAvgR: number | null
  inSampleTrades: number
  /** True only when the out-of-sample segment clears the configured confidence minimum. */
  usable: boolean
  reason: string
  notes: string[]
  computedAt: number
  engineVersion: string
  fillModel: 'realistic'
  assumptions: { spreadBps: number; slippageBps: number; takerFeePercent: number }
}

/** After this the reference should be recomputed; the candle window has moved on. */
export const REFERENCE_STALE_MS = 7 * 86_400_000

function keyFor(strategyId: string, symbol = config.symbol, interval = config.interval): string {
  return `oosref:${strategyId}:${symbol}:${interval}`
}

/** The stored reference for a strategy, or null when none has been computed. Never computes. */
export function oosReferenceFor(strategyId: string): OosReference | null {
  return store().getJson<OosReference>(keyFor(strategyId))
}

export function isStale(ref: OosReference, now = Date.now()): boolean {
  return now - ref.computedAt > REFERENCE_STALE_MS
}

/**
 * Run the out-of-sample backtest for one strategy and store the result.
 *
 * Explicit, slow, and honest about a thin sample. The gate only ever reads the
 * stored row, so calling this is the one way the reference changes.
 */
export async function refreshOosReference(strategyId: string, now = Date.now()): Promise<OosReference> {
  const report = await runBacktest(strategyId)
  const min = config.replay.minSetupsForConfidence
  const a = defaultAssumptions()
  const oos = report.outOfSample
  let usable = false
  let reason: string
  if (report.notBacktestable) {
    reason = report.notBacktestable
  } else if (oos.trades < min) {
    reason = `Out-of-sample has only ${oos.trades} trade(s) — under the ${min} needed before its expectancy is a reference. Stored, not used.`
  } else if (oos.avgR === null) {
    reason = 'Out-of-sample produced no expectancy.'
  } else {
    usable = true
    reason = `Out-of-sample expectancy from ${oos.trades} simulated trade(s) over ${report.window ? Math.round((report.window.to - report.window.from) / 86_400_000) : 0} days.`
  }
  const ref: OosReference = {
    strategyId,
    symbol: config.symbol,
    interval: config.interval,
    source: 'BACKTEST',
    dataType: 'SIMULATED',
    window: report.window,
    oosTrades: oos.trades,
    oosAvgR: oos.avgR,
    inSampleAvgR: report.inSample.avgR,
    inSampleTrades: report.inSample.trades,
    usable,
    reason,
    notes: report.notes,
    computedAt: now,
    engineVersion: VERSION,
    fillModel: 'realistic',
    assumptions: { spreadBps: a.spreadBps, slippageBps: a.slippageBps, takerFeePercent: a.takerFeePercent },
  }
  store().setJson(keyFor(strategyId), ref)
  return ref
}

/**
 * The lookup the gate uses: a usable, stored reference or nothing. A stale
 * reference is still returned — the gate's detail says so — because a
 * week-old out-of-sample number is evidence and no number at all is not.
 */
export function usableOosAvgR(strategyId: string): number | null {
  const ref = oosReferenceFor(strategyId)
  return ref && ref.usable ? ref.oosAvgR : null
}
