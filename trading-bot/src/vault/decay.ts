/**
 * Decay detection: an edge that worked out-of-sample can stop working, and the
 * job here is to notice — early, but without crying wolf on a normal losing
 * streak. Two independent readings have to agree that something has changed:
 *
 *  1. Rolling expectancy: the average R over the recent window has dropped
 *     below the lower confidence bound of the out-of-sample expectancy — i.e.
 *     below what even a pessimistic reading of the backtest allowed for.
 *  2. CUSUM: the cumulative sum of downside deviations from the expected R has
 *     crossed a threshold, the classic early-warning that a process mean has
 *     shifted down and stayed there (not just one bad trade).
 *
 * Both need a minimum number of trades first, because a handful of results
 * proves nothing — noisy small samples are exactly what this must not react to.
 */

import { config } from '../../config.ts'
import type { Metrics } from '../backtest/metrics.ts'

export type DecayStatus = {
  decaying: boolean
  reason: string
  rollingExpectancy: number | null
  /** The lower CUSUM statistic — how far downside deviations have accumulated. */
  cusumLow: number
  trades: number
}

/**
 * The lower confidence bound on the out-of-sample expectancy — the line live
 * results must not fall below. A one-sided 95% bound from the per-trade spread.
 * Conservative when the spread is unknown: it never returns above zero without
 * a real, positive, measured edge.
 */
export function oosLowerBound(m: Metrics): number {
  if (m.avgR === null || m.trades < 2) return 0
  const sharpe = m.sharpeR
  if (!sharpe || sharpe <= 0) return Math.min(0, m.avgR) // no reliable spread → demand simply "not losing"
  const std = m.avgR / sharpe // per-trade std, from mean/std = sharpe
  const se = std / Math.sqrt(m.trades)
  return m.avgR - 1.645 * se
}

/** The mean R over the last `window` trades, or null when there are fewer than a few. */
export function rollingExpectancy(rs: number[], window: number): number | null {
  if (rs.length < 2) return null
  const slice = rs.slice(-Math.max(1, window))
  return slice.reduce((s, r) => s + r, 0) / slice.length
}

/**
 * One-sided lower CUSUM: accumulate how far each result falls below
 * (target − slack), resetting up at 0. A large value means downside has piled
 * up — a sustained shift, not one bad trade. `k` (slack) is in R; the alarm
 * fires when the statistic exceeds `h` (also in R).
 */
export function lowerCusum(rs: number[], target: number, k: number): number {
  let c = 0
  for (const r of rs) {
    c = Math.max(0, c + (target - k - r))
  }
  return c
}

/**
 * Decide whether a strategy is decaying from its recent (paper/shadow/live)
 * R-multiples. Needs `minTrades` before it will flag anything. Decays when the
 * rolling expectancy has fallen below the OOS lower bound AND the CUSUM confirms
 * a sustained downward shift.
 */
export function detectDecay(recentR: number[], oosLowerAvgR: number, opts: { minTrades?: number; window?: number; expectedAvgR?: number; cusumSlack?: number; cusumThreshold?: number } = {}): DecayStatus {
  const minTrades = opts.minTrades ?? config.vault.decayMinTrades
  const window = opts.window ?? config.vault.decayWindow
  const expected = opts.expectedAvgR ?? 0
  const k = opts.cusumSlack ?? config.vault.cusumSlack
  const h = opts.cusumThreshold ?? config.vault.cusumThreshold
  const trades = recentR.length

  if (trades < minTrades) {
    return { decaying: false, reason: `Only ${trades} live trade(s); need ${minTrades} before judging decay.`, rollingExpectancy: rollingExpectancy(recentR, window), cusumLow: 0, trades }
  }

  const rolling = rollingExpectancy(recentR, window)
  const cusumLow = lowerCusum(recentR, expected, k)
  const belowFloor = rolling !== null && rolling < oosLowerAvgR
  const cusumAlarm = cusumLow > h

  if (belowFloor && cusumAlarm) {
    return { decaying: true, reason: `Rolling expectancy ${rolling!.toFixed(3)}R is below the out-of-sample floor ${oosLowerAvgR.toFixed(3)}R, and the CUSUM (${cusumLow.toFixed(2)} > ${h}) confirms a sustained drop.`, rollingExpectancy: rolling, cusumLow, trades }
  }
  if (belowFloor) {
    return { decaying: false, reason: `Rolling expectancy ${rolling!.toFixed(3)}R is under the floor, but the CUSUM has not confirmed a sustained shift yet — watching.`, rollingExpectancy: rolling, cusumLow, trades }
  }
  return { decaying: false, reason: `Holding up: rolling expectancy ${rolling === null ? '—' : rolling.toFixed(3) + 'R'} is at or above the out-of-sample floor ${oosLowerAvgR.toFixed(3)}R.`, rollingExpectancy: rolling, cusumLow, trades }
}
