/**
 * THE RESEARCH LAB — questions from the record, critique of every claim, and
 * a strategy-evolution pipeline that ends at a human, not at the engine.
 *
 * Three jobs:
 *
 *   1. RESEARCH QUESTIONS. Walk the evidence cohorts; wherever a cohort at or
 *      above the early bar has an interval clear of zero, draft a hypothesis in
 *      the §6 form (question, observation, hypothesis, null, dataset fixed,
 *      method) — status UNTESTED. Drafting is not testing: the cohort that
 *      prompted the question is the IN-SAMPLE observation, and the lab records
 *      it as such so it can never be mistaken for confirmation.
 *
 *   2. SELF-CRITIQUE. For any hypothesis, thesis or candidate the lab lists the
 *      standard ways the result could be wrong — sample, multiple comparisons,
 *      regime coverage, data quality, costs, look-ahead, survivorship — with the
 *      specific number behind each. The critique is attached to everything the
 *      lab reports; there is no "clean" view.
 *
 *   3. PROPOSALS. Any change to what the engine does — a parameter variant, a
 *      filter, retiring or promoting a strategy — is a PROPOSAL with evidence
 *      links and gates. A proposal passes its gates or it does not; a human
 *      APPROVES or REJECTS it; and approval RECORDS a decision, it applies
 *      nothing. Applying a change is a code or config edit a person makes with
 *      the proposal id in the commit. The engine's parameters are never written
 *      by this module or any other in the research or school layers.
 */

import { config } from '../../config.ts'
import { SAMPLE_BARS, byDimension } from '../analyst/cohorts.ts'
import type { Cohort, CohortDimension } from '../analyst/cohorts.ts'
import type { Dataset } from '../analyst/records.ts'
import { multipleTesting } from '../factory/ic.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'
import { makeHypothesis } from './hypotheses.ts'
import type { Hypothesis, NewHypothesis } from './hypotheses.ts'
import { deflatedSharpeFull, trialsFor } from './overfitting.ts'
import type { DeflatedSharpeFull } from './overfitting.ts'

// ---------------------------------------------------------------
// 1. Research questions
// ---------------------------------------------------------------

export const QUESTION_DIMENSIONS: CohortDimension[] = ['strategyId', 'session', 'regime', 'volatility', 'hourET', 'weekdayET', 'newsBucket', 'qualityBucket']

export type ResearchQuestion = {
  cohort: string
  dimension: CohortDimension
  value: string
  n: number
  meanR: number | null
  ci95: Cohort['stats']['ci95']
  /** The draft, UNTESTED. Not saved until the caller decides to. */
  draft: Hypothesis
  critique: Critique
}

const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

/** Draft hypotheses from cohorts whose 95% interval is clear of zero at the early bar or above. Pure. */
export function researchQuestions(d: Dataset, opts: { now?: number; dimensions?: CohortDimension[]; minN?: number } = {}): ResearchQuestion[] {
  const now = opts.now ?? Date.now()
  const minN = opts.minN ?? SAMPLE_BARS.early
  const out: ResearchQuestion[] = []
  if (d.provenance.source === 'MIXED') return out // a question is asked of one source; a mixed dataset is never the basis of one
  const source = d.provenance.source
  const dims = opts.dimensions ?? QUESTION_DIMENSIONS
  const comparisons = dims.reduce((a, dim) => a + byDimension(d, dim).rows.length, 0)
  for (const dim of dims) {
    const table = byDimension(d, dim)
    for (const c of table.rows) {
      const s = c.stats
      if (s.n < minN || !s.ci95 || !(s.ci95.lo > 0 || s.ci95.hi < 0)) continue
      const positive = s.ci95.lo > 0
      const value = c.name
      const input: NewHypothesis = {
        question: `Do trades in the ${dim} cohort "${value}" have a ${positive ? 'positive' : 'negative'} mean R that holds out of sample?`,
        observation: `Observed mean ${fx(s.meanR)}R (95% interval ${fx(s.ci95.lo)} to ${fx(s.ci95.hi)}) over ${s.n} ${d.provenance.source} trades in "${value}". This is the in-sample observation that prompted the question.`,
        hypothesis: `The mean R of trades where ${dim} = "${value}" is ${positive ? 'positive' : 'negative'}.`,
        nullHypothesis: `The mean R of trades where ${dim} = "${value}" is zero.`,
        direction: positive ? 'positive' : 'negative',
        dataset: { source, label: `SOURCE: ${d.provenance.source} · TRADES: ${s.n} · ${d.provenance.dataType}` },
        cohortFilters: c.filters,
        method: 'cohort mean with 95% Student-t interval; out-of-sample check on records decided after the draft date',
        markets: [config.symbol], timeframes: [config.interval],
        strategy: dim === 'strategyId' ? value : null, regime: dim === 'regime' ? value : null, session: dim === 'session' ? value : null,
        limitations: [`Drafted from the same ${s.n} trades it describes — in-sample by construction.`, `${comparisons} cohorts were examined to find this one; the multiple-comparison bar applies.`],
        now,
      }
      const draft = makeHypothesis(input)
      out.push({ cohort: c.name, dimension: dim, value, n: s.n, meanR: s.meanR, ci95: s.ci95, draft, critique: critiqueCohort(c, { comparisons, source: d.provenance.source }) })
    }
  }
  return out.sort((a, b) => b.n - a.n)
}

// ---------------------------------------------------------------
// 2. Self-critique
// ---------------------------------------------------------------

export type CritiqueItem = { concern: string; severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'; detail: string }

export type Critique = { items: CritiqueItem[]; worst: CritiqueItem['severity']; note: string }

function worstOf(items: CritiqueItem[]): CritiqueItem['severity'] {
  const order: CritiqueItem['severity'][] = ['HIGH', 'MEDIUM', 'LOW', 'NONE']
  return order.find((s) => items.some((i) => i.severity === s)) ?? 'NONE'
}

/** The standard ways a cohort result can be wrong, each with its number. Pure. */
export function critiqueCohort(c: Cohort, ctx: { comparisons?: number; source?: string; regimesCovered?: number; missingCandleShare?: number | null } = {}): Critique {
  const s = c.stats
  const items: CritiqueItem[] = []
  items.push(s.n < SAMPLE_BARS.insufficient
    ? { concern: 'Sample size', severity: 'HIGH', detail: `${s.n} trades — under the ${SAMPLE_BARS.insufficient}-trade bar. Nothing here is a result.` }
    : s.n < SAMPLE_BARS.early
      ? { concern: 'Sample size', severity: 'HIGH', detail: `${s.n} trades — an early sample; the interval ${s.ci95 ? `${fx(s.ci95.lo)} to ${fx(s.ci95.hi)}` : 'is undefined'}.` }
      : s.n < SAMPLE_BARS.developing
        ? { concern: 'Sample size', severity: 'MEDIUM', detail: `${s.n} trades — developing. ${s.tradesNeeded !== null ? `About ${s.tradesNeeded} would be needed for the interval to clear zero at this mean and spread.` : ''}` }
        : { concern: 'Sample size', severity: 'LOW', detail: `${s.n} trades.` })
  if (ctx.comparisons && ctx.comparisons > 1) {
    const mt = multipleTesting(ctx.comparisons)
    items.push({ concern: 'Multiple comparisons', severity: ctx.comparisons >= 20 ? 'HIGH' : ctx.comparisons >= 5 ? 'MEDIUM' : 'LOW', detail: `${ctx.comparisons} cohorts were examined; a cohort that stands out at α=0.05 would need α≈${mt.sidak.toExponential(1)} (Šidák) to stand out after correction.` })
  }
  const regimes = Object.keys(c.composition.regime ?? {}).filter((k) => k !== 'not recorded').length
  items.push({ concern: 'Regime coverage', severity: regimes <= 1 ? 'HIGH' : regimes === 2 ? 'MEDIUM' : 'LOW', detail: regimes === 0 ? 'No regime recorded on these trades.' : `${regimes} regime(s) represented: ${Object.entries(c.composition.regime ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}. A result seen in one regime is a result about that regime.` })
  if (ctx.missingCandleShare !== undefined && ctx.missingCandleShare !== null) {
    items.push({ concern: 'Data quality', severity: ctx.missingCandleShare > 0.02 ? 'HIGH' : ctx.missingCandleShare > 0 ? 'LOW' : 'NONE', detail: `${(ctx.missingCandleShare * 100).toFixed(2)}% of candles missing over the window.` })
  }
  items.push({ concern: 'Execution costs', severity: ctx.source === 'BACKTEST' ? 'MEDIUM' : 'LOW', detail: ctx.source === 'BACKTEST' ? 'Simulated fills. The realistic fill model is applied, but live spread and latency are not observed.' : 'Live market with simulated execution: real prices, modelled fills.' })
  items.push({ concern: 'Look-ahead', severity: 'LOW', detail: 'Cohort values come from the decision-time snapshot where recorded; fields the engine did not record are "not recorded", never inferred later.' })
  items.push({ concern: 'Survivorship', severity: c.filters.some((f) => f.dimension === 'strategyId') ? 'MEDIUM' : 'LOW', detail: 'Strategies that were retired or disabled do not add trades to the record; a strategy cohort describes what was allowed to run.' })
  const worst = worstOf(items)
  return { items, worst, note: `Worst concern: ${worst}. A critique is attached to every result the lab reports; there is no view without one.` }
}

// ---------------------------------------------------------------
// 3. Proposals — human approval, nothing applied
// ---------------------------------------------------------------

export type ProposalKind = 'parameter-variant' | 'filter' | 'retire' | 'promote' | 'watch'
export type ProposalStatus = 'DRAFT' | 'GATES FAILED' | 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXPIRED'

export type ProposalGate = { id: string; label: string; met: boolean; detail: string }

export type Proposal = {
  id: string
  kind: ProposalKind
  strategyId: string
  title: string
  rationale: string
  /** What would change, in words. Never applied by this system. */
  change: string
  /** Parameter values for a variant, for the human to copy into a commit. */
  params: Record<string, number> | null
  evidence: { hypothesisIds: string[]; recordIds: string[]; campaignId: string | null; passportId: string | null }
  gates: ProposalGate[]
  deflated: DeflatedSharpeFull | null
  critique: Critique | null
  status: ProposalStatus
  requires: 'HUMAN APPROVAL'
  createdAt: number
  expiresAt: number
  decidedAt: number | null
  decidedBy: string | null
  decisionNote: string | null
  engineVersion: string
  history: Array<{ at: number; event: string; detail: string }>
}

export const PROPOSAL_TTL_MS = 30 * 86_400_000
export const APPLY_NOTE = 'Approval records a human decision. Nothing is applied: a parameter change is a config edit a person makes and commits with this proposal id. The engine never reads proposals.'

function proposalId(kind: ProposalKind, strategyId: string, change: string, createdAt: number): string {
  let h = 2166136261
  for (const ch of `${kind}|${strategyId}|${change}|${createdAt}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return `prop-${kind}-${h.toString(36)}`
}

export type ProposalInput = {
  kind: ProposalKind
  strategyId: string
  title: string
  rationale: string
  change: string
  params?: Record<string, number> | null
  evidence?: Partial<Proposal['evidence']>
  /** Out-of-sample R series behind the proposal (backtest holdout or paper), for the deflation gate. */
  oosRs?: number[]
  /** Paper trades on record for the strategy. */
  paperTrades?: number
  /** Walk-forward: share of folds with positive OOS R. */
  walkForwardPositiveShare?: number | null
  /** Hypotheses supporting it, with their statuses. */
  hypothesisStatuses?: string[]
  critique?: Critique | null
  trials?: number
  now?: number
}

/** Build and gate a proposal. Pure over its inputs except the trial count (read from the registry when not given). */
export function makeProposal(input: ProposalInput): Proposal {
  const now = input.now ?? Date.now()
  const trials = input.trials ?? Math.max(1, trialsFor(input.strategyId))
  const oos = input.oosRs ?? []
  const deflated = oos.length ? deflatedSharpeFull(oos, trials, config.factory.deflatedSharpeMin) : null
  const gates: ProposalGate[] = []
  const structural = input.kind === 'retire' || input.kind === 'watch'
  gates.push({ id: 'oos-sample', label: `Out-of-sample trades ≥ ${config.factory.minOosTrades}`, met: oos.length >= config.factory.minOosTrades, detail: `${oos.length} out-of-sample trade(s) supplied.` })
  gates.push({ id: 'deflated', label: `Deflated Sharpe ≥ ${config.factory.deflatedSharpeMin} over ${trials} trial(s)`, met: deflated?.verdict === 'SURVIVES DEFLATION', detail: deflated ? deflated.note : 'No out-of-sample series supplied.' })
  gates.push({ id: 'walk-forward', label: 'Walk-forward: most folds positive out of sample', met: (input.walkForwardPositiveShare ?? 0) >= config.factory.stabilityMinShare, detail: input.walkForwardPositiveShare === null || input.walkForwardPositiveShare === undefined ? 'No walk-forward result supplied.' : `${Math.round(input.walkForwardPositiveShare * 100)}% of folds positive (bar ${Math.round(config.factory.stabilityMinShare * 100)}%).` })
  gates.push({ id: 'hypothesis', label: 'A supporting hypothesis is OOS SUPPORTED', met: (input.hypothesisStatuses ?? []).includes('OOS SUPPORTED'), detail: input.hypothesisStatuses?.length ? `Statuses: ${input.hypothesisStatuses.join(', ')}.` : 'No hypothesis linked.' })
  gates.push({ id: 'paper', label: `Paper trades ≥ ${config.replay.minSetupsForConfidence} for the strategy`, met: (input.paperTrades ?? 0) >= config.replay.minSetupsForConfidence, detail: `${input.paperTrades ?? 0} paper trade(s) on record.` })
  gates.push({ id: 'critique', label: 'No HIGH-severity concern in the critique', met: input.critique ? input.critique.worst !== 'HIGH' : false, detail: input.critique ? input.critique.note : 'No critique attached.' })
  const required = structural ? gates.filter((g) => g.id === 'paper' || g.id === 'critique') : gates
  const passed = required.every((g) => g.met)
  const p: Proposal = {
    id: proposalId(input.kind, input.strategyId, input.change, now), kind: input.kind, strategyId: input.strategyId, title: input.title, rationale: input.rationale, change: input.change,
    params: input.params ?? null,
    evidence: { hypothesisIds: [], recordIds: [], campaignId: null, passportId: null, ...(input.evidence ?? {}) },
    gates, deflated, critique: input.critique ?? null,
    status: passed ? 'PROPOSED' : 'GATES FAILED', requires: 'HUMAN APPROVAL',
    createdAt: now, expiresAt: now + PROPOSAL_TTL_MS, decidedAt: null, decidedBy: null, decisionNote: null, engineVersion: VERSION,
    history: [{ at: now, event: 'created', detail: passed ? `All ${required.length} required gate(s) met. Awaiting a human.` : `${required.filter((g) => !g.met).length} of ${required.length} required gate(s) failed: ${required.filter((g) => !g.met).map((g) => g.id).join(', ')}.` }],
  }
  return p
}

export function decideProposal(p: Proposal, decision: 'APPROVED' | 'REJECTED', by: string, note: string, now = Date.now()): Proposal {
  if (p.status !== 'PROPOSED') throw new Error(`proposal ${p.id} is ${p.status}; only a PROPOSED proposal can be decided`)
  if (!by.trim()) throw new Error('a decision needs a human name')
  return { ...p, status: decision, decidedAt: now, decidedBy: by, decisionNote: note, history: [...p.history, { at: now, event: decision.toLowerCase(), detail: `${by}: ${note} — ${APPLY_NOTE}` }] }
}

export function expireProposal(p: Proposal, now = Date.now()): Proposal {
  if (p.status !== 'PROPOSED' || now < p.expiresAt) return p
  return { ...p, status: 'EXPIRED', history: [...p.history, { at: now, event: 'expired', detail: 'Not decided within the proposal window.' }] }
}

const PREFIX = 'proposal:'

export function saveProposal(p: Proposal): Proposal { store().setJson(PREFIX + p.id, p); return p }
export function getProposal(id: string): Proposal | null { return store().getJson<Proposal>(PREFIX + id) }
export function listProposals(filter: { status?: ProposalStatus; strategyId?: string } = {}): Proposal[] {
  const out: Proposal[] = []
  for (const key of store().keysWithPrefix(PREFIX)) {
    const p = store().getJson<Proposal>(key)
    if (!p) continue
    if (filter.status && p.status !== filter.status) continue
    if (filter.strategyId && p.strategyId !== filter.strategyId) continue
    out.push(p)
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}
export function sweepProposals(now = Date.now()): Proposal[] {
  const changed: Proposal[] = []
  for (const p of listProposals()) { const n = expireProposal(p, now); if (n !== p) changed.push(saveProposal(n)) }
  return changed
}

export function renderProposal(p: Proposal): string {
  return [
    `PROPOSAL ${p.id} · ${p.kind} · ${p.strategyId} · ${p.status} · requires ${p.requires}`,
    p.title, p.rationale, `Change: ${p.change}`,
    p.params ? `Params: ${Object.entries(p.params).map(([k, v]) => `${k}=${v}`).join(', ')}` : 'Params: none',
    'Gates:', ...p.gates.map((g) => `  [${g.met ? 'x' : ' '}] ${g.label} — ${g.detail}`),
    p.decidedAt ? `Decided ${new Date(p.decidedAt).toISOString()} by ${p.decidedBy}: ${p.decisionNote}` : `Expires ${new Date(p.expiresAt).toISOString()}`,
    APPLY_NOTE,
  ].join('\n')
}
