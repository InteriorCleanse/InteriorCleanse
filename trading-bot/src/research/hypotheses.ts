/**
 * THE HYPOTHESIS ENGINE — a question, a null, a dataset, a method, results at
 * every stage, and a status that can only ever say what the evidence said.
 *
 * A hypothesis here is a research object, not a trading instruction. It is
 * created from a structured question, tested against a named dataset with a
 * named method, and its status is DERIVED from the results it holds — never
 * set by hand to something flattering. The only statuses that exist:
 *
 *   UNTESTED · TESTING · INSUFFICIENT DATA · OBSERVED IN SAMPLE ·
 *   NOT SUPPORTED · OOS SUPPORTED · UNDER REVIEW · STALE · REJECTED
 *
 * "Proven", "guaranteed", "certain", "best", "perfect" and "fail-proof" are not
 * statuses and are refused in any text field. Every change bumps the version
 * and appends to history; nothing is rewritten.
 *
 * Nothing here decides anything. A hypothesis with status OOS SUPPORTED is a
 * research finding that still has to go through proposal, human review, a new
 * strategy version, paper and shadow before production is even considered
 * (see research/evolution.ts).
 */

import { store } from '../store.ts'
import { VERSION } from '../version.ts'
import { SAMPLE_BARS } from '../analyst/cohorts.ts'
import type { CohortFilter, SampleStatus } from '../analyst/cohorts.ts'

export const HYPOTHESIS_STATUSES = [
  'UNTESTED', 'TESTING', 'INSUFFICIENT DATA', 'OBSERVED IN SAMPLE', 'NOT SUPPORTED', 'OOS SUPPORTED', 'UNDER REVIEW', 'STALE', 'REJECTED',
] as const
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number]

export const BANNED_WORDS = /\b(proven|guaranteed|certain(?:ly)?|best|perfect|fail-?proof)\b/i

/** One measured result at one stage. Figures come from the analyst layer, never typed in. */
export type StageResult = {
  at: number
  source: 'PAPER' | 'BACKTEST'
  dataType: 'LIVE MARKET / SIMULATED EXECUTION' | 'SIMULATED'
  trades: number
  sampleStatus: SampleStatus
  meanR: number | null
  ci95: { lo: number; hi: number } | null
  /** Where the number came from: dataset label, cohort filters, calculation. */
  method: string
  recordIds: string[]
  note: string
}

export type RobustnessResult = {
  at: number
  walkForward: { folds: number; trades: number; combinedOosAvgR: number | null } | null
  monteCarlo: { samples: number; totalRp5: number; totalRp95: number; profitableShare: number } | null
  note: string
}

export type HypothesisDirection = 'positive' | 'negative' | 'difference'

export type Hypothesis = {
  id: string
  question: string
  observation: string
  hypothesis: string
  nullHypothesis: string
  /** Which way the hypothesis points, so support/contradiction can be derived. */
  direction: HypothesisDirection
  dataset: { source: 'PAPER' | 'BACKTEST'; label: string }
  markets: string[]
  timeframes: string[]
  dateRange: { from: number; to: number } | null
  strategy: string | null
  regime: string | null
  session: string | null
  /** The cohort this hypothesis is about, in the analyst layer's own filter shape. */
  cohortFilters: CohortFilter[]
  sampleSize: number
  method: string
  inSample: StageResult | null
  outOfSample: StageResult | null
  walkForward: RobustnessResult['walkForward']
  robustness: RobustnessResult | null
  counterevidence: string[]
  limitations: string[]
  status: HypothesisStatus
  version: number
  created: number
  lastReviewed: number
  nextReview: number
  /** Ids of knowledge-vault items this hypothesis produced or rests on. */
  links: string[]
  history: Array<{ at: number; event: string; detail: string; version: number }>
  engineVersion: string
}

export const HYPOTHESIS_REVIEW_MS = 30 * 86_400_000

function refuseBanned(field: string, text: string): void {
  const m = text.match(BANNED_WORDS)
  if (m) throw new Error(`"${m[0]}" is not a word a hypothesis may use (in ${field}). State what the evidence shows.`)
}

function hid(question: string, created: number): string {
  let h = 2166136261
  for (const ch of `${question}|${created}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return `hyp-${h.toString(36)}`
}

// ---------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------

export type NewHypothesis = {
  question: string
  observation: string
  hypothesis: string
  nullHypothesis: string
  direction: HypothesisDirection
  dataset: Hypothesis['dataset']
  cohortFilters: CohortFilter[]
  method: string
  markets?: string[]
  timeframes?: string[]
  strategy?: string | null
  regime?: string | null
  session?: string | null
  limitations?: string[]
  links?: string[]
  now?: number
}

export function makeHypothesis(input: NewHypothesis): Hypothesis {
  const now = input.now ?? Date.now()
  for (const [k, v] of [['question', input.question], ['observation', input.observation], ['hypothesis', input.hypothesis], ['nullHypothesis', input.nullHypothesis]] as const) {
    if (!v.trim()) throw new Error(`a hypothesis needs a ${k}`)
    refuseBanned(k, v)
  }
  return {
    id: hid(input.question, now),
    question: input.question.trim(), observation: input.observation.trim(), hypothesis: input.hypothesis.trim(), nullHypothesis: input.nullHypothesis.trim(),
    direction: input.direction,
    dataset: input.dataset,
    markets: input.markets ?? [], timeframes: input.timeframes ?? [], dateRange: null,
    strategy: input.strategy ?? null, regime: input.regime ?? null, session: input.session ?? null,
    cohortFilters: input.cohortFilters, sampleSize: 0, method: input.method,
    inSample: null, outOfSample: null, walkForward: null, robustness: null,
    counterevidence: [], limitations: input.limitations ?? [],
    status: 'UNTESTED', version: 1, created: now, lastReviewed: now, nextReview: now + HYPOTHESIS_REVIEW_MS,
    links: input.links ?? [],
    history: [{ at: now, event: 'created', detail: 'Created UNTESTED.', version: 1 }],
    engineVersion: VERSION,
  }
}

/** Does a result support the hypothesis, contradict it, or say nothing? */
export function verdictOf(h: Pick<Hypothesis, 'direction'>, r: StageResult | null): 'supports' | 'contradicts' | 'insufficient' {
  if (!r || r.trades < SAMPLE_BARS.insufficient || !r.ci95 || r.meanR === null) return 'insufficient'
  const { lo, hi } = r.ci95
  if (h.direction === 'positive') return lo > 0 ? 'supports' : hi < 0 ? 'contradicts' : 'insufficient'
  if (h.direction === 'negative') return hi < 0 ? 'supports' : lo > 0 ? 'contradicts' : 'insufficient'
  // A difference hypothesis is supported when the interval excludes zero either way.
  return lo > 0 || hi < 0 ? 'supports' : 'insufficient'
}

/**
 * The status is a function of the results. It cannot be set by hand to
 * something the evidence does not say.
 */
export function deriveStatus(h: Hypothesis, now = Date.now()): HypothesisStatus {
  if (h.status === 'REJECTED') return 'REJECTED'
  if (h.status === 'UNDER REVIEW') return 'UNDER REVIEW'
  if (h.status === 'TESTING' && !h.inSample && !h.outOfSample) return 'TESTING'
  if (!h.inSample && !h.outOfSample) return 'UNTESTED'
  if (now >= h.nextReview) return 'STALE'
  const inS = verdictOf(h, h.inSample)
  const oos = verdictOf(h, h.outOfSample)
  if (oos === 'contradicts' || (inS === 'contradicts' && oos !== 'supports')) return 'NOT SUPPORTED'
  if (oos === 'supports') return 'OOS SUPPORTED'
  if (inS === 'supports') return 'OBSERVED IN SAMPLE'
  return 'INSUFFICIENT DATA'
}

function withHistory(h: Hypothesis, event: string, detail: string, now: number, bump = true): Hypothesis {
  const version = bump ? h.version + 1 : h.version
  return { ...h, version, history: [...h.history, { at: now, event, detail, version }] }
}

export function startTesting(h: Hypothesis, now = Date.now()): Hypothesis {
  const next = withHistory(h, 'testing', 'Testing started.', now, false)
  return { ...next, status: 'TESTING' }
}

export function recordStage(h: Hypothesis, stage: 'inSample' | 'outOfSample', r: StageResult, now = Date.now()): Hypothesis {
  refuseBanned('result note', r.note)
  const base = withHistory(h, stage, `${stage}: ${r.trades} ${r.source} trades, mean ${r.meanR === null ? '—' : r.meanR.toFixed(2)}R, ${r.sampleStatus}. ${r.method}`, now)
  const merged: Hypothesis = { ...base, [stage]: r, sampleSize: Math.max(h.sampleSize, r.trades), status: 'TESTING' }
  const verdict = verdictOf(h, r)
  if (verdict === 'contradicts') merged.counterevidence = [...merged.counterevidence, `${stage} (${r.source}, n=${r.trades}): interval ${r.ci95 ? `${r.ci95.lo.toFixed(2)}..${r.ci95.hi.toFixed(2)}` : '—'} runs against the hypothesis.`]
  const status = deriveStatus(merged, now)
  return { ...merged, status, history: [...merged.history, { at: now, event: 'status', detail: `Status derived: ${status}.`, version: merged.version }] }
}

export function recordRobustness(h: Hypothesis, r: RobustnessResult, now = Date.now()): Hypothesis {
  refuseBanned('robustness note', r.note)
  const next = withHistory(h, 'robustness', r.note, now)
  return { ...next, robustness: r, walkForward: r.walkForward }
}

export function addCounterevidence(h: Hypothesis, detail: string, now = Date.now()): Hypothesis {
  const next = withHistory(h, 'counterevidence', detail, now)
  return { ...next, counterevidence: [...h.counterevidence, detail] }
}

/** New evidence arrived (a paper trade closed in this cohort): the hypothesis goes UNDER REVIEW; nothing is re-concluded automatically. */
export function flagForReview(h: Hypothesis, reason: string, now = Date.now()): Hypothesis {
  if (h.status === 'REJECTED') return h
  const next = withHistory(h, 'review-flag', reason, now, false)
  return { ...next, status: 'UNDER REVIEW' }
}

export function reject(h: Hypothesis, reason: string, now = Date.now()): Hypothesis {
  refuseBanned('rejection', reason)
  const next = withHistory(h, 'rejected', reason, now)
  return { ...next, status: 'REJECTED' }
}

/** A review happened: the clock resets and the status is re-derived from the results as they stand. */
export function reviewHypothesis(h: Hypothesis, note: string, now = Date.now()): Hypothesis {
  const cleared: Hypothesis = { ...h, status: 'TESTING', lastReviewed: now, nextReview: now + HYPOTHESIS_REVIEW_MS }
  const status = deriveStatus(cleared, now)
  return withHistory({ ...cleared, status }, 'reviewed', `${note} Status after review: ${status}.`, now, false)
}

export function markStale(h: Hypothesis, now = Date.now()): Hypothesis {
  if (h.status === 'REJECTED' || h.status === 'STALE' || now < h.nextReview) return h
  return { ...withHistory(h, 'stale', 'Past its review date; the conclusion is not assumed to still hold.', now, false), status: 'STALE' }
}

export function renderHypothesis(h: Hypothesis): string {
  const stage = (label: string, r: StageResult | null) => `  ${label.padEnd(20)} ${r ? `${r.trades} ${r.source} trades · mean ${r.meanR === null ? '—' : (r.meanR >= 0 ? '+' : '') + r.meanR.toFixed(2)}R · ${r.ci95 ? `95% ${r.ci95.lo.toFixed(2)}..${r.ci95.hi.toFixed(2)}` : 'no interval'} · ${r.sampleStatus}` : '—'}`
  return [
    `HYPOTHESIS ${h.id}  v${h.version}  STATUS: ${h.status}`,
    `  QUESTION            ${h.question}`,
    `  OBSERVATION         ${h.observation}`,
    `  HYPOTHESIS          ${h.hypothesis}`,
    `  NULL HYPOTHESIS     ${h.nullHypothesis}`,
    `  DATASET             ${h.dataset.label}`,
    `  MARKETS/TIMEFRAMES  ${h.markets.join(', ') || '—'} / ${h.timeframes.join(', ') || '—'}`,
    `  STRATEGY/REGIME/SESSION  ${h.strategy ?? '—'} / ${h.regime ?? '—'} / ${h.session ?? '—'}`,
    `  SAMPLE SIZE         ${h.sampleSize}`,
    `  METHOD              ${h.method}`,
    stage('IN-SAMPLE', h.inSample),
    stage('OUT-OF-SAMPLE', h.outOfSample),
    `  WALK-FORWARD        ${h.walkForward ? `${h.walkForward.folds} folds · ${h.walkForward.trades} trades · combined OOS mean ${h.walkForward.combinedOosAvgR === null ? '—' : h.walkForward.combinedOosAvgR.toFixed(2)}R` : '—'}`,
    `  ROBUSTNESS          ${h.robustness?.monteCarlo ? `Monte Carlo p5 ${h.robustness.monteCarlo.totalRp5.toFixed(1)}R · p95 ${h.robustness.monteCarlo.totalRp95.toFixed(1)}R · ${(h.robustness.monteCarlo.profitableShare * 100).toFixed(0)}% of resamples above zero` : '—'}`,
    `  COUNTEREVIDENCE     ${h.counterevidence.length ? h.counterevidence.join(' | ') : 'none recorded'}`,
    `  LIMITATIONS         ${h.limitations.join(' | ') || '—'}`,
    `  CREATED / LAST REVIEWED / NEXT REVIEW  ${new Date(h.created).toISOString()} / ${new Date(h.lastReviewed).toISOString()} / ${new Date(h.nextReview).toISOString()}`,
  ].join('\n')
}

// ---------------------------------------------------------------
// The store
// ---------------------------------------------------------------

const PREFIX = 'hypothesis:'

export function getHypothesis(id: string): Hypothesis | null { return store().getJson<Hypothesis>(PREFIX + id) }
export function saveHypothesis(h: Hypothesis): Hypothesis { store().setJson(PREFIX + h.id, h); return h }
export function createHypothesis(input: NewHypothesis): Hypothesis { return saveHypothesis(makeHypothesis(input)) }
export function listHypotheses(filter: { status?: HypothesisStatus; strategy?: string } = {}): Hypothesis[] {
  const out: Hypothesis[] = []
  for (const key of store().keysWithPrefix(PREFIX)) {
    const h = store().getJson<Hypothesis>(key)
    if (!h) continue
    if (filter.status && h.status !== filter.status) continue
    if (filter.strategy && h.strategy !== filter.strategy) continue
    out.push(h)
  }
  return out.sort((a, b) => b.created - a.created)
}
/** Expire overdue hypotheses into STALE. Meant for the daily review. */
export function sweepStaleHypotheses(now = Date.now()): Hypothesis[] {
  const changed: Hypothesis[] = []
  for (const h of listHypotheses()) { const n = markStale(h, now); if (n !== h) changed.push(saveHypothesis(n)) }
  return changed
}
