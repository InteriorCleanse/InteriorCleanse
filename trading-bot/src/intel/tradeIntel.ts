/**
 * Trade intelligence (Phase 22F): "why this trade" and "why NOT this trade".
 *
 * Both answers are assembled from reasons the engine ALREADY produced — the
 * strategy's own evidence steps, the fused decision's confirms/invalidates, and
 * the risk engine's per-rule checks. Nothing is explained after the fact and
 * nothing is generated to fill a silence: where the engine recorded no reason,
 * this says so.
 *
 * Rejection is categorised, not narrated. The category comes from which rule
 * actually vetoed, or which evidence step actually failed — never from a guess
 * about what "probably" went wrong.
 */

import type { StrategyVote } from '../strategies/types.ts'
import type { FusedDecision } from '../fusion.ts'
import type { RiskVerdict } from '../riskEngine.ts'
import type { EvidenceStep } from '../types.ts'

/** Why a setup did not become a trade. Derived from engine state, not guessed. */
export type RejectionCategory =
  | 'risk-veto'
  | 'insufficient-confluence'
  | 'regime-mismatch'
  | 'stale-structure'
  | 'invalidated-setup'
  | 'insufficient-data'
  | 'session-restriction'
  | 'duplicate-exposure'
  | 'strategy-disagreement'
  | 'unavailable-required-feature'
  | 'no-setup'

export type Reason = {
  /** The heading the UI groups by. */
  group: 'structure' | 'liquidity' | 'imbalance' | 'order-flow' | 'regime' | 'strategy' | 'confluence' | 'risk' | 'data-quality'
  label: string
  passed: boolean
  detail: string
  /** Which engine module said it. */
  source: string
}

export type WhyTrade = {
  exists: boolean
  action: string
  direction: 'long' | 'short' | null
  reasons: Reason[]
  /** The engine's own headline sentence. */
  engineReason: string
  note: string
}

export type WhyNot = {
  rejected: boolean
  categories: RejectionCategory[]
  /** The single most decisive reason, when one rule or step clearly owns it. */
  primary: { category: RejectionCategory; detail: string; source: string } | null
  reasons: Reason[]
  note: string
}

/** Bucket an evidence step by what it is talking about, using the step's own wording. */
function groupOf(step: string): Reason['group'] {
  const s = step.toLowerCase()
  if (/sweep|liquidity|raid|equal|session high|session low|pool/.test(s)) return 'liquidity'
  if (/gap|fvg|imbalance|inversion|displacement/.test(s)) return 'imbalance'
  if (/structure|swing|bos|choch|trend|break/.test(s)) return 'structure'
  if (/delta|flow|tape|absorption|book|volume/.test(s)) return 'order-flow'
  if (/regime|volatility|range/.test(s)) return 'regime'
  if (/killzone|session|window|time|weekend|news/.test(s)) return 'strategy'
  return 'strategy'
}

function evidenceToReasons(ev: EvidenceStep[], source: string): Reason[] {
  return ev.map((e) => ({ group: groupOf(e.step), label: e.step, passed: e.passed, detail: e.detail, source }))
}

/**
 * Why the engine's current trade exists. Reads the winning strategy's evidence,
 * the fused decision's confirms, and the risk verdict's passed checks.
 */
export function whyTrade(input: {
  vote: StrategyVote | null
  decision: FusedDecision | null
  risk: RiskVerdict | null
}): WhyTrade {
  const v = input.vote
  const d = input.decision
  const reasons: Reason[] = []

  if (v) reasons.push(...evidenceToReasons(v.evidence, `strategy:${v.id}`))
  for (const c of d?.confirms ?? []) reasons.push({ group: 'confluence', label: 'Fusion confirms', passed: true, detail: c, source: 'fusion' })
  for (const i of d?.invalidates ?? []) reasons.push({ group: 'confluence', label: 'Fusion notes against', passed: false, detail: i, source: 'fusion' })
  for (const c of input.risk?.checks ?? []) reasons.push({ group: 'risk', label: c.rule, passed: c.passed, detail: c.detail, source: 'risk-engine' })

  const actionable = (v && v.action !== 'HOLD') || (d && (d.action === 'LONG' || d.action === 'SHORT'))
  return {
    exists: !!actionable,
    action: v?.action ?? d?.action ?? 'NO TRADE',
    direction: v?.direction ?? d?.direction ?? null,
    reasons,
    engineReason: v?.reason || d?.reason || 'The engine recorded no reason for this state.',
    note: actionable
      ? 'Every line above is a reason the engine itself recorded. Nothing has been added.'
      : 'No actionable setup exists right now; the lines above are what the engine is waiting for.',
  }
}

/**
 * Why a setup was NOT taken. The category is decided by what actually blocked
 * it, in priority order: an explicit risk veto first (it is the most decisive),
 * then unavailable data, then the failing evidence steps.
 */
export function whyNot(input: {
  vote: StrategyVote | null
  votes?: StrategyVote[]
  decision: FusedDecision | null
  risk: RiskVerdict | null
  /** Set when a required feature was unavailable (e.g. the tape for an order-flow strategy). */
  unavailableFeatures?: string[]
}): WhyNot {
  const categories = new Set<RejectionCategory>()
  const reasons: Reason[] = []
  let primary: WhyNot['primary'] = null

  // 1. A risk veto is the most decisive rejection there is — it names its own rule.
  const risk = input.risk
  if (risk && !risk.approved && risk.vetoedBy) {
    const cat = riskCategory(risk.vetoedBy)
    categories.add(cat)
    primary = { category: cat, detail: `${risk.vetoedBy}: ${risk.reason}`, source: 'risk-engine' }
    for (const c of risk.checks.filter((x) => !x.passed)) {
      reasons.push({ group: 'risk', label: c.rule, passed: false, detail: c.detail, source: 'risk-engine' })
    }
  }

  // 2. A required feature that simply was not available.
  for (const f of input.unavailableFeatures ?? []) {
    categories.add('unavailable-required-feature')
    reasons.push({ group: 'data-quality', label: 'Required feature unavailable', passed: false, detail: f, source: 'feature-engine' })
    if (!primary) primary = { category: 'unavailable-required-feature', detail: f, source: 'feature-engine' }
  }

  // 3. The strategy's own failing conditions.
  const failing = (input.vote?.evidence ?? []).filter((e) => !e.passed)
  for (const e of failing) {
    const g = groupOf(e.step)
    reasons.push({ group: g, label: e.step, passed: false, detail: e.detail, source: `strategy:${input.vote?.id ?? 'unknown'}` })
    categories.add(evidenceCategory(e.step))
  }

  // 4. Disagreement across the panel, when the fused call was not actionable.
  const d = input.decision
  if (d && d.action !== 'LONG' && d.action !== 'SHORT') {
    if (d.score < d.enterScore) {
      categories.add('insufficient-confluence')
      reasons.push({ group: 'confluence', label: 'Agreement below the enter threshold', passed: false, detail: `Agreement ${d.score}/100 did not reach the ${d.enterScore} needed${d.regime ? ` in the ${d.regime} regime` : ''}.`, source: 'fusion' })
      if (!primary) primary = { category: 'insufficient-confluence', detail: `Agreement ${d.score}/100 vs threshold ${d.enterScore}.`, source: 'fusion' }
    }
    const votes = input.votes ?? []
    const longs = votes.filter((v) => v.direction === 'long' && v.action !== 'HOLD').length
    const shorts = votes.filter((v) => v.direction === 'short' && v.action !== 'HOLD').length
    if (longs > 0 && shorts > 0) {
      categories.add('strategy-disagreement')
      reasons.push({ group: 'confluence', label: 'Strategies disagree', passed: false, detail: `${longs} strategy(ies) lean long and ${shorts} lean short at the same time.`, source: 'fusion' })
    }
  }

  if (!categories.size && !input.vote) {
    categories.add('no-setup')
    reasons.push({ group: 'strategy', label: 'No setup', passed: false, detail: 'No strategy proposed a trade on this candle.', source: 'strategy-registry' })
  }

  return {
    rejected: categories.size > 0 && !(categories.size === 1 && categories.has('no-setup')),
    categories: [...categories].sort(),
    primary,
    reasons,
    note: primary
      ? 'The primary reason is the rule or condition the engine itself recorded as blocking. Nothing has been inferred.'
      : reasons.length
        ? 'These are the conditions the engine recorded as unmet. No single rule vetoed outright.'
        : 'The engine recorded no rejection reason for this candle.',
  }
}

/** Map a risk-engine veto name onto a rejection category. Unknown names stay honest. */
function riskCategory(vetoedBy: string): RejectionCategory {
  const v = vetoedBy.toLowerCase()
  if (v.includes('exposure')) return 'duplicate-exposure'
  if (v.includes('fresh data') || v.includes('stale')) return 'insufficient-data'
  return 'risk-veto'
}

/** Map a failing evidence step onto a rejection category, from the step's own wording. */
function evidenceCategory(step: string): RejectionCategory {
  const s = step.toLowerCase()
  if (/killzone|session|weekend|window|time/.test(s)) return 'session-restriction'
  if (/regime|volatility/.test(s)) return 'regime-mismatch'
  if (/expired|stale|too old|age/.test(s)) return 'stale-structure'
  if (/inverted|invalidated|broken/.test(s)) return 'invalidated-setup'
  if (/unavailable|no data|missing|tape/.test(s)) return 'insufficient-data'
  return 'insufficient-confluence'
}

// ---------------------------------------------------------------
// Trade linkage — the journal's visual replay (Phase 22N)
// ---------------------------------------------------------------

export type TradeStage = {
  stage: 'SETUP FORMED' | 'CONDITIONS CONFIRMED' | 'SIGNAL' | 'RISK CHECK' | 'ENTRY' | 'MANAGEMENT' | 'EXIT'
  at: number | null
  detail: string
  /** PAPER is stated on every fill so it can never be mistaken for real. */
  paper: boolean
}

/**
 * The life of one paper trade as an ordered set of stages, built from what the
 * position actually recorded. A stage the record cannot support gets `at: null`
 * and says so — the timeline is never padded with plausible timestamps.
 */
export function tradeStages(pos: {
  id: string
  openedAt: number
  filledAt?: number
  closedAt?: number
  setupKey: string
  direction: 'long' | 'short'
  intendedEntry: number
  entry: number
  stop: number
  target: number
  quantity: number
  riskUsd: number
  exitReason?: string
  exit?: number
  rMultiple?: number
  candlesHeld?: number
  status: string
  note?: string
}): TradeStage[] {
  const filled = pos.filledAt !== undefined
  const closed = pos.closedAt !== undefined
  const missed = pos.exitReason === 'missed'
  return [
    { stage: 'SETUP FORMED', at: pos.openedAt, detail: `${pos.setupKey} — a ${pos.direction} setup formed and the engine queued an order.`, paper: true },
    { stage: 'CONDITIONS CONFIRMED', at: pos.openedAt, detail: 'The strategy checklist passed in full; this is the moment the order became a candidate.', paper: true },
    { stage: 'SIGNAL', at: pos.openedAt, detail: `Intended entry $${pos.intendedEntry.toFixed(2)}, stop $${pos.stop.toFixed(2)}, target $${pos.target.toFixed(2)}.`, paper: true },
    { stage: 'RISK CHECK', at: pos.openedAt, detail: `Approved by the risk engine at size ${pos.quantity} for $${pos.riskUsd.toFixed(3)} of risk.`, paper: true },
    {
      stage: 'ENTRY', at: pos.filledAt ?? null,
      detail: missed
        ? `NOT FILLED — ${pos.note ?? 'the order was missed.'}`
        : filled ? `PAPER fill at $${pos.entry.toFixed(2)} (the next candle's open plus spread and slippage).`
        : 'Not filled yet — the entry candle has not closed.',
      paper: true,
    },
    {
      stage: 'MANAGEMENT', at: filled ? pos.filledAt ?? null : null,
      detail: filled ? `Managed candle by candle${pos.candlesHeld !== undefined ? ` for ${pos.candlesHeld} candle(s)` : ''}.` : 'No management — the position never opened.',
      paper: true,
    },
    {
      stage: 'EXIT', at: pos.closedAt ?? null,
      detail: closed && !missed
        ? `Exit ${pos.exitReason} at $${(pos.exit ?? 0).toFixed(2)} for ${(pos.rMultiple ?? 0) >= 0 ? '+' : ''}${(pos.rMultiple ?? 0).toFixed(2)}R. PAPER only — no money moved.`
        : missed ? 'Closed as MISSED; no position was ever opened.'
        : 'Still open.',
      paper: true,
    },
  ]
}
