/**
 * THE SCHOOL / RESEARCH / KNOWLEDGE API — one service module behind the three
 * tabs, so the server's dispatch stays thin and every handler here is
 * testable without HTTP.
 *
 * Everything reads the stores and the stored candles. The writers are
 * explicit and named: engagement (the learner's own actions), quiz grading,
 * hypothesis create / test / review / reject, proposal create / decide,
 * knowledge review, and the reassessment sweep. None of them touches the
 * engine, a position, a passport or a parameter — the boundary test in
 * test/learning pins that for the whole layer.
 *
 * Expensive work (stepping the engine over stored history) is cached per
 * last-closed candle and computed lazily on request, never on a timer.
 */

import { config } from '../../config.ts'
import { cachedBacktest } from '../analyst/evidence.ts'
import { SAMPLE_BARS, statsOf } from '../analyst/cohorts.ts'
import type { CohortFilter } from '../analyst/cohorts.ts'
import { backtestDataset, fromReplayTrade, paperDataset } from '../analyst/records.ts'
import type { Dataset, EvidenceRecord } from '../analyst/records.ts'
import type { Snapshot } from '../bot.ts'
import { getItem, listItems, reviewItem, vaultSummary } from '../knowledge/vault.ts'
import type { KnowledgeKind, KnowledgeStatus, ReviewOutcome } from '../knowledge/vault.ts'
import { allSeries, historyDepth } from '../news/history.ts'
import { readPositions } from '../paperTrader.ts'
import { createHypothesis, getHypothesis, listHypotheses, recordStage, reject as rejectHypothesis, reviewHypothesis, saveHypothesis } from '../research/hypotheses.ts'
import type { Hypothesis, HypothesisStatus, NewHypothesis, StageResult } from '../research/hypotheses.ts'
import { critiqueCohort, decideProposal, getProposal, listProposals, makeProposal, researchQuestions, saveProposal } from '../research/lab.ts'
import type { Proposal, ProposalKind, ProposalStatus } from '../research/lab.ts'
import { fitHawkes, priceEvents } from '../research/hawkes.ts'
import { deflatedSharpeFull, deflationCurve, recordTrials, trialRegistry, trialsFor } from '../research/overfitting.ts'
import { regimeAtlas } from '../research/regimeAtlas.ts'
import { cohort } from '../analyst/cohorts.ts'
import { casesFromSteps, counterexamplesFor, outcomeTally, paperCases, stepEngine } from '../school/caseStudies.ts'
import type { CaseKind, CaseStudy } from '../school/caseStudies.ts'
import { CONCEPTS, conceptById, conceptGraph, conceptsForAnnotation, conceptsForStrategy, conceptsForCaseKind } from '../school/curriculum.ts'
import type { AnnotationType } from '../intel/types.ts'
import { marketDebate } from '../school/debate.ts'
import { buildLesson, dataGrowth, gradeQuiz } from '../school/lessons.ts'
import { kellyFraction, netEdge, netOdds, singleVenueEdge, workedExample } from '../school/predictionMarket.ts'
import { masteryFrom, progressSummary, readEngagements, recordEngagement } from '../school/progress.ts'
import type { EngagementKind } from '../school/progress.ts'
import { buildReplayLesson, revealStop, stopView } from '../school/replaySchool.ts'
import type { ReplayBundle } from '../school/replaySchool.ts'
import { teach } from '../school/teacher.ts'
import { strategyIds } from '../strategies/registry.ts'
import { store } from '../store.ts'
import type { Candle } from '../types.ts'
import { observePaperClose, reassessAll } from './observer.ts'
import { livingPassport } from './passport.ts'
import { dailyBrief, endOfDay, weeklyReview } from './reviews.ts'

const DAY = 86_400_000
export const SCAN_DAYS = 14
export const REPLAY_DAYS = 3

export type Ai = ((prompt: string, system: string) => Promise<string>) | undefined

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

// ---------------------------------------------------------------
// Shared inputs and caches
// ---------------------------------------------------------------

export function historyCandles(days: number, now = Date.now()): Candle[] {
  return store().candlesBetween(config.symbol, config.interval, now - days * DAY, now).map((c) => ({ openTime: c.openTime, closeTime: c.closeTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))
}

let scanCache: { key: string; cases: CaseStudy[] } | null = null
let replayCache: { key: string; bundle: ReplayBundle } | null = null

/** Case studies over the stored history, HISTORICAL (engine scan) plus PAPER (from records). Cached per last candle. */
export function allCases(now = Date.now()): CaseStudy[] {
  const candles = historyCandles(SCAN_DAYS, now)
  const key = `${candles.length}:${candles[candles.length - 1]?.openTime ?? 0}`
  if (!scanCache || scanCache.key !== key) {
    const historical = candles.length > 2 ? casesFromSteps(stepEngine(candles, 600), candles, { horizon: 24 }) : []
    scanCache = { key, cases: historical }
  }
  const closed = readPositions().closed
  const records = closed.map((p) => paperDataset([p]).records[0])
  const missed = closed.filter((p) => p.exitReason === 'missed').map((p) => ({ id: p.id, at: p.closedAt ?? p.openedAt, note: p.note ?? 'refused', direction: p.direction, strategyId: p.strategyId ?? 'session-ifvg' }))
  return [...scanCache.cases, ...paperCases(records, { missed })].sort((a, b) => b.at - a.at)
}

function replayBundle(now = Date.now()): ReplayBundle {
  const candles = historyCandles(REPLAY_DAYS, now)
  const key = `${candles.length}:${candles[candles.length - 1]?.openTime ?? 0}`
  if (!replayCache || replayCache.key !== key) replayCache = { key, bundle: buildReplayLesson(candles, { maxStops: 8, votesTail: 300, horizon: 12 }) }
  return replayCache.bundle
}

export function resetLearningCaches(): void { scanCache = null; replayCache = null }

function paperData(): Dataset { return paperDataset(readPositions().closed) }
function backtestData(strategyId: string): Dataset { const bt = cachedBacktest(strategyId); return backtestDataset(bt?.trades ?? [], { symbol: config.symbol, interval: config.interval }) }
function datasetFor(source: string | null, strategyId: string): Dataset { return source === 'backtest' ? backtestData(strategyId) : paperData() }

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.slice(0, max) : '')

// ---------------------------------------------------------------
// SCHOOL
// ---------------------------------------------------------------

export function schoolIndex() {
  const events = readEngagements()
  return {
    concepts: CONCEPTS.map((c) => ({ id: c.id, title: c.title, level: c.level, track: c.track, related: c.related, strategies: c.strategies, caseKinds: c.caseKinds, mastery: masteryFrom(c.id, events) })),
    graph: conceptGraph(),
    progress: progressSummary(events),
    dataGrowth: dataGrowth(readPositions().closed.filter((p) => p.exitReason !== 'missed').length),
    note: 'Lessons are assembled on request from the curriculum, the engine\'s historical case studies and the paper record. Mastery is engagement only.',
  }
}

export function schoolLesson(conceptId: string, now = Date.now()) {
  const l = buildLesson(conceptId, { cases: allCases(now), dataset: paperData(), now })
  if (!l) throw new ApiError(404, `no concept "${conceptId}"`)
  return l
}

export function schoolQuiz(body: { conceptId?: unknown; answers?: unknown }, now = Date.now()) {
  const conceptId = str(body.conceptId, 60)
  const raw = body.answers && typeof body.answers === 'object' ? (body.answers as Record<string, unknown>) : {}
  const answers: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw).slice(0, 20)) if (Number.isInteger(v)) answers[String(k).slice(0, 40)] = v as number
  const g = gradeQuiz(conceptId, answers)
  if (!g) throw new ApiError(404, `no concept "${conceptId}"`)
  recordEngagement({ kind: 'quiz-taken', conceptId, detail: { correct: g.correct, total: g.total }, at: now })
  return g
}

const ENGAGEMENTS: EngagementKind[] = ['lesson-viewed', 'case-reviewed', 'counterexample-reviewed']
export function schoolEngage(body: { kind?: unknown; conceptId?: unknown; caseId?: unknown }, now = Date.now()) {
  const kind = str(body.kind, 40) as EngagementKind
  if (!ENGAGEMENTS.includes(kind)) throw new ApiError(400, `engagement kind must be one of ${ENGAGEMENTS.join(', ')}`)
  const conceptId = str(body.conceptId, 60)
  if (!conceptById(conceptId)) throw new ApiError(404, `no concept "${conceptId}"`)
  return recordEngagement({ kind, conceptId, detail: body.caseId ? { caseId: str(body.caseId, 120) } : undefined, at: now })
}

export function schoolCases(q: { kind?: string | null; concept?: string | null; limit?: string | null }, now = Date.now()) {
  let cases = allCases(now)
  if (q.concept) { const c = conceptById(q.concept); if (!c) throw new ApiError(404, `no concept "${q.concept}"`); cases = cases.filter((k) => c.caseKinds.includes(k.kind)) }
  if (q.kind) cases = cases.filter((k) => k.kind === q.kind)
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 50))
  return { total: cases.length, tally: outcomeTally(cases), cases: cases.slice(0, limit).map((c) => ({ ...c, before: { ...c.before, annotations: c.before.annotations.length } })), note: cases.length ? `${cases.length} case stud${cases.length === 1 ? 'y' : 'ies'} over the last ${SCAN_DAYS} days of stored candles plus the paper record. BEFORE frames are served per case.` : 'NOT ENOUGH DATA — no stored candles produced a case study yet. Lessons teach from the concept text until the scan finds one.' }
}

export function schoolCase(id: string, now = Date.now()) {
  const c = allCases(now).find((k) => k.id === id)
  if (!c) throw new ApiError(404, 'no such case study')
  return { case: c, concepts: conceptsForCaseKind(c.kind).map((k) => ({ id: k.id, title: k.title })), counterexamples: counterexamplesFor(allCases(now), c.kind, 3) }
}

export function schoolCounterexamples(kind: string | null, now = Date.now()) {
  const cases = allCases(now)
  const kinds = kind ? [kind as CaseKind] : [...new Set(cases.map((c) => c.kind))]
  return { pairs: kinds.flatMap((k) => counterexamplesFor(cases, k, 3)), note: 'Each pair is the same event kind read the same way by the same engine, once going the concept\'s way and once not.' }
}

export function schoolReplay(now = Date.now()) {
  const b = replayBundle(now)
  return { lesson: b.lesson, note: b.lesson.note }
}

export function schoolReplayStop(k: number, now = Date.now()) {
  const v = stopView(replayBundle(now), k)
  if (!v) throw new ApiError(404, 'no such stop')
  return v
}

export function schoolReplayAnswer(body: { k?: unknown; choice?: unknown }, now = Date.now()) {
  const k = Number.isInteger(body.k) ? (body.k as number) : -1
  const r = revealStop(replayBundle(now), k, str(body.choice, 40))
  if (!r) throw new ApiError(404, 'no such stop')
  const concept = conceptsForCaseKind(r.stop.kind)[0]?.id
  if (concept) recordEngagement({ kind: 'replay-stop-answered', conceptId: concept, detail: { correct: r.correct ? 1 : 0, total: 1, stopIndex: k }, at: now })
  return r
}

export function schoolDebate(snap: Snapshot) {
  return marketDebate({ analysis: snap.analysis, votes: snap.strategyVotes, decision: snap.decision, news: snap.news, now: snap.analysis?.time })
}

export async function schoolTeach(body: { question?: unknown; conceptId?: unknown; caseId?: unknown; debate?: unknown }, snap: Snapshot | null, ai: Ai, now = Date.now()) {
  const question = str(body.question, 600)
  if (!question.trim()) throw new ApiError(400, 'a question is required')
  const lesson = body.conceptId ? buildLesson(str(body.conceptId, 60), { cases: allCases(now), dataset: paperData(), now }) : null
  const caseStudy = body.caseId ? allCases(now).find((c) => c.id === str(body.caseId, 120)) ?? null : null
  const debate = body.debate && snap ? schoolDebate(snap) : null
  return teach({ question, lesson, caseStudy, debate, engineDecision: snap?.decision?.action ?? null }, ai)
}

export function schoolWhy(q: { type?: string | null; strategy?: string | null }) {
  const byType = q.type ? conceptsForAnnotation(q.type as AnnotationType) : []
  const byStrategy = q.strategy ? conceptsForStrategy(q.strategy) : []
  const concepts = [...new Map([...byType, ...byStrategy].map((c) => [c.id, c])).values()]
  return { concepts: concepts.map((c) => ({ id: c.id, title: c.title, summary: c.summary, engineChecks: c.engineChecks, misreads: c.misreads })), note: concepts.length ? 'Why the engine drew this: the concept it belongs to and what the engine checks for it.' : 'No curriculum concept maps to this object yet.' }
}

export function schoolPredictionMarket(q: { yes?: string | null; no?: string | null; fee?: string | null; slip?: string | null; p?: string | null }) {
  const example = workedExample()
  const yes = Number(q.yes), no = Number(q.no)
  if (!(yes > 0 && yes < 1 && no > 0 && no < 1)) return { example, calc: null }
  const single = singleVenueEdge({ ask: yes }, { ask: no })
  const fee = Math.min(0.2, Math.max(0, Number(q.fee) || 0))
  const slip = Math.min(0.2, Math.max(0, Number(q.slip) || 0))
  const net = netEdge(single.edge, yes + no, { feePerSide: fee, sides: 2, slippagePerContract: slip })
  const p = Number(q.p)
  const kelly = p > 0 && p < 1 ? kellyFraction(p, netOdds(yes)) : null
  return { example, calc: { single, net, kelly, provenance: 'SIMULATED' } }
}

// ---------------------------------------------------------------
// RESEARCH
// ---------------------------------------------------------------

function tradingId(): string { return config.fusion.driveTrading ? 'fused' : config.strategy === 'crossover' ? 'crossover' : 'session-ifvg' }

export function researchIndex(strategy: string | null, now = Date.now()) {
  const id = strategy || tradingId()
  const paper = paperData()
  return {
    strategyId: id,
    questions: researchQuestions(paper, { now }).slice(0, 20).map((q) => ({ cohort: q.cohort, dimension: q.dimension, value: q.value, n: q.n, meanR: q.meanR, ci95: q.ci95, draft: { question: q.draft.question, hypothesis: q.draft.hypothesis, nullHypothesis: q.draft.nullHypothesis, direction: q.draft.direction, cohortFilters: q.draft.cohortFilters, method: q.draft.method, limitations: q.draft.limitations }, critique: q.critique })),
    hypotheses: listHypotheses().slice(0, 50).map((h) => ({ id: h.id, question: h.question, status: h.status, version: h.version, strategy: h.strategy, session: h.session, regime: h.regime, sampleSize: h.sampleSize, nextReview: h.nextReview, dataset: h.dataset })),
    proposals: listProposals().slice(0, 50).map((p) => ({ id: p.id, kind: p.kind, strategyId: p.strategyId, title: p.title, status: p.status, requires: p.requires, gatesMet: p.gates.filter((g) => g.met).length, gates: p.gates.length, expiresAt: p.expiresAt })),
    trials: trialRegistry(),
    paperTrades: paper.records.filter((r) => !r.missed).length,
    notes: ['Questions are drafted UNTESTED from cohorts at the 50-trade bar whose interval clears zero; the cohort that prompted them is in-sample.', 'A proposal that passes its gates still needs a human; approval records a decision and applies nothing.'],
  }
}

const DIRECTIONS = ['positive', 'negative', 'difference'] as const

export function researchCreateHypothesis(body: Record<string, unknown>, now = Date.now()): Hypothesis {
  const filters = Array.isArray(body.cohortFilters) ? (body.cohortFilters as unknown[]).slice(0, 8).map((f) => { const o = f as { dimension?: unknown; values?: unknown }; return { dimension: str(o.dimension, 40), values: (Array.isArray(o.values) ? o.values : []).slice(0, 12).map((v) => String(v).slice(0, 40)) } }) as CohortFilter[] : []
  const source = body.source === 'BACKTEST' ? 'BACKTEST' : 'PAPER'
  const direction = DIRECTIONS.includes(body.direction as never) ? (body.direction as typeof DIRECTIONS[number]) : 'positive'
  const d = source === 'BACKTEST' ? backtestData(str(body.strategy, 40) || tradingId()) : paperData()
  const co = cohort(d, { name: 'draft', filters })
  const input: NewHypothesis = {
    question: str(body.question), observation: str(body.observation) || `Drafted by hand over ${co.stats.n} ${source} trades matching the cohort.`, hypothesis: str(body.hypothesis), nullHypothesis: str(body.nullHypothesis),
    direction, dataset: { source, label: `SOURCE: ${source} · TRADES: ${co.stats.n} · ${d.provenance.dataType}` }, cohortFilters: filters,
    method: str(body.method) || 'cohort mean with 95% Student-t interval; out-of-sample check on records decided after the draft date',
    markets: [config.symbol], timeframes: [config.interval], strategy: str(body.strategy, 40) || null, regime: str(body.regime, 40) || null, session: str(body.session, 40) || null,
    limitations: Array.isArray(body.limitations) ? (body.limitations as unknown[]).slice(0, 8).map((x) => String(x).slice(0, 200)) : [], now,
  }
  try { return createHypothesis(input) } catch (err) { throw new ApiError(400, (err as Error).message) }
}

export function researchHypotheses(q: { status?: string | null; strategy?: string | null }) {
  return listHypotheses({ status: (q.status || undefined) as HypothesisStatus | undefined, strategy: q.strategy || undefined })
}

export function researchHypothesis(id: string): Hypothesis {
  const h = getHypothesis(id)
  if (!h) throw new ApiError(404, 'no such hypothesis')
  return h
}

/** The out-of-sample check: records decided AFTER the draft, matching the cohort, from the hypothesis's own source. */
export function researchTestHypothesis(body: { id?: unknown; stage?: unknown }, now = Date.now()): Hypothesis {
  const h = researchHypothesis(str(body.id, 80))
  const stage = body.stage === 'inSample' ? 'inSample' : 'outOfSample'
  const d = h.dataset.source === 'BACKTEST' ? backtestData(h.strategy ?? tradingId()) : paperData()
  const all = cohort(d, { name: 'test', filters: h.cohortFilters })
  const records: EvidenceRecord[] = d.records.filter((r) => all.recordIds.includes(r.id) && (stage === 'inSample' || r.decidedAt > h.created))
  const s = statsOf(records)
  const result: StageResult = {
    at: now, source: h.dataset.source, dataType: d.provenance.dataType === 'MIXED' ? 'SIMULATED' : d.provenance.dataType, trades: s.n, sampleStatus: s.status, meanR: s.meanR, ci95: s.ci95,
    method: `${h.method}${stage === 'outOfSample' ? ` — records decided after ${new Date(h.created).toISOString()}` : ''}`, recordIds: records.map((r) => r.id),
    note: s.n < SAMPLE_BARS.insufficient ? `${s.n} qualifying record(s) — under the ${SAMPLE_BARS.insufficient}-trade bar.` : `${s.n} qualifying records; ${s.statusNote}`,
  }
  return saveHypothesis(recordStage(h, stage, result, now))
}

export function researchReviewHypothesis(body: { id?: unknown; note?: unknown; reject?: unknown }, now = Date.now()): Hypothesis {
  const h = researchHypothesis(str(body.id, 80))
  try { return saveHypothesis(body.reject ? rejectHypothesis(h, str(body.note) || 'rejected', now) : reviewHypothesis(h, str(body.note) || 'reviewed', now)) } catch (err) { throw new ApiError(400, (err as Error).message) }
}

export function researchOverfitting(strategy: string | null) {
  const id = strategy || tradingId()
  const bt = cachedBacktest(id)
  const rs = (bt?.trades ?? []).map((t) => fromReplayTrade(t, { symbol: config.symbol, interval: config.interval })).filter((r) => !r.corrupt && r.rMultiple !== null).map((r) => r.rMultiple as number)
  const trials = Math.max(1, trialsFor(id))
  return {
    strategyId: id, trials, registry: trialRegistry(),
    deflated: rs.length ? deflatedSharpeFull(rs, trials, config.factory.deflatedSharpeMin) : null,
    curve: deflationCurve(Math.max(rs.length, 2)),
    sample: { trades: rs.length, source: 'BACKTEST', dataType: 'SIMULATED', computedAt: bt?.computedAt ?? null },
    note: rs.length ? `Deflated over ${trials} recorded trial(s) for ${id}. Every backtest evaluation counts — the ones discarded as much as the ones kept.` : 'NOT ENOUGH DATA — no cached backtest for this strategy. Run POST /api/evidence/backtest first; it will be counted as a trial.',
  }
}

export function researchAtlas(q: { source?: string | null; dim?: string | null; strategy?: string | null }) {
  const d = datasetFor(q.source ?? null, q.strategy || tradingId())
  return regimeAtlas(d, q.dim === 'regime' ? 'regime' : 'volatility')
}

export function researchDiffusion(now = Date.now(), days = 30) {
  const candles = historyCandles(days, now)
  const from = now - days * DAY
  const news = allSeries().flatMap((s) => s.instances.filter((i) => i.time >= from && i.time <= now && (i.impact === 'High' || i.impact === 'Medium')).map((i) => i.time))
  const pe = priceEvents(candles, 3, 288)
  const fit = fitHawkes({ priceTimes: pe.times, newsTimes: news, from, to: now, threshold: pe.threshold })
  return { fit, history: historyDepth(), window: { from, to: now, days, candles: candles.length }, note: fit.status === 'ESTIMATED' ? fit.note : `${fit.note} News memory: ${historyDepth().instances} instance(s) on record; the calendar memory fills as the bot runs.` }
}

const PROPOSAL_KINDS: ProposalKind[] = ['parameter-variant', 'filter', 'retire', 'promote', 'watch']

export function researchCreateProposal(body: Record<string, unknown>, now = Date.now()): Proposal {
  const kind = str(body.kind, 30) as ProposalKind
  if (!PROPOSAL_KINDS.includes(kind)) throw new ApiError(400, `kind must be one of ${PROPOSAL_KINDS.join(', ')}`)
  const strategyId = str(body.strategyId, 40)
  if (strategyId !== 'fused' && !strategyIds().includes(strategyId)) throw new ApiError(400, `unknown strategy "${strategyId}"`)
  const title = str(body.title, 120), rationale = str(body.rationale, 1000), change = str(body.change, 400)
  if (!title || !rationale || !change) throw new ApiError(400, 'title, rationale and change are required')
  const params = body.params && typeof body.params === 'object' ? Object.fromEntries(Object.entries(body.params as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).slice(0, 12)) as Record<string, number> : null
  const bt = cachedBacktest(strategyId)
  const oosRs = (bt?.trades ?? []).map((t) => fromReplayTrade(t, { symbol: config.symbol, interval: config.interval })).filter((r) => !r.corrupt && r.rMultiple !== null).map((r) => r.rMultiple as number)
  const paper = paperData()
  const paperCohort = cohort(paper, { name: strategyId, filters: [{ dimension: 'strategyId', values: [strategyId] }] })
  const hyps = listHypotheses({ strategy: strategyId })
  const linked = Array.isArray(body.hypothesisIds) ? (body.hypothesisIds as unknown[]).map((x) => String(x).slice(0, 80)).filter((id) => hyps.some((h) => h.id === id)) : []
  const p = makeProposal({
    kind, strategyId, title, rationale, change, params,
    evidence: { hypothesisIds: linked, recordIds: paperCohort.recordIds.slice(0, 200), campaignId: null, passportId: null },
    oosRs, paperTrades: paperCohort.stats.n, walkForwardPositiveShare: null,
    hypothesisStatuses: hyps.filter((h) => linked.includes(h.id)).map((h) => h.status),
    critique: critiqueCohort(paperCohort, { source: 'PAPER' }), now,
  })
  return saveProposal(p)
}

export function researchProposals(q: { status?: string | null; strategy?: string | null }) {
  return listProposals({ status: (q.status || undefined) as ProposalStatus | undefined, strategyId: q.strategy || undefined })
}

export function researchDecideProposal(body: { id?: unknown; decision?: unknown; by?: unknown; note?: unknown }, now = Date.now()): Proposal {
  const p = getProposal(str(body.id, 80))
  if (!p) throw new ApiError(404, 'no such proposal')
  const decision = body.decision === 'APPROVED' ? 'APPROVED' : body.decision === 'REJECTED' ? 'REJECTED' : null
  if (!decision) throw new ApiError(400, 'decision must be APPROVED or REJECTED')
  try { return saveProposal(decideProposal(p, decision, str(body.by, 80), str(body.note, 500) || decision.toLowerCase(), now)) } catch (err) { throw new ApiError(400, (err as Error).message) }
}

export function researchRecordTrial(body: { strategyId?: unknown; count?: unknown; note?: unknown }, now = Date.now()) {
  const strategyId = str(body.strategyId, 40) || tradingId()
  const count = Math.min(10_000, Math.max(1, Math.floor(Number(body.count) || 1)))
  return { strategyId, total: recordTrials({ strategyId, source: 'manual', count, note: str(body.note, 200) || 'recorded by hand', at: now }) }
}

// ---------------------------------------------------------------
// KNOWLEDGE
// ---------------------------------------------------------------

export function knowledgeIndex(q: { kind?: string | null; status?: string | null; tag?: string | null; limit?: string | null }) {
  const items = listItems({ kind: (q.kind || undefined) as KnowledgeKind | undefined, status: (q.status || undefined) as KnowledgeStatus | undefined, tag: q.tag || undefined })
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100))
  return { summary: vaultSummary(), items: items.slice(0, limit).map((i) => ({ id: i.id, kind: i.kind, title: i.title, status: i.status, evidenceLabel: i.evidenceLabel, version: i.version, created_at: i.created_at, review_due: i.review_due, new_evidence_count: i.new_evidence_count, contradictory_evidence_count: i.contradictory_evidence_count, tags: i.tags, source: i.provenance.source })), total: items.length, note: items.length ? 'Every item carries its provenance and expires into review. What did not work is kept, not deleted.' : 'The vault is empty. It fills as paper trades close, case studies are found and hypotheses are tested.' }
}

export function knowledgeItem(id: string) {
  const it = getItem(id)
  if (!it) throw new ApiError(404, 'no such item')
  return it
}

export function knowledgeReview(body: { id?: unknown; outcome?: unknown; note?: unknown; body?: unknown; evidenceLabel?: unknown }, now = Date.now()) {
  const id = str(body.id, 160)
  const note = str(body.note, 500) || 'reviewed'
  let r: ReviewOutcome
  if (body.outcome === 'CONFIRMED') r = { outcome: 'CONFIRMED', note }
  else if (body.outcome === 'RETIRED') r = { outcome: 'RETIRED', note }
  else if (body.outcome === 'REVISED') { const text = str(body.body, 4000); if (!text.trim()) throw new ApiError(400, 'a revision needs a body'); r = { outcome: 'REVISED', note, body: text } }
  else throw new ApiError(400, 'outcome must be CONFIRMED, REVISED or RETIRED')
  const it = reviewItem(id, r, now)
  if (!it) throw new ApiError(404, 'no such item')
  return it
}

export function knowledgePassport(strategy: string | null, now = Date.now()) {
  const id = strategy || tradingId()
  return livingPassport(id, readPositions().closed, { now })
}

export function knowledgeBrief(now = Date.now()) { return dailyBrief(readPositions().closed, now) }
export function knowledgeEndOfDay(now = Date.now()) { return endOfDay(readPositions().closed, now) }
export function knowledgeWeekly(now = Date.now()) { return weeklyReview(readPositions().closed, now) }
export function knowledgeReassess(now = Date.now()) { return reassessAll(now) }
export function knowledgeGraph() { return conceptGraph() }

/** Backfill: run the observer over every closed paper record it has not seen (idempotent). For the acceptance workflow and first boot after upgrade. */
export function knowledgeBackfill(now = Date.now()) {
  const closed = readPositions().closed
  const seen = new Set(listItems({ kind: 'lesson' }).map((i) => i.id))
  let observed = 0
  for (const p of closed) { if (!seen.has(`lesson:post-mortem:${p.id}`)) { observePaperClose(p, now); observed++ } }
  return { closed: closed.length, observed, note: observed ? `${observed} closed record(s) observed for the first time.` : 'Every closed record already has a post-mortem.' }
}
