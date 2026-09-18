/**
 * FAILURE MEMORY — what did not work, kept so it is not tried again by
 * accident and so the reason is still readable later.
 *
 * A failure record is written when a hypothesis is rejected or not supported,
 * when an experiment's out-of-sample stage does not support it, when the
 * challenger disproves it, when a proposal fails its gates, is rejected or
 * expires, and when an observation cannot be resolved into a case study.
 * Each record says WHAT was tried, WHY it is recorded as a failure, and the
 * LESSON — which is always a statement about the record at that sample, never
 * "never do this again". The same idea may be retested when the data grows;
 * the record makes sure the retest knows it is a retest.
 *
 * Records are content-addressed on the thing that failed, so a harvest that
 * runs every tick writes each failure once. Every record is mirrored into the
 * knowledge vault as a `failed-hypothesis` (or `data-quality-warning`) item,
 * so the vault's "what did not work" count and the memory classes see it.
 * Nothing is ever deleted.
 */

import type { CohortFilter } from '../analyst/cohorts.ts'
import { listObservations } from '../observer/events.ts'
import { listExperiments } from '../research/experiments.ts'
import type { Experiment } from '../research/experiments.ts'
import { listHypotheses } from '../research/hypotheses.ts'
import type { Hypothesis } from '../research/hypotheses.ts'
import { listProposals } from '../research/lab.ts'
import type { Proposal } from '../research/lab.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'
import { addItem } from './vault.ts'

export type FailureKind =
  | 'hypothesis-rejected' | 'hypothesis-not-supported'
  | 'experiment-not-supported' | 'challenger-disproved'
  | 'proposal-gates-failed' | 'proposal-rejected' | 'proposal-expired'
  | 'observation-unresolvable' | 'data-quality' | 'manual'

export type FailureRecord = {
  id: string
  kind: FailureKind
  title: string
  /** What was tried, in the words of the record it came from. */
  what: string
  /** Why it is on this list — the measured or stated reason. */
  why: string
  /** What the record supports saying. Never a prohibition. */
  lesson: string
  strategyId: string | null
  filters: CohortFilter[]
  refs: { hypothesisId?: string; experimentId?: string; proposalId?: string; observationId?: string }
  source: 'PAPER' | 'BACKTEST' | 'HISTORICAL' | 'ENGINE' | 'USER' | 'NONE'
  sampleSize: number | null
  at: number
  engineVersion: string
  tags: string[]
  vaultItemId: string
}

const PREFIX = 'failure:'

function hash(s: string): string {
  let h = 2166136261
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(36)
}

/** Deterministic: the same failure of the same thing is one record. */
export function failureId(kind: FailureKind, ref: string): string { return `fail-${kind}-${hash(`${kind}|${ref}`)}` }

export function getFailure(id: string): FailureRecord | null { return store().getJson<FailureRecord>(PREFIX + id) }

export function listFailures(filter: { kind?: FailureKind; strategyId?: string } = {}): FailureRecord[] {
  const out: FailureRecord[] = []
  for (const key of store().keysWithPrefix(PREFIX)) {
    const f = store().getJson<FailureRecord>(key)
    if (!f) continue
    if (filter.kind && f.kind !== filter.kind) continue
    if (filter.strategyId && f.strategyId !== filter.strategyId) continue
    out.push(f)
  }
  return out.sort((a, b) => b.at - a.at)
}

export type NewFailure = Omit<FailureRecord, 'id' | 'engineVersion' | 'vaultItemId' | 'tags'> & { ref: string; tags?: string[] }

/** Write a failure once, and its mirror in the vault once. Returns the stored record (the prior one when it already existed). */
export function recordFailure(input: NewFailure): { record: FailureRecord; isNew: boolean } {
  const id = failureId(input.kind, input.ref)
  const prior = getFailure(id)
  if (prior) return { record: prior, isNew: false }
  const tags = [...new Set([...(input.tags ?? []), 'failure', input.kind, ...(input.strategyId ? [input.strategyId] : [])])].sort()
  const vaultKind = input.kind === 'observation-unresolvable' || input.kind === 'data-quality' ? 'data-quality-warning' : 'failed-hypothesis'
  const item = addItem({
    kind: vaultKind, id: `${vaultKind}:${id}`, title: input.title,
    body: `WHAT: ${input.what}\nWHY: ${input.why}\nLESSON: ${input.lesson}`,
    evidenceLabel: input.sampleSize !== null && input.sampleSize > 0 ? 'OBSERVED' : 'INSUFFICIENT DATA',
    provenance: { source: input.source, sampleSize: input.sampleSize ?? undefined, method: `failure memory (${input.kind})`, recordIds: [] },
    tags, links: Object.values(input.refs).filter((x): x is string => typeof x === 'string'), now: input.at,
    payload: { failureId: id, kind: input.kind, refs: input.refs, filters: input.filters },
  })
  const { ref: _ref, ...rest } = input
  const record: FailureRecord = { ...rest, id, tags, engineVersion: VERSION, vaultItemId: item.id }
  store().setJson(PREFIX + id, record)
  return { record, isNew: true }
}

// ---------------------------------------------------------------
// The harvest — every source of failure, read, recorded once
// ---------------------------------------------------------------

const fx = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

function fromHypothesis(h: Hypothesis): NewFailure | null {
  if (h.status !== 'REJECTED' && h.status !== 'NOT SUPPORTED') return null
  const kind: FailureKind = h.status === 'REJECTED' ? 'hypothesis-rejected' : 'hypothesis-not-supported'
  const last = h.history[h.history.length - 1]
  const stage = h.outOfSample ?? h.inSample
  return {
    kind, ref: `${h.id}:${h.version}:${h.status}`, title: `${h.status}: ${h.question}`,
    what: h.hypothesis, why: h.status === 'REJECTED' ? (last?.detail ?? 'rejected') : `${stage ? `${stage.source} ${stage.trades} trade(s), mean ${fx(stage.meanR)}R${stage.ci95 ? ` (${fx(stage.ci95.lo)} to ${fx(stage.ci95.hi)})` : ''}` : 'no stage result'}; the interval did not exclude the null in the direction hypothesised.${h.counterevidence.length ? ` Counterevidence: ${h.counterevidence[h.counterevidence.length - 1]}` : ''}`,
    lesson: `At ${stage?.trades ?? 0} ${h.dataset.source} trade(s), the record did not support "${h.hypothesis}". It may be retested when the cohort grows; this record marks the retest as a retest, and the trial registry counts it.`,
    strategyId: h.strategy, filters: h.cohortFilters, refs: { hypothesisId: h.id }, source: h.dataset.source, sampleSize: stage?.trades ?? h.sampleSize, at: last?.at ?? h.lastReviewed,
    tags: [...(h.session ? [h.session] : []), ...(h.regime ? [h.regime] : [])],
  }
}

function fromExperiment(e: Experiment): NewFailure[] {
  const out: NewFailure[] = []
  if (e.status !== 'DONE') return out
  const at = e.finishedAt ?? e.createdAt
  if (e.result === 'NOT SUPPORTED') {
    out.push({
      kind: 'experiment-not-supported', ref: e.experimentId, title: `Experiment not supported: ${e.method}`,
      what: `${e.kind} experiment on ${e.strategyId} (${e.source}) — ${e.method}; baseline ${e.baseline.label}.`,
      why: `${e.oosResult ? `Out-of-sample ${e.oosResult.trades} trade(s), mean ${fx(e.oosResult.meanR)}R` : 'No out-of-sample stage'}; ${e.comparison.oos?.note ?? 'no baseline comparison'}.`,
      lesson: `Against its frozen baseline and dataset ${e.datasetHash}, this experiment did not support the hypothesis at this sample. Parameters were not moved afterwards; a retest waits for the reassessment date (${e.nextTest ? new Date(e.nextTest).toISOString().slice(0, 10) : 'unset'}) or new data.`,
      strategyId: e.strategyId, filters: [], refs: { experimentId: e.experimentId, ...(e.hypothesisId ? { hypothesisId: e.hypothesisId } : {}) }, source: e.source, sampleSize: e.oosResult?.trades ?? e.inSampleResult?.trades ?? null, at,
    })
  }
  const ch = e.challenge as { overall?: string; attacks?: Array<{ question: string; verdict: string; detail: string }> } | null
  if (ch?.overall === 'DISPROVED') {
    const disproving = (ch.attacks ?? []).filter((a) => a.verdict === 'DISPROVED')
    out.push({
      kind: 'challenger-disproved', ref: e.experimentId, title: `Challenger disproved: ${e.method}`,
      what: `${e.kind} experiment on ${e.strategyId} (${e.source}) — ${e.method}.`,
      why: disproving.map((a) => `${a.question} — ${a.detail}`).join(' | ') || 'the challenger returned DISPROVED',
      lesson: 'The result did not survive its own challenge. What the attack found is recorded here so the next version of the idea starts from it rather than rediscovering it.',
      strategyId: e.strategyId, filters: [], refs: { experimentId: e.experimentId, ...(e.hypothesisId ? { hypothesisId: e.hypothesisId } : {}) }, source: e.source, sampleSize: e.oosResult?.trades ?? null, at,
    })
  }
  return out
}

function fromProposal(p: Proposal): NewFailure | null {
  if (p.status !== 'GATES FAILED' && p.status !== 'REJECTED' && p.status !== 'EXPIRED') return null
  const kind: FailureKind = p.status === 'GATES FAILED' ? 'proposal-gates-failed' : p.status === 'REJECTED' ? 'proposal-rejected' : 'proposal-expired'
  const unmet = p.gates.filter((g) => !g.met)
  return {
    kind, ref: `${p.id}:${p.status}`, title: `${p.status}: ${p.title}`,
    what: `${p.kind} proposal for ${p.strategyId}: ${p.change}`,
    why: p.status === 'GATES FAILED' ? unmet.map((g) => `${g.label}: ${g.detail}`).join(' | ') : p.status === 'REJECTED' ? `${p.decidedBy ?? 'a reviewer'}: ${p.decisionNote ?? 'rejected'}` : `Not decided within its ${Math.round((p.expiresAt - p.createdAt) / 86_400_000)}-day window.`,
    lesson: p.status === 'GATES FAILED' ? 'The evidence did not clear the gates that stand between a research result and a proposal. The gates are the lesson; the proposal is not resubmitted with the same evidence.' : p.status === 'REJECTED' ? 'A human read the evidence and declined. The decision and its note are the record.' : 'It expired unreviewed; if the evidence still stands it can be re-proposed, and this record says it once was.',
    strategyId: p.strategyId, filters: [], refs: { proposalId: p.id, ...(p.evidence.hypothesisIds[0] ? { hypothesisId: p.evidence.hypothesisIds[0] } : {}) }, source: 'PAPER', sampleSize: p.evidence.recordIds.length || null, at: p.decidedAt ?? (p.status === 'EXPIRED' ? p.expiresAt : p.createdAt),
  }
}

export type Harvest = { at: number; scanned: { hypotheses: number; experiments: number; proposals: number; observations: number }; recorded: FailureRecord[]; total: number; note: string }

/** Read every source, record each failure once. Safe to run every tick. */
export function harvestFailures(now = Date.now()): Harvest {
  const recorded: FailureRecord[] = []
  const hyps = listHypotheses(), exps = listExperiments(), props = listProposals(), obs = listObservations({ status: 'UNRESOLVABLE', limit: 500 })
  const write = (f: NewFailure | null) => { if (!f) return; const r = recordFailure(f); if (r.isNew) recorded.push(r.record) }
  for (const h of hyps) write(fromHypothesis(h))
  for (const e of exps) for (const f of fromExperiment(e)) write(f)
  for (const p of props) write(fromProposal(p))
  for (const o of obs) write({
    kind: 'observation-unresolvable', ref: o.id, title: `Unresolvable: ${o.type.toLowerCase()} at ${new Date(o.time).toISOString()}`,
    what: o.detail, why: o.resolutionNote ?? 'the case could not be rebuilt from the stored candles',
    lesson: 'A gap in the stored history is a data-quality fact, not a market fact. The event stays on record as observed; no case study was written for it.',
    strategyId: null, filters: [], refs: { observationId: o.id }, source: 'ENGINE', sampleSize: null, at: o.resolvedAt ?? now, tags: [o.type.toLowerCase().replace(/\s+/g, '-')],
  })
  const total = listFailures().length
  return { at: now, scanned: { hypotheses: hyps.length, experiments: exps.length, proposals: props.length, observations: obs.length }, recorded, total, note: recorded.length ? `${recorded.length} new failure record(s); ${total} on file. Each is mirrored in the vault.` : `Nothing new; ${total} failure record(s) on file.` }
}

// ---------------------------------------------------------------
// "Have we tried this before?"
// ---------------------------------------------------------------

function filterKey(f: CohortFilter): string { return `${f.dimension}=${[...f.values].map(String).sort().join(',')}` }

/**
 * Prior failures that overlap a proposed study: same strategy (or no strategy
 * on either side) and at least one identical cohort filter, or the same
 * strategy with no filters on the prior. Returned oldest-lesson first so the
 * reader sees the history in order.
 */
export function priorFailures(strategyId: string | null, filters: CohortFilter[]): FailureRecord[] {
  const keys = new Set(filters.map(filterKey))
  return listFailures().filter((f) => {
    if (f.kind === 'observation-unresolvable' || f.kind === 'data-quality') return false
    if (strategyId && f.strategyId && f.strategyId !== strategyId) return false
    if (!f.filters.length) return Boolean(strategyId && f.strategyId === strategyId)
    return f.filters.some((x) => keys.has(filterKey(x)))
  }).sort((a, b) => a.at - b.at)
}

export function failureSummary(): { total: number; byKind: Record<string, number>; byStrategy: Record<string, number>; latest: FailureRecord | null; note: string } {
  const all = listFailures()
  const byKind: Record<string, number> = {}
  const byStrategy: Record<string, number> = {}
  for (const f of all) { byKind[f.kind] = (byKind[f.kind] ?? 0) + 1; if (f.strategyId) byStrategy[f.strategyId] = (byStrategy[f.strategyId] ?? 0) + 1 }
  return { total: all.length, byKind, byStrategy, latest: all[0] ?? null, note: all.length ? `${all.length} thing(s) that did not work, each with what, why and what the record supports saying. Nothing here is a rule.` : 'No failures on record yet. That is a statement about how little has been tested, not about how much works.' }
}
