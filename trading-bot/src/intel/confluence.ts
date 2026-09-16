/**
 * Strategy visualisation and confluence (Phase 22G).
 *
 * Shows WHICH strategies see something, WHAT each one still needs, and where
 * they agree or disagree. The chain it draws —
 *
 *     structure + liquidity + imbalance + order flow + regime → ENGINE SIGNAL
 *
 * — is a PICTURE of the fused decision, not a second route to one. The existing
 * fusion engine remains authoritative: this module reads `FusedDecision` and the
 * individual `StrategyVote`s and renders them. It computes no weight, casts no
 * vote and can never change what the engine decided.
 *
 * Strategies are DISCOVERED from the registry, never hardcoded, so a strategy
 * added later appears here automatically.
 */

import type { StrategyVote, StrategyMeta } from '../strategies/types.ts'
import type { FusedDecision } from '../fusion.ts'
import type { EvidenceStep } from '../types.ts'

/** One strategy's current state, as a layer the UI can toggle. */
export type StrategyLayer = {
  id: string
  name: string
  family: string
  summary: string
  /** BUY / SELL / HOLD — the strategy's own vote, unmodified. */
  action: 'BUY' | 'SELL' | 'HOLD'
  direction: 'long' | 'short' | null
  confidence: number
  reason: string
  /** Conditions that are currently TRUE. */
  met: EvidenceStep[]
  /** Conditions that are currently FALSE — what it is waiting for. */
  missing: EvidenceStep[]
  /** met / (met + missing), 0–1. A readiness bar, not a probability. */
  readiness: number
  hasPlan: boolean
  /** True when this strategy needs the live tape and so may be unavailable. */
  needsTape: boolean
}

/** Build the per-strategy layers from the registry metas and the votes. */
export function strategyLayers(votes: StrategyVote[], metaById: Map<string, StrategyMeta>): StrategyLayer[] {
  return votes.map((v) => {
    const meta = metaById.get(v.id)
    const met = v.evidence.filter((e) => e.passed)
    const missing = v.evidence.filter((e) => !e.passed)
    const total = met.length + missing.length
    return {
      id: v.id,
      name: meta?.name ?? v.id,
      family: meta?.family ?? 'unknown',
      summary: meta?.summary ?? '',
      action: v.action,
      direction: v.direction,
      confidence: v.confidence,
      reason: v.reason,
      met, missing,
      readiness: total > 0 ? met.length / total : 0,
      hasPlan: !!v.plan,
      needsTape: meta?.needsTape ?? false,
    }
  }).sort((a, b) => b.readiness - a.readiness || a.id.localeCompare(b.id))
}

/** Who agrees with whom right now. Descriptive only. */
export type Agreement = {
  long: string[]
  short: string[]
  holding: string[]
  /** Strategies voting opposite the fused direction — the dissent the UI must not hide. */
  disagreeing: string[]
  /** True when at least one strategy votes against the fused direction. */
  contested: boolean
  note: string
}

export function agreement(votes: StrategyVote[], decision: FusedDecision | null): Agreement {
  const long = votes.filter((v) => v.direction === 'long' && v.action !== 'HOLD').map((v) => v.id).sort()
  const short = votes.filter((v) => v.direction === 'short' && v.action !== 'HOLD').map((v) => v.id).sort()
  const holding = votes.filter((v) => v.action === 'HOLD').map((v) => v.id).sort()
  const dir = decision?.direction ?? null
  const disagreeing = dir === 'long' ? short : dir === 'short' ? long : []
  const note = !dir
    ? `No fused direction: ${long.length} lean long, ${short.length} lean short, ${holding.length} are holding.`
    : disagreeing.length
      ? `The panel leans ${dir}, but ${disagreeing.length} strategy(ies) vote the other way: ${disagreeing.join(', ')}.`
      : `Every strategy with a view agrees on ${dir}.`
  return { long, short, holding, disagreeing, contested: disagreeing.length > 0, note }
}

/** One rung of the confluence chain: does this ingredient support the fused call? */
export type ConfluenceLink = {
  key: 'structure' | 'liquidity' | 'imbalance' | 'order-flow' | 'regime' | 'strategies'
  label: string
  /** true = supports, false = argues against, null = not available / not stated. */
  supports: boolean | null
  detail: string
}

export type ConfluenceChain = {
  links: ConfluenceLink[]
  /** The engine's own decision, copied — never recomputed here. */
  decision: { action: string; direction: string | null; score: number; enterScore: number; regime: string | null } | null
  /** How many links support, out of those that had anything to say. */
  supporting: number
  stated: number
  note: string
}

/**
 * The confluence picture for the current fused decision.
 *
 * Each link is read out of material the engine already produced: the fused
 * decision's own confirms/invalidates lists, the strategy families that voted,
 * and the regime the weights were chosen for. Nothing is scored here — the
 * `score` shown is the fusion engine's.
 */
export function confluenceChain(input: {
  votes: StrategyVote[]
  decision: FusedDecision | null
  metaById: Map<string, StrategyMeta>
  /** Order-flow availability, straight from the feature snapshot. */
  orderFlowAvailable: boolean
  orderFlowNote: string
}): ConfluenceChain {
  const d = input.decision
  const confirms = d?.confirms ?? []
  const invalidates = d?.invalidates ?? []
  const families = new Set(input.votes.filter((v) => v.action !== 'HOLD').map((v) => input.metaById.get(v.id)?.family).filter(Boolean) as string[])

  /** Does any engine-written confirm/invalidate line mention this ingredient? */
  const mentions = (list: string[], words: RegExp): string[] => list.filter((s) => words.test(s))

  const link = (key: ConfluenceLink['key'], label: string, words: RegExp, familyHint?: string): ConfluenceLink => {
    const pro = mentions(confirms, words)
    const con = mentions(invalidates, words)
    if (!pro.length && !con.length) {
      const viaFamily = familyHint && families.has(familyHint)
      return {
        key, label,
        supports: viaFamily ? true : null,
        detail: viaFamily
          ? `A ${familyHint} strategy is voting, but the fused decision did not name this ingredient explicitly.`
          : 'The engine did not state anything about this ingredient for this decision.',
      }
    }
    return {
      key, label,
      supports: pro.length >= con.length ? pro.length > 0 : false,
      detail: [...pro.map((s) => `supports: ${s}`), ...con.map((s) => `against: ${s}`)].join(' · '),
    }
  }

  const links: ConfluenceLink[] = [
    link('structure', 'Market structure', /structure|swing|BOS|CHoCH|trend|higher high|lower low/i, 'trend'),
    link('liquidity', 'Liquidity', /liquidity|sweep|raid|swept|equal high|equal low|session high|session low/i, 'session'),
    link('imbalance', 'Imbalance (FVG)', /gap|fvg|imbalance|inversion/i),
    {
      key: 'order-flow', label: 'Order flow',
      supports: input.orderFlowAvailable ? (mentions(confirms, /delta|flow|tape|absorption|book/i).length > 0 ? true : mentions(invalidates, /delta|flow|tape|absorption|book/i).length > 0 ? false : null) : null,
      detail: input.orderFlowAvailable
        ? (mentions([...confirms, ...invalidates], /delta|flow|tape|absorption|book/i).join(' · ') || 'The tape is trusted, but the decision did not cite order flow.')
        : `UNAVAILABLE — ${input.orderFlowNote}`,
    },
    {
      key: 'regime', label: 'Regime',
      supports: d?.regime ? true : null,
      detail: d?.regime ? `Weights were chosen for the "${d.regime}" regime; the enter threshold was ${d.enterScore}.` : 'No regime was available when the votes were weighted.',
    },
    {
      key: 'strategies', label: 'Strategy panel',
      supports: d ? d.score >= d.enterScore : null,
      detail: d ? `Agreement ${d.score}/100 against an enter threshold of ${d.enterScore}. ${d.reason}` : 'No fused decision was produced.',
    },
  ]

  const stated = links.filter((l) => l.supports !== null).length
  const supporting = links.filter((l) => l.supports === true).length
  return {
    links,
    decision: d ? { action: d.action, direction: d.direction, score: d.score, enterScore: d.enterScore, regime: d.regime } : null,
    supporting, stated,
    note: d
      ? `${supporting} of ${stated} stated ingredients support the engine's "${d.action}" call. This is a picture of the fusion engine's decision, not a second opinion.`
      : 'No fused decision to picture yet.',
  }
}
