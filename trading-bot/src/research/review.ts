/**
 * THE HUMAN APPROVAL CENTER — the research review queue.
 *
 * For every proposed strategy change the reviewer sees the original strategy,
 * the proposed version, the reason, the evidence, the counterevidence, the
 * out-of-sample, walk-forward, Monte Carlo and robustness results of the
 * linked experiments, the risks and unknowns the challenger raised, the
 * comparison against the baseline, and the research history. Three buttons:
 *
 *   APPROVE FOR PAPER TEST — advances the workflow to a paper test stage
 *   REJECT                 — closes it
 *   REQUEST MORE RESEARCH  — puts a question back on the research queue
 *
 * Approving MUST NOT modify production. It records a decision and a stage.
 * Applying anything remains a config edit a person makes and commits. The
 * production strategy is unchanged by every path through this module.
 */

import { metaById } from '../strategies/registry.ts'
import { store } from '../store.ts'
import { listExperiments } from './experiments.ts'
import type { Experiment } from './experiments.ts'
import { getHypothesis } from './hypotheses.ts'
import { decideProposal, getProposal, listProposals, saveProposal } from './lab.ts'
import type { Proposal } from './lab.ts'
import { getQueueItem, queueId, saveQueueItem } from './queue.ts'
import type { QueueItem } from './queue.ts'

export type ReviewStage = 'AWAITING REVIEW' | 'MORE RESEARCH REQUESTED' | 'APPROVED FOR PAPER TEST' | 'REJECTED' | 'GATES FAILED' | 'EXPIRED'

export type ReviewRecord = {
  proposalId: string
  stage: ReviewStage
  decidedBy: string | null
  decidedAt: number | null
  note: string | null
  /** The queue item created by a "request more research". */
  researchQueueItemId: string | null
  history: Array<{ at: number; event: string; detail: string }>
}

export type ReviewCard = {
  proposal: Proposal
  review: ReviewRecord
  original: { strategyId: string; name: string; summary: string; parameters: Record<string, number> }
  proposed: { change: string; parameters: Record<string, number> | null }
  evidence: Array<{ experimentId: string; kind: string; result: string; oos: string; walkForward: string; monteCarlo: string; robustness: string; baseline: string }>
  counterevidence: string[]
  risks: string[]
  unknowns: string[]
  comparison: string[]
  researchHistory: Array<{ at: number; event: string; detail: string }>
  canDecide: boolean
  note: string
}

const PREFIX = 'review:'
const APPLY_NOTE = 'Approval advances the workflow to a paper test stage. It changes no production parameter; applying anything is a config edit a person makes and commits with the proposal id.'

export function getReview(proposalId: string): ReviewRecord | null { return store().getJson<ReviewRecord>(PREFIX + proposalId) }
function saveReview(r: ReviewRecord): ReviewRecord { store().setJson(PREFIX + r.proposalId, r); return r }

function reviewFor(p: Proposal, now: number): ReviewRecord {
  const prior = getReview(p.id)
  if (prior) return prior
  const stage: ReviewStage = p.status === 'PROPOSED' ? 'AWAITING REVIEW' : p.status === 'GATES FAILED' ? 'GATES FAILED' : p.status === 'EXPIRED' ? 'EXPIRED' : p.status === 'REJECTED' ? 'REJECTED' : 'APPROVED FOR PAPER TEST'
  return saveReview({ proposalId: p.id, stage, decidedBy: p.decidedBy, decidedAt: p.decidedAt, note: p.decisionNote, researchQueueItemId: null, history: [{ at: now, event: 'opened', detail: `Review record opened with the proposal at ${p.status}.` }] })
}

const fx = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

function evidenceRow(e: Experiment): ReviewCard['evidence'][number] {
  const ch = e.challenge as { overall?: string } | null
  return {
    experimentId: e.experimentId, kind: e.kind, result: e.result,
    oos: e.oosResult ? `n=${e.oosResult.trades} mean ${fx(e.oosResult.meanR)}R${e.oosResult.ci95 ? ` (${fx(e.oosResult.ci95.lo)}..${fx(e.oosResult.ci95.hi)})` : ''}` : 'not run',
    walkForward: e.walkForwardResult ? `${e.walkForwardResult.positiveFolds}/${e.walkForwardResult.folds} folds positive` : 'not run',
    monteCarlo: e.monteCarloResult ? `total R p5 ${fx(e.monteCarloResult.totalRp5)} / p95 ${fx(e.monteCarloResult.totalRp95)}; ${Math.round(e.monteCarloResult.profitableShare * 100)}% profitable` : 'not run',
    robustness: `${e.robustnessResult?.verdict ?? 'UNTESTED'}${ch?.overall ? ` · challenger ${ch.overall}` : ''}`,
    baseline: e.comparison.oos?.note ?? 'no out-of-sample comparison',
  }
}

export function reviewCard(proposalId: string, now = Date.now()): ReviewCard | null {
  const p = getProposal(proposalId)
  if (!p) return null
  const review = reviewFor(p, now)
  const meta = metaById().get(p.strategyId)
  const original: ReviewCard['original'] = { strategyId: p.strategyId, name: meta?.name ?? p.strategyId, summary: meta?.summary ?? 'no registry entry', parameters: Object.fromEntries((meta?.parameters ?? []).map((x) => [x.name, x.default])) }
  const exps = [...listExperiments({ strategyId: p.strategyId, status: 'DONE' }), ...p.evidence.hypothesisIds.flatMap((h) => listExperiments({ hypothesisId: h, status: 'DONE' }))]
  const uniq = [...new Map(exps.map((e) => [e.experimentId, e])).values()]
  const counterevidence = [...new Set([...uniq.flatMap((e) => e.counterevidence), ...p.evidence.hypothesisIds.flatMap((h) => getHypothesis(h)?.counterevidence ?? [])])]
  const risks: string[] = []
  const unknowns: string[] = []
  for (const e of uniq) {
    const ch = e.challenge as { attacks?: Array<{ question: string; verdict: string; detail: string }> } | null
    for (const a of ch?.attacks ?? []) {
      if (a.verdict === 'WEAKENED' || a.verdict === 'DISPROVED') risks.push(`${a.question} — ${a.verdict}: ${a.detail}`)
      if (a.verdict === 'UNTESTABLE') unknowns.push(`${a.question} — ${a.detail}`)
    }
  }
  for (const g of p.gates.filter((x) => !x.met)) risks.push(`Gate not met: ${g.label} — ${g.detail}`)
  if (p.critique) for (const c of p.critique.items.filter((x) => x.severity === 'HIGH')) risks.push(`${c.concern}: ${c.detail}`)
  const comparison = uniq.map((e) => `${e.experimentId}: treatment OOS ${fx(e.oosResult?.meanR)}R (n=${e.oosResult?.trades ?? 0}) vs baseline ${fx(e.baselineOos?.meanR)}R (n=${e.baselineOos?.trades ?? 0}) — ${e.comparison.oos?.verdict ?? 'TOO FEW'}`)
  const researchHistory = [...p.history.map((h) => ({ at: h.at, event: `proposal:${h.event}`, detail: h.detail })), ...p.evidence.hypothesisIds.flatMap((h) => (getHypothesis(h)?.history ?? []).map((x) => ({ at: x.at, event: `hypothesis:${x.event}`, detail: x.detail }))), ...review.history.map((h) => ({ at: h.at, event: `review:${h.event}`, detail: h.detail }))].sort((a, b) => a.at - b.at)
  return {
    proposal: p, review, original, proposed: { change: p.change, parameters: p.params },
    evidence: uniq.map(evidenceRow), counterevidence: counterevidence.length ? counterevidence : ['none recorded — which is not the same as none existing'],
    risks, unknowns: [...new Set(unknowns)], comparison, researchHistory,
    canDecide: p.status === 'PROPOSED' && review.stage === 'AWAITING REVIEW',
    note: APPLY_NOTE,
  }
}

export function reviewQueue(now = Date.now()): { awaiting: ReviewCard[]; other: Array<{ proposalId: string; title: string; stage: ReviewStage; status: Proposal['status'] }>; note: string } {
  const all = listProposals()
  const awaiting = all.filter((p) => p.status === 'PROPOSED').map((p) => reviewCard(p.id, now)!).filter((c) => c.review.stage === 'AWAITING REVIEW')
  const other = all.filter((p) => !awaiting.some((c) => c.proposal.id === p.id)).map((p) => ({ proposalId: p.id, title: p.title, stage: reviewFor(p, now).stage, status: p.status }))
  return { awaiting, other, note: awaiting.length ? `${awaiting.length} proposal(s) await a human. ${APPLY_NOTE}` : `Nothing awaits review. Proposals reach this queue only after passing their gates. ${APPLY_NOTE}` }
}

export type ReviewDecision = 'APPROVE FOR PAPER TEST' | 'REJECT' | 'REQUEST MORE RESEARCH'

export function decideReview(proposalId: string, decision: ReviewDecision, by: string, note: string, now = Date.now()): ReviewRecord {
  const p = getProposal(proposalId)
  if (!p) throw new Error('no such proposal')
  const review = reviewFor(p, now)
  if (!by.trim()) throw new Error('a decision needs a human name')
  if (decision === 'REQUEST MORE RESEARCH') {
    if (p.status !== 'PROPOSED' && p.status !== 'GATES FAILED') throw new Error(`proposal is ${p.status}; more research can be requested only while it is open`)
    const question = `More research requested on "${p.title}" (${p.strategyId}): ${note || 'the reviewer wants more evidence'}`
    const id = queueId(question, 'PAPER', [{ dimension: 'strategyId', values: [p.strategyId] }])
    const item: QueueItem = getQueueItem(id) ?? { id, priority: 60, priorityReasons: ['+10: requested by a human reviewer', '0: the size of any observed edge is not a priority input'], question, hypothesis: null, hypothesisId: p.evidence.hypothesisIds[0] ?? null, origin: 'manual', dataset: { source: 'PAPER', strategyId: p.strategyId, filters: [{ dimension: 'strategyId', values: [p.strategyId] }] }, direction: 'positive', sampleSize: 0, requiredData: { minTrades: 10, have: 0, missing: ['the reviewer\'s question, restated as a testable cohort'] }, status: 'QUEUED', maturity: 'QUESTION', createdAt: now, updatedAt: now, lastTested: null, nextTest: null, experimentIds: [], contradictions: 0, duplicateOf: null, note: `Requested by ${by} from the review queue.` }
    saveQueueItem(item)
    return saveReview({ ...review, stage: 'MORE RESEARCH REQUESTED', decidedBy: by, decidedAt: now, note, researchQueueItemId: item.id, history: [...review.history, { at: now, event: 'more-research', detail: `${by}: ${note}. Queue item ${item.id} created. The proposal stays open; nothing is applied.` }] })
  }
  if (p.status !== 'PROPOSED') throw new Error(`proposal is ${p.status}; only a PROPOSED proposal can be decided`)
  const decided = decideProposal(p, decision === 'REJECT' ? 'REJECTED' : 'APPROVED', by, note, now)
  saveProposal(decided)
  const stage: ReviewStage = decision === 'REJECT' ? 'REJECTED' : 'APPROVED FOR PAPER TEST'
  return saveReview({ ...review, stage, decidedBy: by, decidedAt: now, note, history: [...review.history, { at: now, event: stage.toLowerCase(), detail: `${by}: ${note}. ${APPLY_NOTE}` }] })
}
