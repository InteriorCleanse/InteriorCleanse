/**
 * Signal fusion: turn the playbook's separate votes into ONE decision a
 * human can read — and defend. Nothing here re-reads the market; it only
 * weighs the votes that already exist.
 *
 * The decision is one of:
 *   LONG / SHORT            — enough of the (regime-weighted) panel agrees,
 *                             and the winning side clearly outweighs the other.
 *   LONG WATCH / SHORT WATCH — a side leans, but not enough to act: something
 *                             is missing, and the decision names it.
 *   NO TRADE                — nobody wants a trade.
 *
 * Weights are regime-aware (a range-fade counts for nothing in a trend) and
 * are attached to the decision, so "why this, why now" is always answerable.
 * This function is pure and deterministic: the same votes give the same
 * decision every time.
 */

import { config } from '../config.ts'
import { regimeWeight } from './fusion/weights.ts'
import type { StrategyMeta, StrategyVote } from './strategies/types.ts'
import type { RegimeState } from './features/regime.ts'
import type { Signal, TradePlan } from './types.ts'

export type FusedAction = 'LONG' | 'SHORT' | 'LONG WATCH' | 'SHORT WATCH' | 'NO TRADE'

export type Contributor = {
  id: string
  name: string
  action: 'BUY' | 'SELL' | 'HOLD'
  direction: 'long' | 'short' | null
  confidence: number
  /** The regime weight of this strategy's family. Zero = disallowed here. */
  weight: number
  /** weight × confidence: what it actually contributed. */
  effective: number
}

export type FusedDecision = {
  action: FusedAction
  direction: 'long' | 'short' | null
  /** 0–100: how much of the allowed panel backs the winning side. */
  score: number
  /** Plain-English reasons the winning side is backed. */
  confirms: string[]
  /** What argues against it, and — for a WATCH — what is still missing. */
  invalidates: string[]
  contributors: Contributor[]
  /** The plan of the strongest contributor in the winning direction, if any. */
  plan?: TradePlan
  reason: string
  /** The regime the weights were chosen for, and the enter threshold used. */
  regime: RegimeState | null
  enterScore: number
}

export type FuseInputs = { votes: StrategyVote[]; metaById: Map<string, StrategyMeta>; regime: RegimeState | null }

export function fuse({ votes, metaById, regime }: FuseInputs): FusedDecision {
  const enterScore = config.fusion.enterScore
  const dominance = config.fusion.dominance

  const contributors: Contributor[] = votes.map((v) => {
    const family = metaById.get(v.id)?.family ?? 'session'
    const weight = regimeWeight(family, regime)
    const direction = v.action === 'BUY' ? 'long' : v.action === 'SELL' ? 'short' : null
    const effective = direction ? weight * (v.confidence / 100) : 0
    return { id: v.id, name: metaById.get(v.id)?.name ?? v.id, action: v.action, direction, confidence: v.confidence, weight, effective }
  })
  // Deterministic order: strongest first, ties broken by id.
  contributors.sort((a, b) => b.effective - a.effective || a.id.localeCompare(b.id))

  // The whole allowed panel: every enabled strategy that is not disallowed in this regime.
  const panelWeight = contributors.filter((c) => c.weight > 0).reduce((s, c) => s + c.weight, 0)
  const longW = contributors.filter((c) => c.direction === 'long').reduce((s, c) => s + c.effective, 0)
  const shortW = contributors.filter((c) => c.direction === 'short').reduce((s, c) => s + c.effective, 0)

  const byId = new Map(votes.map((v) => [v.id, v]))
  const nameReason = (c: Contributor) => `${c.name}: ${byId.get(c.id)?.reason ?? ''}`

  if (longW === 0 && shortW === 0) {
    // Nobody wants a trade. Name what the session model is waiting for, if it can.
    const session = votes.find((v) => v.id === 'session-ifvg')
    const missing = session?.evidence.find((e) => !e.passed)
    return {
      action: 'NO TRADE', direction: null, score: 0,
      confirms: [], invalidates: missing ? [`Waiting on: ${missing.step} — ${missing.detail}`] : ['No strategy sees a setup right now.'],
      contributors, reason: 'No strategy wants a trade.', regime, enterScore,
    }
  }

  const direction: 'long' | 'short' = longW >= shortW ? 'long' : 'short'
  const winnerW = direction === 'long' ? longW : shortW
  const loserW = direction === 'long' ? shortW : longW
  const score = panelWeight > 0 ? Math.round((winnerW / panelWeight) * 100) : 0
  const winners = contributors.filter((c) => c.direction === direction && c.effective > 0)
  const dissent = contributors.filter((c) => c.direction && c.direction !== direction && c.effective > 0)

  const confirms = winners.map(nameReason)
  const invalidates: string[] = dissent.map(nameReason)

  const dominates = winnerW >= loserW * dominance
  const enter = score >= enterScore && dominates
  const dir = direction === 'long' ? 'LONG' : 'SHORT'
  const action: FusedAction = enter ? (dir as FusedAction) : (`${dir} WATCH` as FusedAction)

  if (!enter) {
    if (!dominates) invalidates.unshift(`The other side carries too much weight (${winnerW.toFixed(2)} vs ${loserW.toFixed(2)}); waiting for cleaner agreement.`)
    else invalidates.unshift(`Agreement is only ${score}/100, under the ${enterScore} needed to act; waiting for more of the panel to line up.`)
    // What would confirm: the strongest non-voting allowed strategy in this direction.
    const abstaining = contributors.find((c) => c.action === 'HOLD' && c.weight > 0)
    if (abstaining) { const v = byId.get(abstaining.id); const miss = v?.evidence.find((e) => !e.passed); if (miss) invalidates.push(`${abstaining.name} would confirm once: ${miss.step} — ${miss.detail}`) }
  }

  const plan = winners.map((c) => byId.get(c.id)?.plan).find((p): p is TradePlan => !!p)
  const reason = enter
    ? `${action} — ${winners.length} strateg${winners.length === 1 ? 'y' : 'ies'} agree ${direction}, ${score}/100 of the panel behind it.`
    : `${action} — a ${direction} lean at ${score}/100, not enough to act yet.`

  return { action, direction, score, confirms, invalidates, contributors, plan, reason, regime, enterScore }
}

/** Turn a fused LONG/SHORT into a Signal the risk check and paper trader understand. */
export function fusedToSignal(d: FusedDecision, price: number, time: number): Signal | null {
  if ((d.action !== 'LONG' && d.action !== 'SHORT') || !d.plan) return null
  return {
    action: d.action === 'LONG' ? 'BUY' : 'SELL',
    reason: d.reason,
    price, time,
    setupKey: `${config.symbol}|${config.interval}|FUSION|${d.direction}`,
    evidence: [
      ...d.confirms.map((c) => ({ step: 'Agrees', passed: true, detail: c })),
      ...d.invalidates.map((c) => ({ step: 'Against', passed: false, detail: c })),
    ],
    plan: d.plan,
    quality: d.score,
  }
}
