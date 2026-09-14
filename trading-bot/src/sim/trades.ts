/**
 * The one place trade results are worked out. Replay, the paper trader
 * and (one day) the live reconciler all call this, so a number on one
 * screen can never disagree with the same number on another.
 *
 *   R  — profit or loss in units of the risk taken at the fill:
 *        (exit − fill) ÷ (fill − stop), minus fees expressed in R.
 *   %  — profit or loss as a percent of the fill price, after fees.
 *   $  — the same in dollars for the quantity held.
 */

import type { ExecutionAssumptions, ExitReason } from './fills.ts'
import { exitFeePercent } from './fills.ts'

export type TradeMetrics = {
  rMultiple: number
  pnlPercent: number
  pnlUsd: number
  feesUsd: number
  /** The dollar risk the trade actually carried after the fill. */
  riskUsd: number
  outcome: 'WIN' | 'LOSS' | 'FLAT'
}

export function tradeMetrics(input: { direction: 'long' | 'short'; fill: number; stop: number; exit: number; exitReason: ExitReason | 'manual'; quantity: number }, a: ExecutionAssumptions): TradeMetrics {
  const dir = input.direction === 'long' ? 1 : -1
  const dist = Math.abs(input.fill - input.stop)
  const feePct = a.takerFeePercent + exitFeePercent(input.exitReason === 'manual' ? 'time' : input.exitReason, a)
  const grossPct = ((input.exit - input.fill) / input.fill) * 100 * dir
  const pnlPercent = grossPct - feePct
  const notional = input.quantity * input.fill
  const pnlUsd = (pnlPercent / 100) * notional
  const feesUsd = (feePct / 100) * notional
  const feeR = dist > 0 ? ((feePct / 100) * input.fill) / dist : 0
  const rMultiple = dist > 0 ? ((input.exit - input.fill) * dir) / dist - feeR : 0
  return {
    rMultiple, pnlPercent, pnlUsd, feesUsd,
    riskUsd: dist * input.quantity,
    outcome: pnlPercent > 0.001 ? 'WIN' : pnlPercent < -0.001 ? 'LOSS' : 'FLAT',
  }
}

/** Reward-to-risk of a plan measured from the actual fill, not the intended entry. */
export function rrAtFill(direction: 'long' | 'short', fill: number, stop: number, target: number): number {
  const risk = Math.abs(fill - stop)
  const reward = direction === 'long' ? target - fill : fill - target
  return risk > 0 ? reward / risk : 0
}
