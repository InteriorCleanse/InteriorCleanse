/**
 * The drawdown cap: if paper equity has fallen far enough from its peak, stop
 * opening new risk.
 *
 * WHAT THIS MEASURES, EXACTLY. `equityUsd` is realised equity — the account plus
 * the P&L of CLOSED trades. An open position sitting underwater is not in it, so
 * the figure below is the closed-trade drawdown and the true low-water mark can
 * be deeper by up to the unrealised loss on whatever is open. The cap can
 * therefore be overshot by about that much before this rule notices.
 *
 * It is bounded: `config.risk.maxOpenPositions` is 1, so the overshoot is at most
 * one position's loss against a 25% cap — small, but real, and in the permissive
 * direction. The rule's wording is now specific about which drawdown it is rather
 * than stating a figure as though it were the account's. Making the cap itself
 * count open positions would change veto behaviour, which is a deliberate call
 * for the operator and not something to slip in behind a wording fix.
 */
import { config } from '../../../config.ts'
import type { Rule } from './types.ts'

export const drawdown: Rule = (_c, s) => {
  const max = config.risk.maxDrawdownPercent
  const peak = Math.max(s.peakEquityUsd, s.equityUsd)
  const dd = peak > 0 ? ((peak - s.equityUsd) / peak) * 100 : 0
  const ok = dd < max
  return {
    rule: 'Drawdown',
    passed: ok,
    detail: ok
      ? `Down ${dd.toFixed(1)}% from the peak on closed trades (cap ${max}%); anything still open is not counted.`
      : `Down ${dd.toFixed(1)}% from the equity peak on closed trades — at or past the ${max}% cap. No new risk until it recovers.`,
  }
}
