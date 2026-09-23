/**
 * THE RESEARCH QUEUE and the MATURITY LIFECYCLE.
 *
 * Every research item moves through one lifecycle and never past it:
 *
 *   OBSERVATION → QUESTION → HYPOTHESIS → TESTING → INSUFFICIENT DATA →
 *   OBSERVED IN SAMPLE → OOS TESTING → OOS SUPPORTED → ROBUSTNESS REVIEW →
 *   UNDER REVIEW → REASSESSMENT
 *
 * There is no "proven", no "guaranteed", no "best". Maturity is DERIVED from
 * the linked hypothesis and experiments, never set by hand.
 *
 * Items come from four sources: cohort questions the lab drafts from the
 * record (50-trade bar, interval clear of zero), observation clusters the
 * market observer recorded, experiments due for reassessment, and signals
 * other monitors hand in (drift, decay). Ids are deterministic from the
 * question and its dataset, so regeneration updates an item in place and a
 * restart cannot duplicate it.
 *
 * PRIORITY is about data availability, research value, duplication,
 * contradictory evidence, sample size and whether the question is already
 * under test. It never looks at how profitable a result looks: the mean R of
 * a cohort is deliberately absent from the priority arithmetic.
 */

import { SAMPLE_BARS, cohort } from '../analyst/cohorts.ts'
import type { CohortFilter } from '../analyst/cohorts.ts'
import type { Dataset } from '../analyst/records.ts'
import { listObservations } from '../observer/events.ts'
import type { Observation } from '../observer/events.ts'
import { store } from '../store.ts'
import { experimentsDueForReassessment, listExperiments } from './experiments.ts'
import type { Experiment } from './experiments.ts'
import { getHypothesis, listHypotheses } from './hypotheses.ts'
import type { Hypothesis, HypothesisDirection } from './hypotheses.ts'
import { researchQuestions } from './lab.ts'

export const MATURITY = ['OBSERVATION', 'QUESTION', 'HYPOTHESIS', 'TESTING', 'INSUFFICIENT DATA', 'OBSERVED IN SAMPLE', 'OOS TESTING', 'OOS SUPPORTED', 'ROBUSTNESS REVIEW', 'UNDER REVIEW', 'REASSESSMENT'] as const
export type Maturity = (typeof MATURITY)[number]

export type QueueStatus = 'QUEUED' | 'BLOCKED' | 'UNDER TEST' | 'TESTED' | 'PARKED' | 'DONE'
export type QueueOrigin = 'cohort' | 'observation' | 'reassessment' | 'drift' | 'decay' | 'manual'

export type QueueItem = {
  id: string
  priority: number
  priorityReasons: string[]
  question: string
  hypothesis: string | null
  hypothesisId: string | null
  origin: QueueOrigin
  dataset: { source: 'PAPER' | 'BACKTEST'; strategyId: string | null; filters: CohortFilter[] }
  direction: HypothesisDirection
  sampleSize: number
  requiredData: { minTrades: number; have: number; missing: string[] }
  status: QueueStatus
  maturity: Maturity
  createdAt: number
  updatedAt: number
  lastTested: number | null
  nextTest: number | null
  experimentIds: string[]
  contradictions: number
  duplicateOf: string | null
  note: string
}

export type QueueSignal = {
  origin: Exclude<QueueOrigin, 'cohort' | 'observation' | 'reassessment'>
  question: string
  hypothesis?: string | null
  source: 'PAPER' | 'BACKTEST'
  strategyId: string | null
  filters: CohortFilter[]
  direction: HypothesisDirection
  reason: string
}

const PREFIX = 'queue:'

function hash(s: string): string {
  let h = 2166136261
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(36)
}

export function queueId(question: string, source: string, filters: CohortFilter[]): string {
  const norm = question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return `q-${hash(`${norm}|${source}|${JSON.stringify(filters)}`)}`
}

export function getQueueItem(id: string): QueueItem | null { return store().getJson<QueueItem>(PREFIX + id) }
export function saveQueueItem(q: QueueItem): QueueItem { store().setJson(PREFIX + q.id, q); return q }
export function listQueue(filter: { status?: QueueStatus; origin?: QueueOrigin; maturity?: Maturity } = {}): QueueItem[] {
  const out: QueueItem[] = []
  for (const key of store().keysWithPrefix(PREFIX)) {
    const q = store().getJson<QueueItem>(key)
    if (!q) continue
    if (filter.status && q.status !== filter.status) continue
    if (filter.origin && q.origin !== filter.origin) continue
    if (filter.maturity && q.maturity !== filter.maturity) continue
    out.push(q)
  }
  return out.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
}

// ---------------------------------------------------------------
// Maturity — derived, never set
// ---------------------------------------------------------------

export function maturityOf(h: Hypothesis | null, experiments: Experiment[], now = Date.now()): Maturity {
  const done = experiments.filter((e) => e.status === 'DONE').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  const latest = done[0] ?? null
  if (latest && latest.nextTest !== null && latest.nextTest <= now) return 'REASSESSMENT'
  if (h?.status === 'UNDER REVIEW') return 'UNDER REVIEW'
  if (latest?.result === 'OOS SUPPORTED') return latest.robustnessResult?.verdict === 'UNTESTED' || latest.robustnessResult?.verdict === 'FRAGILE' ? 'ROBUSTNESS REVIEW' : 'OOS SUPPORTED'
  if (latest && (latest.result === 'INCONCLUSIVE' || latest.result === 'NOT SUPPORTED')) return 'OOS TESTING'
  if (latest?.result === 'OBSERVED IN SAMPLE' || h?.status === 'OBSERVED IN SAMPLE') return 'OBSERVED IN SAMPLE'
  if (latest?.result === 'INSUFFICIENT DATA' || h?.status === 'INSUFFICIENT DATA') return 'INSUFFICIENT DATA'
  if (experiments.some((e) => e.status === 'RUNNING' || e.status === 'REGISTERED') || h?.status === 'TESTING') return 'TESTING'
  if (h) return 'HYPOTHESIS'
  return 'QUESTION'
}

// ---------------------------------------------------------------
// Priority — never about how profitable a result looks
// ---------------------------------------------------------------

export function prioritise(q: Omit<QueueItem, 'priority' | 'priorityReasons'>, ctx: { underTest: boolean; duplicate: boolean; contradictions: number; experimentsRun: number; lastTested: number | null; now: number }): { priority: number; reasons: string[] } {
  let p = 50
  const reasons: string[] = []
  const add = (n: number, why: string) => { p += n; reasons.push(`${n >= 0 ? '+' : ''}${n}: ${why}`) }
  if (ctx.duplicate) return { priority: 0, reasons: ['0: duplicate of an existing item; parked'] }
  const gap = q.requiredData.minTrades - q.requiredData.have
  if (gap <= 0) add(20, `data available: ${q.requiredData.have} records against a bar of ${q.requiredData.minTrades}`)
  else if (gap <= q.requiredData.minTrades / 2) add(-5, `close to testable: ${gap} more record(s) needed`)
  else add(-25, `not yet testable: ${gap} more record(s) needed (${q.requiredData.missing.join(', ') || 'sample'})`)
  if (ctx.contradictions > 0) add(15, `${ctx.contradictions} piece(s) of contradictory evidence to resolve`)
  if (ctx.underTest) add(-30, 'already under test')
  if (ctx.experimentsRun === 0) add(10, 'never tested — a first result has the most research value')
  else add(-5 * Math.min(3, ctx.experimentsRun), `${ctx.experimentsRun} experiment(s) already run`)
  if (q.sampleSize >= SAMPLE_BARS.developing) add(5, 'developing dataset behind it')
  if (ctx.lastTested !== null && ctx.now - ctx.lastTested < 7 * 86_400_000) add(-10, 'tested within the last week')
  if (q.origin === 'reassessment') add(10, 'a finished experiment is due for reassessment')
  if (q.origin === 'drift' || q.origin === 'decay') add(10, `raised by the ${q.origin} monitor`)
  reasons.push('0: the size of any observed edge is not a priority input')
  return { priority: Math.max(0, Math.min(100, Math.round(p))), reasons }
}

// ---------------------------------------------------------------
// Generation
// ---------------------------------------------------------------

export type GenerateInput = {
  paper: Dataset
  backtest?: Dataset | null
  signals?: QueueSignal[]
  now?: number
}

export type GenerateResult = { created: number; updated: number; items: QueueItem[] }

function upsertItem(draft: Omit<QueueItem, 'priority' | 'priorityReasons' | 'status' | 'maturity' | 'createdAt' | 'updatedAt' | 'lastTested' | 'nextTest' | 'experimentIds' | 'contradictions' | 'duplicateOf'>, now: number, seen: Set<string>): { item: QueueItem; isNew: boolean } {
  const prior = getQueueItem(draft.id)
  const h = draft.hypothesisId ? getHypothesis(draft.hypothesisId) : null
  const experiments = draft.hypothesisId ? listExperiments({ hypothesisId: draft.hypothesisId }) : []
  const duplicate = [...seen].find((id) => id !== draft.id && getQueueItem(id)?.question.toLowerCase() === draft.question.toLowerCase()) ?? null
  const done = experiments.filter((e) => e.status === 'DONE')
  const lastTested = done.length ? Math.max(...done.map((e) => e.finishedAt ?? 0)) : prior?.lastTested ?? null
  const nextTest = done.length ? Math.max(...done.map((e) => e.nextTest ?? 0)) || null : null
  const underTest = experiments.some((e) => e.status === 'RUNNING' || e.status === 'REGISTERED')
  const contradictions = (h?.counterevidence.length ?? 0) + done.reduce((a, e) => a + e.counterevidence.length, 0)
  const maturity = maturityOf(h, experiments, now)
  const base: Omit<QueueItem, 'priority' | 'priorityReasons'> = {
    ...draft, status: prior?.status ?? 'QUEUED', maturity, createdAt: prior?.createdAt ?? now, updatedAt: now, lastTested, nextTest, experimentIds: experiments.map((e) => e.experimentId), contradictions, duplicateOf: duplicate,
  }
  const pr = prioritise(base, { underTest, duplicate: duplicate !== null, contradictions, experimentsRun: done.length, lastTested, now })
  let status: QueueStatus = base.status
  if (duplicate) status = 'PARKED'
  else if (status === 'PARKED' && !duplicate) status = 'QUEUED'
  else if (underTest) status = 'UNDER TEST'
  else if (status === 'UNDER TEST' && !underTest) status = done.length ? 'TESTED' : 'QUEUED'
  else if (draft.requiredData.have < draft.requiredData.minTrades && status === 'QUEUED') status = 'BLOCKED'
  else if (status === 'BLOCKED' && draft.requiredData.have >= draft.requiredData.minTrades) status = 'QUEUED'
  if (maturity === 'REASSESSMENT' && status === 'TESTED') status = 'QUEUED'
  const item: QueueItem = { ...base, status, priority: pr.priority, priorityReasons: pr.reasons }
  saveQueueItem(item)
  seen.add(item.id)
  return { item, isNew: !prior }
}

/** Questions from significant observation clusters: the same event type under the same condition, three or more times. */
export function observationQuestions(observations: Observation[]): Array<{ question: string; source: 'PAPER'; strategyId: string | null; filters: CohortFilter[]; direction: HypothesisDirection; count: number; testable: boolean; reason: string }> {
  const out: ReturnType<typeof observationQuestions> = []
  const groups = new Map<string, Observation[]>()
  for (const o of observations) {
    if (!o.significance.selected) continue
    for (const [dim, val] of [['session', o.session], ['regime', o.regime], ['volatility', o.volatility]] as const) {
      if (!val) continue
      const key = `${o.type}|${dim}|${val}`
      groups.set(key, [...(groups.get(key) ?? []), o])
    }
  }
  for (const [key, list] of groups) {
    if (list.length < 3) continue
    const [type, dim, val] = key.split('|')
    const paperTypes = ['PAPER EXIT', 'UNUSUAL MAE', 'UNUSUAL MFE', 'RISK VETO']
    const testable = paperTypes.includes(type)
    const filters: CohortFilter[] = [{ dimension: dim as CohortFilter['dimension'], values: [val] }]
    out.push({
      question: testable ? `Do paper trades decided in ${dim} "${val}" have a different R distribution from the rest? (${list.length} selected ${type} events there)` : `${type} events cluster in ${dim} "${val}" (${list.length} selected). Do their outcomes differ from the same event elsewhere?`,
      source: 'PAPER', strategyId: null, filters, direction: 'difference', count: list.length, testable,
      reason: testable ? `${list.length} significant ${type} observations share ${dim}=${val}; the paper cohort can be tested.` : `${list.length} significant ${type} observations share ${dim}=${val}; the test needs resolved case studies (their AFTER frames), not paper records.`,
    })
  }
  return out.sort((a, b) => b.count - a.count)
}

/**
 * Regenerate the queue from every source. Existing items keep their status and
 * creation time; priorities and maturity are recomputed. Returns what changed.
 */
export function generateQueue(input: GenerateInput): GenerateResult {
  const now = input.now ?? Date.now()
  const seen = new Set<string>()
  let created = 0, updated = 0
  const items: QueueItem[] = []
  const push = (r: { item: QueueItem; isNew: boolean }) => { if (r.isNew) created++; else updated++; items.push(r.item) }
  // 1. Cohort questions the lab drafts from the record.
  for (const d of [input.paper, input.backtest ?? null]) {
    if (!d || d.provenance.source === 'MIXED') continue
    for (const q of researchQuestions(d, { now })) {
      const linked = listHypotheses().find((h) => h.question === q.draft.question && h.dataset.source === d.provenance.source) ?? null
      push(upsertItem({ id: queueId(q.draft.question, d.provenance.source, q.draft.cohortFilters), question: q.draft.question, hypothesis: q.draft.hypothesis, hypothesisId: linked?.id ?? null, origin: 'cohort', dataset: { source: d.provenance.source, strategyId: q.dimension === 'strategyId' ? q.value : null, filters: q.draft.cohortFilters }, direction: q.draft.direction, sampleSize: q.n, requiredData: { minTrades: SAMPLE_BARS.early, have: q.n, missing: [] }, note: `Drafted from the ${d.provenance.source} record: ${q.critique.note}` }, now, seen))
    }
  }
  // 2. Hypotheses on record that no cohort question produced (hand-drafted, adopted, or from earlier runs).
  for (const h of listHypotheses()) {
    if (h.status === 'REJECTED') continue
    const id = queueId(h.question, h.dataset.source, h.cohortFilters)
    if (seen.has(id)) continue
    const d = h.dataset.source === 'BACKTEST' ? input.backtest ?? null : input.paper
    const n = d ? cohort(d, { name: 'q', filters: h.cohortFilters }).stats.n : 0
    push(upsertItem({ id, question: h.question, hypothesis: h.hypothesis, hypothesisId: h.id, origin: 'manual', dataset: { source: h.dataset.source, strategyId: h.strategy, filters: h.cohortFilters }, direction: h.direction, sampleSize: n, requiredData: { minTrades: SAMPLE_BARS.insufficient, have: n, missing: n < SAMPLE_BARS.insufficient ? [`${SAMPLE_BARS.insufficient - n} more ${h.dataset.source} record(s) in the cohort`] : [] }, note: `Hypothesis ${h.id} (${h.status}).` }, now, seen))
  }
  // 3. Observation clusters from the market observer.
  for (const q of observationQuestions(listObservations({ limit: 2000 }))) {
    const n = cohort(input.paper, { name: 'q', filters: q.filters }).stats.n
    const id = queueId(q.question, 'PAPER', q.filters)
    const linked = listHypotheses().find((h) => h.question === q.question) ?? null
    push(upsertItem({ id, question: q.question, hypothesis: null, hypothesisId: linked?.id ?? null, origin: 'observation', dataset: { source: 'PAPER', strategyId: null, filters: q.filters }, direction: q.direction, sampleSize: n, requiredData: { minTrades: SAMPLE_BARS.insufficient, have: q.testable ? n : 0, missing: q.testable ? (n < SAMPLE_BARS.insufficient ? [`${SAMPLE_BARS.insufficient - n} more paper record(s) in the cohort`] : []) : ['resolved case studies with AFTER frames (not testable on paper records)'] }, note: q.reason }, now, seen))
  }
  // 4. Experiments due for reassessment.
  for (const e of experimentsDueForReassessment(now)) {
    const h = e.hypothesisId ? getHypothesis(e.hypothesisId) : null
    const question = h?.question ?? `Reassess experiment ${e.experimentId} (${e.kind} on ${e.strategyId})`
    const id = queueId(question, e.source, h?.cohortFilters ?? [])
    if (seen.has(id)) continue
    const d = e.source === 'BACKTEST' ? input.backtest ?? null : input.paper
    const n = d && h ? cohort(d, { name: 'q', filters: h.cohortFilters }).stats.n : e.oosResult?.trades ?? 0
    push(upsertItem({ id, question, hypothesis: h?.hypothesis ?? null, hypothesisId: e.hypothesisId, origin: 'reassessment', dataset: { source: e.source, strategyId: e.strategyId, filters: h?.cohortFilters ?? [] }, direction: e.direction, sampleSize: n, requiredData: { minTrades: SAMPLE_BARS.insufficient, have: n, missing: [] }, note: `Experiment ${e.experimentId} finished ${new Date(e.finishedAt ?? 0).toISOString()} with ${e.result}; its reassessment date has passed.` }, now, seen))
  }
  // 5. Signals from other monitors.
  for (const s of input.signals ?? []) {
    const d = s.source === 'BACKTEST' ? input.backtest ?? null : input.paper
    const n = d ? cohort(d, { name: 'q', filters: s.filters }).stats.n : 0
    const id = queueId(s.question, s.source, s.filters)
    const linked = listHypotheses().find((h) => h.question === s.question) ?? null
    push(upsertItem({ id, question: s.question, hypothesis: s.hypothesis ?? null, hypothesisId: linked?.id ?? null, origin: s.origin, dataset: { source: s.source, strategyId: s.strategyId, filters: s.filters }, direction: s.direction, sampleSize: n, requiredData: { minTrades: SAMPLE_BARS.insufficient, have: n, missing: n < SAMPLE_BARS.insufficient ? [`${SAMPLE_BARS.insufficient - n} more ${s.source} record(s)`] : [] }, note: s.reason }, now, seen))
  }
  return { created, updated, items: items.sort((a, b) => b.priority - a.priority) }
}

/** The next item the runner may test: queued, testable, with a hypothesis (or one it can draft), highest priority first. */
export function nextTestable(now = Date.now()): QueueItem | null {
  return listQueue({ status: 'QUEUED' }).find((q) => q.requiredData.have >= q.requiredData.minTrades && q.duplicateOf === null && (q.nextTest === null || q.nextTest <= now)) ?? null
}

export function setQueueStatus(id: string, status: QueueStatus, note?: string, now = Date.now()): QueueItem | null {
  const q = getQueueItem(id)
  if (!q) return null
  return saveQueueItem({ ...q, status, updatedAt: now, note: note ? `${q.note} ${note}` : q.note })
}

export function linkHypothesis(id: string, hypothesisId: string, now = Date.now()): QueueItem | null {
  const q = getQueueItem(id)
  if (!q) return null
  return saveQueueItem({ ...q, hypothesisId, updatedAt: now })
}

export function queueSummary(): { total: number; byStatus: Record<string, number>; byMaturity: Record<string, number>; byOrigin: Record<string, number>; testable: number } {
  const items = listQueue()
  const count = (k: keyof QueueItem) => items.reduce<Record<string, number>>((acc, q) => { const v = String(q[k]); acc[v] = (acc[v] ?? 0) + 1; return acc }, {})
  return { total: items.length, byStatus: count('status'), byMaturity: count('maturity'), byOrigin: count('origin'), testable: items.filter((q) => q.status === 'QUEUED' && q.requiredData.have >= q.requiredData.minTrades).length }
}
