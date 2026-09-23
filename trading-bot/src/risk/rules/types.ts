/**
 * The shared shapes the risk rules speak. A rule looks at the candidate
 * order and the state of the world and returns one check: passed, or not,
 * with a reason a person can read. The engine runs them in order and the
 * first failure is the veto.
 */

import type { RiskDecision, Signal } from '../../types.ts'

export type RiskCandidate = {
  signal: Signal
  /** The price the order would actually fill at, when known (the paper trader passes it). */
  entry?: number
}

export type RiskState = {
  now: number
  /** The kill switch: when not ok, everything is vetoed, paper included. */
  killSwitch: { ok: boolean; reason: string }
  /** Age of the latest closed candle in seconds, or null when unknown (a one-shot scan). */
  candleAgeSec: number | null
  /** Current spread as a percent of price, or null when unknown. */
  spreadPct: number | null
  /** Open paper positions right now, and their total notional value. */
  openPositions: number
  openNotionalUsd: number
  /** Today's paper trades and losses in R. */
  today: { trades: number; lossesR: number }
  /** Paper equity now and its running peak, for the drawdown cap. */
  equityUsd: number
  peakEquityUsd: number
}

export type RiskCheck = { rule: string; passed: boolean; detail: string }

/** A rule sees the candidate, the world, and the per-trade sizing the engine already computed. */
export type Rule = (c: RiskCandidate, s: RiskState, sizing: RiskDecision) => RiskCheck
