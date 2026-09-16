/**
 * The AI CIO explains the house view — but it does not form it. The decision it
 * reports is, by construction, exactly the fused decision after the risk engine
 * has had its say: an actionable side that risk approves stays actionable; one
 * that risk vetoes becomes NO TRADE; a WATCH or NO TRADE passes through
 * unchanged. The CIO never places, sizes or approves an order; it narrates the
 * decision the engine already reached.
 */

import type { FusedAction } from '../fusion.ts'

/** The minimal decision shape the CIO reads — satisfied by a FusedDecision and by the narration context. */
export type CioInputDecision = { action: FusedAction; direction: 'long' | 'short' | null; reason: string }
/** The minimal risk shape the CIO reads — an adapter over a RiskVerdict. */
export type CioInputRisk = { approved: boolean; reasons: string[] }

export type CioCall = {
  /** The reported decision. Equals the fused action, except an actionable side vetoed by risk becomes NO TRADE. */
  action: FusedAction
  direction: 'long' | 'short' | null
  reason: string
  /** True when an actionable fused side was turned into NO TRADE by the risk engine. */
  blockedByRisk: boolean
}

/**
 * The CIO's decision: the fused decision after risk. Pure and deterministic —
 * this is the single definition the narrator and the API both use, so the
 * reported decision can never drift from what the engine would actually do.
 */
export function cioDecision(decision: CioInputDecision | null, risk: CioInputRisk | null): CioCall {
  if (!decision) return { action: 'NO TRADE', direction: null, reason: 'No fused decision yet — the panel has not voted.', blockedByRisk: false }

  const actionable = decision.action === 'LONG' || decision.action === 'SHORT'
  if (actionable && risk && !risk.approved) {
    const why = risk.reasons[0] ?? 'a risk rule vetoed it'
    return { action: 'NO TRADE', direction: decision.direction, reason: `The panel leans ${decision.direction}, but risk blocks it: ${why}`, blockedByRisk: true }
  }
  return { action: decision.action, direction: decision.direction, reason: decision.reason, blockedByRisk: false }
}

/** A one-line label for the reported decision. */
export function decisionLabel(call: CioCall): string {
  return call.action + (call.blockedByRisk ? ' (blocked by risk)' : '')
}
