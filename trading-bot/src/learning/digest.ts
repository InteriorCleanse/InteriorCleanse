/**
 * THE DAILY LEARNING DIGEST, THE WEEKLY RESEARCH REVIEW AND THE MONTHLY MODEL
 * AUDIT — assembled from the stored records, written once per period under a
 * deterministic id, and re-read afterwards so a restart does not produce a
 * second digest for the same day.
 *
 * DAILY: what the market did, what the paper engine did, which events were
 * significant and why, which case studies were created, which research
 * questions were generated, which experiments ran, what was learned, what was
 * contradicted, what knowledge was updated, what needs review, what data
 * quality issues appeared, what to study next — and the LESSON OF THE DAY,
 * built from the most significant case resolved that day: BEFORE, DECISION,
 * AFTER, what it teaches, and what it does not.
 *
 * WEEKLY: what changed, what was learned, what was contradicted, what remains
 * uncertain, what needs more data, what should be tested next, and WHAT SHOULD
 * NOT BE TOUCHED.
 *
 * MONTHLY: every strategy against its record, the model's own versions, the
 * knowledge store's health, and the boundaries that were not crossed.
 *
 * Nothing in a digest is a forecast. Nothing in a digest changes anything.
 */

import { config } from '../../config.ts'
import { SAMPLE_BARS, byDimension, statsOf } from '../analyst/cohorts.ts'
import { paperDataset } from '../analyst/records.ts'
import type { Dataset } from '../analyst/records.ts'
import { knowledgeRequiringReview } from '../knowledge/decayMonitor.ts'
import { failureSummary, listFailures } from '../knowledge/failures.ts'
import { listItems, vaultSummary } from '../knowledge/vault.ts'
import type { KnowledgeItem } from '../knowledge/vault.ts'
import { listObservations, observationCounts } from '../observer/events.ts'
import type { Observation } from '../observer/events.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { listExperiments } from '../research/experiments.ts'
import type { Experiment } from '../research/experiments.ts'
import { listHypotheses } from '../research/hypotheses.ts'
import { listProposals } from '../research/lab.ts'
import { trialRegistry } from '../research/overfitting.ts'
import { listQueue, nextTestable, queueSummary } from '../research/queue.ts'
import { recommendations } from '../research/recommend.ts'
import type { DriftInput } from '../research/recommend.ts'
import { reviewQueue } from '../research/review.ts'
import { championChallengerView } from '../research/sandbox.ts'
import { CONCEPT_OF } from '../school/caseStudies.ts'
import type { CaseStudy } from '../school/caseStudies.ts'
import { conceptById, conceptsForCaseKind } from '../school/curriculum.ts'
import { dataGrowth } from '../school/lessons.ts'
import { toET, tradingDayKey } from '../sessions.ts'
import { metaById, strategyIds } from '../strategies/registry.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'
import { driftAll } from './drift.ts'
import { strategyVersion } from '../knowledge/decayMonitor.ts'

const DAY = 86_400_000
const fx = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

export type DigestSection = { heading: string; lines: string[]; evidenceLabel: 'OBSERVED' | 'INSUFFICIENT DATA' | 'INFERRED' | 'HYPOTHESIS'; source: string }

export type LessonOfTheDay = {
  caseId: string
  title: string
  kind: string
  conceptId: string
  at: number
  source: 'HISTORICAL' | 'PAPER'
  before: string
  decision: string
  after: string
  teaches: string
  doesNotTeach: string[]
  evidenceLabel: 'OBSERVED' | 'INSUFFICIENT DATA'
  significance: number
  note: string
}

export type DailyDigest = {
  kind: 'DAILY LEARNING DIGEST'
  id: string
  dayKey: string
  at: number
  from: number
  to: number
  engineVersion: string
  sections: DigestSection[]
  lessonOfTheDay: LessonOfTheDay | null
  counts: { observations: number; selected: number; casesResolved: number; questionsCreated: number; experimentsFinished: number; knowledgeMoved: number; paperCloses: number }
  notes: string[]
}

/** Period keys, in New York time like every other date on the desk. */
export function weekKey(ms: number): string {
  const p = toET(ms)
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
export function monthKey(ms: number): string { const p = toET(ms); return `${p.year}-${String(p.month).padStart(2, '0')}` }

const dayId = (k: string) => `digest:daily:${k}`
const weekId = (k: string) => `digest:weekly:${k}`
const monthId = (k: string) => `digest:monthly:${k}`

function caseOf(o: Observation): CaseStudy | null {
  if (!o.caseId) return null
  const it = listItems({ kind: 'case-study' }).find((i) => i.id === o.caseId)
  return (it?.payload as CaseStudy | undefined) ?? null
}

/** The lesson: the most significant case resolved in the window, described BEFORE → DECISION → AFTER, with what it teaches and what it cannot. Pure over the observation and its case. */
export function lessonFrom(o: Observation, c: CaseStudy): LessonOfTheDay {
  const concept = conceptById(c.concept) ?? conceptsForCaseKind(c.kind)[0] ?? conceptById(CONCEPT_OF[c.kind] ?? '') ?? null
  const before = `As of ${iso(c.before.asOf)}: session ${c.before.session ?? '—'}, regime ${c.before.regime ?? 'unclassified'}, volatility ${c.before.volatility ?? '—'}, structure ${c.before.structureTrend ?? '—'}, price ${c.before.price}. ${c.before.annotations.length} annotation(s) were knowable. Then: ${c.during.detail}`
  const decision = c.decision.note + (c.decision.fused ? ` Fused: ${c.decision.fused.action} at ${c.decision.fused.score}/100.` : '') + (c.decision.paperTradeId ? ` Paper trade ${c.decision.paperTradeId}.` : ' No paper trade.')
  const after = c.after.candles > 0 ? `${c.after.note} Over ${c.after.candles} candle(s): move ${fx(c.after.moveAtr)} ATR, max up ${fx(c.after.maxUpAtr)}, max down ${fx(c.after.maxDownAtr)}.` : c.after.note
  const went = c.after.wentExpectedWay
  const teaches = concept
    ? `${concept.title}: ${concept.summary} On this occasion price ${went === null ? 'had no expected direction to go' : went ? 'went the way the concept expects' : 'went the other way'} — one instance, which is what a case study is.`
    : `One instance of ${c.kind}. ${went === null ? 'The concept has no expected direction here.' : went ? 'Price went the way the concept expects.' : 'Price went the other way.'}`
  return {
    caseId: c.id, title: c.title, kind: c.kind, conceptId: concept?.id ?? c.concept, at: c.at, source: c.provenance.source,
    before, decision, after, teaches,
    doesNotTeach: [
      'Whether the next instance will go the same way — a case study is one observation.',
      'Whether the engine should have decided differently — the record is immutable and nothing is re-simulated.',
      ...(concept?.misreads.slice(0, 2).map((m) => `A common misread: ${m}`) ?? []),
    ],
    evidenceLabel: c.evidenceLevel, significance: o.significance.score,
    note: `Selected because it was the most significant case resolved in the window (${o.significance.score}/100: ${o.significance.reasons.slice(0, 2).join('; ')}).`,
  }
}

function lessonOfTheDay(from: number, to: number): { lesson: LessonOfTheDay | null; note: string } {
  const today = listObservations({ status: 'RESOLVED', from, to, limit: 500 }).sort((a, b) => b.significance.score - a.significance.score)
  for (const o of today) { const c = caseOf(o); if (c) return { lesson: lessonFrom(o, c), note: 'Resolved today.' } }
  const recent = listObservations({ status: 'RESOLVED', from: to - 7 * DAY, to, limit: 500 }).sort((a, b) => b.significance.score - a.significance.score)
  for (const o of recent) { const c = caseOf(o); if (c) return { lesson: { ...lessonFrom(o, c), note: `No case was resolved today; the most significant case of the last 7 days is shown instead (${o.significance.score}/100).` }, note: 'From the last 7 days.' } }
  return { lesson: null, note: 'No resolved case study yet. Candidates resolve when their horizon candles are stored; until then there is nothing to teach from.' }
}

const S = (heading: string, lines: string[], evidenceLabel: DigestSection['evidenceLabel'], source: string): DigestSection => ({ heading, lines: lines.length ? lines : ['Nothing recorded in this window.'], evidenceLabel: lines.length ? evidenceLabel : 'INSUFFICIENT DATA', source })

/** Build the digest for the trading day containing `now`. Pure over the stores; does not write. */
export function buildDailyDigest(closed: PaperPosition[], now = Date.now(), opts: { drift?: DriftInput } = {}): DailyDigest {
  const dayKey = tradingDayKey(now)
  const to = now
  const from = now - DAY
  const obs = listObservations({ from, to, limit: 2000 })
  const selected = obs.filter((o) => o.significance.selected)
  const byType: Record<string, number> = {}
  for (const o of obs) byType[o.type] = (byType[o.type] ?? 0) + 1
  const regimes = obs.filter((o) => o.type === 'REGIME CHANGE')
  const marketLines = [
    ...(obs.length ? [`${obs.length} observation(s): ${Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k.toLowerCase()} ×${v}`).join(', ')}.`] : []),
    ...(regimes.length ? [`Regime changed ${regimes.length} time(s): ${regimes.slice(0, 4).map((o) => o.detail).join(' | ')}`] : []),
    ...obs.filter((o) => o.type === 'NEWS EVENT').slice(0, 3).map((o) => `News: ${o.detail}`),
    ...obs.filter((o) => o.type === 'ANOMALY').slice(0, 3).map((o) => `Anomaly: ${o.detail}`),
  ]
  const paperToday = closed.filter((p) => (p.closedAt ?? p.openedAt) >= from && (p.closedAt ?? p.openedAt) < to)
  const closes = paperToday.filter((p) => p.exitReason !== 'missed')
  const missed = paperToday.filter((p) => p.exitReason === 'missed')
  const rs = closes.map((p) => p.rMultiple).filter((r): r is number => typeof r === 'number')
  const paperLines = [
    ...(closes.length ? [`${closes.length} paper close(s), ${fx(rs.reduce((a, b) => a + b, 0))}R in total: ${closes.slice(0, 6).map((p) => `${p.strategyId ?? '—'} ${p.direction} ${fx(p.rMultiple ?? null)}R (${p.exitReason})`).join('; ')}. A day is not a sample.`] : []),
    ...(missed.length ? [`${missed.length} decision(s) refused before a fill: ${missed.slice(0, 4).map((p) => p.note ?? 'refused').join('; ')}.`] : []),
    ...obs.filter((o) => o.type === 'RISK VETO').slice(0, 3).map((o) => `Risk veto: ${o.detail}`),
  ]
  // Behaviour by strategy, regime and session — counts of what was observed and what closed, never a rating.
  const count = <T,>(xs: T[], key: (x: T) => string | null): Array<[string, number]> => { const m: Record<string, number> = {}; for (const x of xs) { const k = key(x); if (k) m[k] = (m[k] ?? 0) + 1 } return Object.entries(m).sort((a, b) => b[1] - a[1]) }
  const stratObs = obs.filter((o) => o.type === 'STRATEGY ACTIVATION' || o.type === 'STRATEGY REJECTION' || o.type === 'RISK VETO')
  const strategyLines = [
    ...count(closes, (p) => p.strategyId ?? null).map(([id, n]) => { const rr = closes.filter((p) => p.strategyId === id).map((p) => p.rMultiple ?? 0); return `${id}: ${n} close(s), ${fx(rr.reduce((a, b) => a + b, 0))}R in total (a day, not a sample).` }),
    ...(stratObs.length ? [`${stratObs.filter((o) => o.type === 'STRATEGY ACTIVATION').length} activation(s), ${stratObs.filter((o) => o.type === 'STRATEGY REJECTION').length} rejection(s), ${stratObs.filter((o) => o.type === 'RISK VETO').length} risk veto(es) observed.`] : []),
    ...stratObs.filter((o) => o.significance.selected).slice(0, 3).map((o) => `${o.type.toLowerCase()}: ${o.detail.slice(0, 120)}`),
  ]
  const regimeLines = [
    ...count(obs, (o) => o.regime).map(([r, n]) => `${r}: ${n} observation(s)${closes.filter((p) => p.regime === r).length ? `, ${closes.filter((p) => p.regime === r).length} close(s)` : ''}.`),
    ...regimes.slice(0, 3).map((o) => `Transition at ${iso(o.time)}: ${o.detail}`),
  ]
  const sessionLines = count([...obs.map((o) => o.session), ...closes.map((p) => p.session?.toLowerCase() ?? null)], (s) => s).map(([s, n]) => `${s}: ${n} observation(s) and close(s) combined; ${closes.filter((p) => (p.session ?? '').toLowerCase() === s).length} close(s).`)
  const sigLines = selected.sort((a, b) => b.significance.score - a.significance.score).slice(0, 8).map((o) => `${o.significance.score}/100 ${o.type.toLowerCase()} at ${iso(o.time)} — ${o.significance.reasons.slice(0, 2).join('; ')} [${o.status}]`)
  const resolved = listObservations({ status: 'RESOLVED', from, to, limit: 500 }).filter((o) => (o.resolvedAt ?? 0) >= from)
  const caseLines = resolved.slice(0, 10).map((o) => `${o.type.toLowerCase()} at ${iso(o.time)} → case ${o.caseId} (${o.resolutionNote ?? 'resolved'})`)
  const unresolvable = listObservations({ status: 'UNRESOLVABLE', from: from - 7 * DAY, to, limit: 200 }).filter((o) => (o.resolvedAt ?? 0) >= from)
  const newQ = listQueue().filter((q) => q.createdAt >= from && q.createdAt < to)
  const qLines = newQ.slice(0, 10).map((q) => `[${q.status}${q.status === 'BLOCKED' ? `: needs ${q.requiredData.missing[0] ?? 'data'}` : ''}] ${q.question} (${q.origin}, priority ${q.priority})`)
  const finished = listExperiments({ status: 'DONE' }).filter((e) => (e.finishedAt ?? 0) >= from && (e.finishedAt ?? 0) < to)
  const expLines = finished.slice(0, 10).map((e) => `${e.result}: ${e.method} — OOS ${e.oosResult ? `${e.oosResult.trades} trade(s), ${fx(e.oosResult.meanR)}R` : 'not run'} vs baseline ${e.baselineOos ? fx(e.baselineOos.meanR) + 'R' : '—'}; ${e.comparison.oos?.verdict ?? 'TOO FEW'}${(e.challenge as { overall?: string } | null)?.overall ? `; challenger ${(e.challenge as { overall: string }).overall}` : ''}`)
  const learned = finished.filter((e) => e.result === 'OOS SUPPORTED' || e.result === 'NOT SUPPORTED').map((e) => `${e.result === 'OOS SUPPORTED' ? 'Supported out of sample' : 'Not supported'}: ${e.method}. ${e.result === 'OOS SUPPORTED' ? 'That is a stage, not a conclusion; robustness and the challenger follow.' : 'Recorded in failure memory.'}`)
  const hyps = listHypotheses()
  const contra = [
    ...hyps.filter((h) => h.history.some((x) => x.at >= from && x.at < to && /counter|contradict|not-supported|reject/i.test(x.event))).map((h) => `Hypothesis ${h.status}: ${h.question}${h.counterevidence.length ? ` — ${h.counterevidence[h.counterevidence.length - 1]}` : ''}`),
    ...listItems({ status: 'CONTRADICTED' }).filter((i) => i.history.some((x) => x.event === 'contradicted' && x.at >= from && x.at < to)).map((i) => `Knowledge contradicted: ${i.title} — ${i.history.filter((x) => x.event === 'contradicted').at(-1)?.detail ?? ''}`),
  ]
  const moved = listItems().filter((i) => i.history.some((x) => x.at >= from && x.at < to))
  const kLines = [
    ...moved.filter((i) => i.created_at >= from).slice(0, 8).map((i) => `New ${i.kind}: ${i.title} [${i.evidenceLabel}]`),
    ...moved.filter((i) => i.created_at < from).slice(0, 8).map((i) => `${i.kind}: ${i.title} → ${i.status} (${i.history.at(-1)?.event})`),
  ]
  const rr = knowledgeRequiringReview()
  const reviewLines = [...rr.contradicted.map((i) => `CONTRADICTED: ${i.title}`), ...rr.reviewRequired.map((i) => `REVIEW REQUIRED: ${i.title}`), ...rr.stale.map((i) => `STALE: ${i.title}`)].slice(0, 12)
  const paper = paperDataset(closed)
  const corrupt = paper.provenance.corrupt
  const dqLines = [
    ...(unresolvable.length ? [`${unresolvable.length} candidate(s) could not be resolved: ${unresolvable.slice(0, 3).map((o) => o.resolutionNote ?? '').join('; ')}`] : []),
    ...(corrupt ? [`${corrupt} paper record(s) unreadable and excluded from every statistic.`] : []),
    ...listFailures({ kind: 'data-quality' }).filter((f) => f.at >= from).map((f) => f.title),
  ]
  const recs = recommendations({ paper, drift: opts.drift, now, max: 3 })
  const studyLines = recs.items.map((r) => `${r.topic}: ${r.question} — WHY: ${r.why} MISSING: ${r.missing}`)
  const lod = lessonOfTheDay(from, to)
  const sections: DigestSection[] = [
    S('WHAT THE MARKET DID', marketLines, 'OBSERVED', 'observer table — engine events on stored candles'),
    S('WHAT THE PAPER ENGINE DID', paperLines, 'OBSERVED', 'PAPER — live market, simulated execution'),
    S('STRATEGY BEHAVIOR', strategyLines, 'OBSERVED', 'paper closes and strategy observations — counts, not ratings'),
    S('REGIME BEHAVIOR', regimeLines, 'OBSERVED', 'observations carry the regime the engine read at the close'),
    S('SESSION BEHAVIOR', sessionLines, 'OBSERVED', 'observations and closes by session'),
    S('WHICH EVENTS WERE SIGNIFICANT AND WHY', sigLines, 'OBSERVED', 'significance engine — measurable properties, no return prediction'),
    S('WHICH CASE STUDIES WERE CREATED', caseLines, 'OBSERVED', 'case-study engine — BEFORE from what was knowable, AFTER from stored candles'),
    S('WHICH RESEARCH QUESTIONS WERE GENERATED', qLines, 'HYPOTHESIS', 'research queue'),
    S('WHICH EXPERIMENTS RAN', expLines, 'OBSERVED', 'experiment registry — frozen dataset, baseline, out-of-sample'),
    S('WHAT WAS LEARNED', learned, 'OBSERVED', 'experiment results at their stage'),
    S('WHAT WAS CONTRADICTED', contra, 'OBSERVED', 'hypothesis store, decay monitor'),
    S('WHAT KNOWLEDGE WAS UPDATED', kLines, 'OBSERVED', 'knowledge vault — appended, never rewritten'),
    S('WHAT NEEDS REVIEW', reviewLines, 'OBSERVED', 'decay monitor'),
    S('DATA QUALITY', dqLines, 'OBSERVED', 'observer, evidence records, failure memory'),
    S('WHAT TO STUDY NEXT', studyLines, 'INFERRED', 'recommendations — questions, never trades'),
  ]
  return {
    kind: 'DAILY LEARNING DIGEST', id: dayId(dayKey), dayKey, at: now, from, to, engineVersion: VERSION,
    sections, lessonOfTheDay: lod.lesson,
    counts: { observations: obs.length, selected: selected.length, casesResolved: resolved.length, questionsCreated: newQ.length, experimentsFinished: finished.length, knowledgeMoved: moved.length, paperCloses: closes.length },
    notes: [
      'A digest describes the last 24 hours. It forecasts nothing and changes nothing.',
      lod.note,
      `Paper record: ${dataGrowth(paper.provenance.trades).note}`,
      'The engine reads none of this.',
    ],
  }
}

/** The stored digest for the day, or build and store it once. A second call for the same day returns the first. */
export function dailyDigest(closed: PaperPosition[], now = Date.now(), opts: { drift?: DriftInput; rebuild?: boolean } = {}): { digest: DailyDigest; stored: boolean; isNew: boolean } {
  const id = dayId(tradingDayKey(now))
  const prior = opts.rebuild ? null : store().getJson<DailyDigest>(id)
  if (prior) return { digest: prior, stored: true, isNew: false }
  const digest = buildDailyDigest(closed, now, opts)
  store().setJson(id, digest)
  return { digest, stored: true, isNew: true }
}

// ---------------------------------------------------------------
// WEEKLY RESEARCH REVIEW
// ---------------------------------------------------------------

export type WeeklyResearchReview = {
  kind: 'WEEKLY RESEARCH REVIEW'
  id: string
  weekKey: string
  at: number
  from: number
  to: number
  engineVersion: string
  sections: DigestSection[]
  doNotTouch: string[]
  counts: { experimentsFinished: number; supported: number; notSupported: number; inconclusive: number; insufficient: number; contradicted: number; failuresRecorded: number; queueBlocked: number }
  notes: string[]
}

export function buildWeeklyResearchReview(closed: PaperPosition[], now = Date.now(), opts: { drift?: DriftInput } = {}): WeeklyResearchReview {
  const to = now, from = now - 7 * DAY
  const paper = paperDataset(closed)
  const finished = listExperiments({ status: 'DONE' }).filter((e) => (e.finishedAt ?? 0) >= from && (e.finishedAt ?? 0) < to)
  const by = (r: Experiment['result']) => finished.filter((e) => e.result === r)
  const moved = listItems().filter((i) => i.history.some((x) => x.at >= from && x.at < to && x.event !== 'created'))
  const created = listItems().filter((i) => i.created_at >= from && i.created_at < to)
  const q = queueSummary()
  const newQ = listQueue().filter((x) => x.createdAt >= from)
  const failures = listFailures().filter((f) => f.at >= from && f.at < to)
  const contradicted = listItems({ status: 'CONTRADICTED' }).filter((i) => i.history.some((x) => x.event === 'contradicted' && x.at >= from))
  const hypsContra = listHypotheses().filter((h) => h.history.some((x) => x.at >= from && /not-supported|reject|counter/i.test(x.event)))
  const blocked = listQueue({ status: 'BLOCKED' })
  const byStrategy = byDimension(paper, 'strategyId', { includeEmpty: false })
  const thin = strategyIds().map((id) => ({ id, n: byStrategy.rows.find((r) => r.name === id)?.stats.n ?? 0 })).filter((x) => x.n < SAMPLE_BARS.insufficient)
  const uncertain = [
    ...by('INCONCLUSIVE').map((e) => `INCONCLUSIVE: ${e.method} — ${e.comparison.oos?.note ?? 'out-of-sample interval spans zero'}`),
    ...listHypotheses({ status: 'OBSERVED IN SAMPLE' }).map((h) => `Observed in sample only: ${h.question}`),
    ...byDimension(paper, 'session').rows.filter((r) => r.stats.n >= SAMPLE_BARS.insufficient && r.stats.ci95 && r.stats.ci95.lo < 0 && r.stats.ci95.hi > 0).map((r) => `${r.name}: ${r.stats.n} trades, interval ${fx(r.stats.ci95!.lo)} to ${fx(r.stats.ci95!.hi)} spans zero`),
  ]
  const moreData = [
    ...thin.map((x) => `${x.id}: ${x.n} paper trade(s), ${SAMPLE_BARS.insufficient - x.n} more before anything is stated`),
    ...blocked.slice(0, 8).map((x) => `${x.question} — needs ${x.requiredData.missing.join(', ') || `${x.requiredData.minTrades - x.requiredData.have} more trades`}`),
    ...by('INSUFFICIENT DATA').map((e) => `${e.method}: under the bar on at least one side`),
  ]
  const next = nextTestable(now)
  const recs = recommendations({ paper, drift: opts.drift, now, max: 5 })
  const testNext = [
    ...(next ? [`Next testable: ${next.question} (priority ${next.priority}: ${next.priorityReasons.slice(0, 2).join('; ')})`] : ['Nothing testable in the queue; items are blocked on data or under test.']),
    ...recs.items.map((r) => `${r.topic}: ${r.question}`),
  ]
  const awaiting = reviewQueue(now).awaiting
  const doNotTouch = [
    `Production strategies and parameters: ${config.strategies.enabled.length ? config.strategies.enabled.join(', ') : 'all registered'} at their config defaults. No research result applies itself; a change is a config edit a person makes and commits.`,
    `Champion passports: unchanged by research. ${strategyIds().map((id) => { const v = championChallengerView(id, closed); return v.champion ? `${id} champion ${v.champion.id}` : null }).filter(Boolean).join('; ') || 'no champions minted'}.`,
    ...(awaiting.length ? [`${awaiting.length} proposal(s) await a human; approving one advances a paper test stage and modifies nothing.`] : ['No proposal awaits review; nothing is pending application.']),
    ...thin.map((x) => `${x.id}: under the ${SAMPLE_BARS.insufficient}-trade bar — nothing about it should change on this evidence.`),
    ...by('OOS SUPPORTED').map((e) => `${e.strategyId}: "${e.method}" is OOS SUPPORTED at one stage; that is not a reason to change the strategy — robustness review and the challenger come first, then a proposal, then a human.`),
    `Live execution gate: ${config.live.enabled ? 'ENABLED' : 'disabled'}; shadow: ${config.shadow.enabled ? 'enabled' : 'disabled'}. The research layer cannot reach either.`,
  ]
  const weekObs = listObservations({ from, to, limit: 5000 })
  const obsByType: Record<string, number> = {}
  for (const o of weekObs) obsByType[o.type] = (obsByType[o.type] ?? 0) + 1
  const resolvedWeek = weekObs.filter((o) => o.status === 'RESOLVED')
  const observed = [
    ...(weekObs.length ? [`${weekObs.length} observation(s): ${Object.entries(obsByType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k.toLowerCase()} ×${v}`).join(', ')}.`] : []),
    ...(weekObs.filter((o) => o.significance.selected).length ? [`${weekObs.filter((o) => o.significance.selected).length} selected for study; ${resolvedWeek.length} resolved into case studies.`] : []),
    ...resolvedWeek.sort((a, b) => b.significance.score - a.significance.score).slice(0, 5).map((o) => `${o.significance.score}/100 ${o.type.toLowerCase()} at ${iso(o.time)} → ${o.caseId}`),
  ]
  const tested = finished.map((e) => `${e.result}: ${e.method} — OOS ${e.oosResult ? `${e.oosResult.trades} trade(s), ${fx(e.oosResult.meanR)}R` : 'not run'} vs baseline ${e.baselineOos ? `${fx(e.baselineOos.meanR)}R` : '—'}; ${e.comparison.oos?.verdict ?? 'TOO FEW'}`)
  const survived = by('OOS SUPPORTED').map((e) => `${e.method} — ${e.comparison.oos?.note ?? ''} Robustness ${e.robustnessResult?.verdict ?? 'UNTESTED'}; challenger ${(e.challenge as { overall?: string } | null)?.overall ?? 'not run'}. A stage, not a conclusion.`)
  const failed = [
    ...by('NOT SUPPORTED').map((e) => `NOT SUPPORTED: ${e.method} — ${e.comparison.oos?.note ?? ''}`),
    ...finished.filter((e) => (e.challenge as { overall?: string } | null)?.overall === 'DISPROVED').map((e) => `DISPROVED by the challenger: ${e.method}`),
    ...failures.map((f) => `Failure memory: ${f.title}${f.replicated ? ` (replicated ×${f.occurrences})` : ''}`),
  ]
  const staleItems = [...listItems({ status: 'STALE' }), ...listItems({ status: 'REVIEW REQUIRED' }), ...listItems({ status: 'WATCH' })]
  const staleHyps = listHypotheses({ status: 'STALE' })
  const stale = [
    ...staleItems.slice(0, 10).map((i) => `${i.status}: ${i.title} (last reviewed ${iso(i.last_reviewed)})`),
    ...staleHyps.slice(0, 5).map((h) => `STALE hypothesis: ${h.question}`),
  ]
  const sections: DigestSection[] = [
    S('WHAT CHANGED', [
      `${finished.length} experiment(s) finished; ${newQ.length} queue item(s) created; queue now ${q.total} (${Object.entries(q.byStatus).map(([k, v]) => `${k} ${v}`).join(', ')}).`,
      `${created.length} knowledge item(s) created, ${moved.length} moved status; vault ${vaultSummary().total} item(s).`,
      `${weekObs.length} observation(s) recorded, ${observationCounts().resolved} resolved in total.`,
      `Paper: ${closed.filter((p) => (p.closedAt ?? p.openedAt) >= from && p.exitReason !== 'missed').length} close(s) this week; record ${paper.provenance.trades} trade(s) (${dataGrowth(paper.provenance.trades).band}).`,
    ], 'OBSERVED', 'registries and stores'),
    S('WHAT WE OBSERVED', observed, 'OBSERVED', 'observer table, case-study engine'),
    S('WHAT WE TESTED', tested, 'OBSERVED', 'experiment registry — frozen dataset, baseline, out-of-sample'),
    S('WHAT SURVIVED', survived, 'OBSERVED', 'out-of-sample stage, robustness, challenger'),
    S('WHAT FAILED', failed, 'OBSERVED', 'experiment registry, challenger, failure memory'),
    S('WHAT CONTRADICTED PREVIOUS BELIEFS', [...contradicted.map((i) => `${i.title} — ${i.history.filter((x) => x.event === 'contradicted').at(-1)?.detail ?? ''}`), ...hypsContra.map((h) => `${h.status}: ${h.question}`)], 'OBSERVED', 'decay monitor, hypothesis store'),
    S('WHAT NEEDS MORE DATA', [...moreData, ...uncertain], 'INSUFFICIENT DATA', 'sample bars; experiments and cohorts whose intervals span zero'),
    S('WHAT IS STALE', stale, 'OBSERVED', 'knowledge vault and hypothesis store — expired into review, never deleted'),
    S('WHAT SHOULD BE RESEARCHED NEXT', testNext, 'HYPOTHESIS', 'research queue, recommendations'),
    S('WHAT SHOULD NOT BE TOUCHED', doNotTouch, 'OBSERVED', 'config, vault passports, review queue'),
  ]
  return {
    kind: 'WEEKLY RESEARCH REVIEW', id: weekId(weekKey(now)), weekKey: weekKey(now), at: now, from, to, engineVersion: VERSION, sections, doNotTouch,
    counts: { experimentsFinished: finished.length, supported: by('OOS SUPPORTED').length, notSupported: by('NOT SUPPORTED').length, inconclusive: by('INCONCLUSIVE').length, insufficient: by('INSUFFICIENT DATA').length, contradicted: contradicted.length + hypsContra.length, failuresRecorded: failures.length, queueBlocked: blocked.length },
    notes: ['A week of research is a description of what was tested. It promotes nothing and changes nothing.', 'The engine reads none of this.'],
  }
}

export function weeklyResearchReview(closed: PaperPosition[], now = Date.now(), opts: { drift?: DriftInput; rebuild?: boolean } = {}): { review: WeeklyResearchReview; isNew: boolean } {
  const id = weekId(weekKey(now))
  const prior = opts.rebuild ? null : store().getJson<WeeklyResearchReview>(id)
  if (prior) return { review: prior, isNew: false }
  const review = buildWeeklyResearchReview(closed, now, opts)
  store().setJson(id, review)
  return { review, isNew: true }
}

// ---------------------------------------------------------------
// MONTHLY MODEL AUDIT
// ---------------------------------------------------------------

export type StrategyAudit = {
  strategyId: string
  name: string
  enabled: boolean
  paper: { n: number; band: string; meanR: number | null; ci95: { lo: number; hi: number } | null; maxDrawdownR: number | null }
  drift: string
  champion: string | null
  challengers: number
  experiments: { total: number; supported: number; notSupported: number }
  hypotheses: Record<string, number>
  failures: number
  wouldChange: string
}

export type MonthlyModelAudit = {
  kind: 'MONTHLY MODEL AUDIT'
  id: string
  monthKey: string
  at: number
  engineVersion: string
  strategyVersion: string
  previousStrategyVersion: string | null
  strategies: StrategyAudit[]
  knowledge: { total: number; byStatus: Record<string, number>; failed: number; requiringReview: number }
  research: { hypotheses: Record<string, number>; experiments: Record<string, number>; trials: number; queue: ReturnType<typeof queueSummary>; failures: number }
  dataQuality: { paperTrades: number; missed: number; corrupt: number; unresolvable: number; observations: number }
  boundaries: string[]
  sections: DigestSection[]
  notes: string[]
}

export function buildMonthlyModelAudit(closed: PaperPosition[], now = Date.now()): MonthlyModelAudit {
  const paper: Dataset = paperDataset(closed)
  const ids = strategyIds()
  const drift = driftAll(closed, ids, now)
  const strategies: StrategyAudit[] = ids.map((id) => {
    const meta = metaById().get(id)
    const mine = closed.filter((p) => (p.strategyId ?? 'session-ifvg') === id && p.exitReason !== 'missed')
    const st = statsOf(paperDataset(mine).records.filter((r) => !r.corrupt && !r.missed && r.rMultiple !== null))
    const dr = drift.reports.find((r) => r.strategyId === id)
    const view = championChallengerView(id, closed)
    const exps = listExperiments({ strategyId: id, status: 'DONE' })
    const hyps: Record<string, number> = {}
    for (const h of listHypotheses({ strategy: id })) hyps[h.status] = (hyps[h.status] ?? 0) + 1
    const n = st.n
    return {
      strategyId: id, name: meta?.name ?? id, enabled: config.strategies.enabled.length === 0 || config.strategies.enabled.includes(id),
      paper: { n, band: dataGrowth(n).band, meanR: n >= SAMPLE_BARS.insufficient ? st.meanR : null, ci95: n >= SAMPLE_BARS.insufficient ? st.ci95 : null, maxDrawdownR: n ? st.maxDrawdownR : null },
      drift: dr ? `${dr.overall.verdict}${dr.differences.length ? ` on ${dr.differences.map((d) => `${d.dimension}=${d.value}`).join(', ')}` : ''}` : 'no cached backtest',
      champion: view.champion ? view.champion.id : null, challengers: view.challengers.length,
      experiments: { total: exps.length, supported: exps.filter((e) => e.result === 'OOS SUPPORTED').length, notSupported: exps.filter((e) => e.result === 'NOT SUPPORTED').length },
      hypotheses: hyps, failures: listFailures({ strategyId: id }).length,
      wouldChange: n < SAMPLE_BARS.insufficient ? `${SAMPLE_BARS.insufficient - n} more paper trade(s) before a first reading.` : st.tradesNeeded ? `About ${st.tradesNeeded} trades before the interval could clear zero at this mean and spread.` : 'The interval already excludes zero at this sample; a larger sample or a regime change would move it.',
    }
  })
  const vs = vaultSummary()
  const rr = knowledgeRequiringReview()
  const expCounts: Record<string, number> = {}
  for (const e of listExperiments()) expCounts[e.status === 'DONE' ? e.result : e.status] = (expCounts[e.status === 'DONE' ? e.result : e.status] ?? 0) + 1
  const hypCounts: Record<string, number> = {}
  for (const h of listHypotheses()) hypCounts[h.status] = (hypCounts[h.status] ?? 0) + 1
  const oc = observationCounts()
  const prevKey = monthKey(now - 31 * DAY)
  const prev = store().getJson<MonthlyModelAudit>(monthId(prevKey))
  const sv = strategyVersion()
  const boundaries = [
    `Live execution gate: ${config.live.enabled ? 'ENABLED' : 'disabled'}. Shadow: ${config.shadow.enabled ? 'enabled' : 'disabled'}.`,
    `Strategy parameters: config defaults for ${ids.length} registered strategies; ${listProposals({ status: 'APPROVED' }).length} approved proposal(s) on record, none applied by this system.`,
    `Research reads the record and writes only its own stores: observations, experiments, queue, knowledge, failures, digests.`,
    `Strategy / feature version ${sv}${prev ? prev.strategyVersion === sv ? ' — unchanged since the last audit.' : ` — changed from ${prev.strategyVersion}; every data-derived knowledge item carries a version flag from the decay monitor.` : ' — first audit.'}`,
  ]
  const monthFrom = now - 31 * DAY
  const allExps = listExperiments()
  const monthExps = allExps.filter((e) => e.status === 'DONE' && (e.finishedAt ?? 0) >= monthFrom)
  const allHyps = listHypotheses()
  const wf = monthExps.filter((e) => e.walkForwardResult)
  const wfPositive = wf.filter((e) => (e.walkForwardResult!.positiveShare ?? 0) >= 0.5).length
  const overfit = allExps.filter((e) => ((e.challenge as { attacks?: Array<{ question: string; verdict: string }> } | null)?.attacks ?? []).some((a) => /overfitting/i.test(a.question) && (a.verdict === 'WEAKENED' || a.verdict === 'DISPROVED')))
  const duplicates = listQueue().filter((x) => x.duplicateOf !== null)
  const trials = trialRegistry()
  const heaviest = Object.entries(trials.byStrategy).sort((a, b) => b[1] - a[1])[0]
  const decayCounts = ['WATCH', 'REVIEW REQUIRED', 'STALE', 'CONTRADICTED'].map((s) => [s, vs.byStatus[s] ?? 0] as const)
  const activity = [
    `Hypotheses created this month: ${allHyps.filter((h) => h.created >= monthFrom).length}; rejected or not supported: ${allHyps.filter((h) => (h.status === 'REJECTED' || h.status === 'NOT SUPPORTED') && h.history.some((x) => x.at >= monthFrom && /reject|not-supported/i.test(x.event))).length}.`,
    `Experiments finished this month: ${monthExps.length} — ${['OOS SUPPORTED', 'NOT SUPPORTED', 'INCONCLUSIVE', 'INSUFFICIENT DATA'].map((r) => `${r} ${monthExps.filter((e) => e.result === r).length}`).join(', ')}.`,
    `Walk-forward: ${wf.length} experiment(s) walked forward, ${wfPositive} with at least half the folds positive. A fold count is a description of that window, not a probability.`,
    `Overfitting warnings: ${overfit.length} experiment(s) where the challenger's overfitting attack came back WEAKENED or DISPROVED.`,
    `Duplicate research: ${duplicates.length} queue item(s) parked as duplicates of an earlier question.`,
    `Multiple-testing exposure: ${trials.total} trial(s) registered${heaviest ? `, heaviest on ${heaviest[0]} (${heaviest[1]})` : ''}. The deflation bar rises with every trial, the ones discarded as much as the ones kept.`,
  ]
  const decayLines = [
    `${decayCounts.map(([s, n]) => `${s} ${n}`).join(', ')} of ${vs.total} item(s); ${vs.corrupt} unreadable row(s) skipped and kept.`,
    `Hypotheses past their review date: ${allHyps.filter((h) => h.status !== 'REJECTED' && h.nextReview <= now).length}. Experiments due for reassessment: ${allExps.filter((e) => e.status === 'DONE' && e.nextTest !== null && e.nextTest <= now).length}.`,
  ]
  const sections: DigestSection[] = [
    S('RESEARCH ACTIVITY', activity, 'OBSERVED', 'hypothesis store, experiment registry, challenger, queue, trial registry'),
    S('KNOWLEDGE DECAY', decayLines, 'OBSERVED', 'decay monitor'),
    S('STRATEGIES', strategies.map((s) => `${s.strategyId}${s.enabled ? '' : ' (disabled)'}: ${s.paper.n} paper trade(s) [${s.paper.band}]${s.paper.meanR !== null ? `, mean ${fx(s.paper.meanR)}R (${fx(s.paper.ci95?.lo)} to ${fx(s.paper.ci95?.hi)})` : ', no result stated'}; drift ${s.drift}; ${s.experiments.total} experiment(s) (${s.experiments.supported} supported, ${s.experiments.notSupported} not); ${s.failures} failure(s). ${s.wouldChange}`), 'OBSERVED', 'PAPER record, drift monitor, experiment registry, failure memory'),
    S('KNOWLEDGE', [`${vs.total} item(s): ${Object.entries(vs.byStatus).map(([k, v]) => `${k} ${v}`).join(', ')}; ${vs.failed} record what did not work; ${rr.contradicted.length + rr.reviewRequired.length + rr.stale.length} need review.`], 'OBSERVED', 'knowledge vault'),
    S('RESEARCH', [`Hypotheses: ${Object.entries(hypCounts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}. Experiments: ${Object.entries(expCounts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}. Trials registered: ${trialRegistry().total}. Queue: ${queueSummary().total}.`], 'OBSERVED', 'hypothesis store, experiment registry, trial registry, queue'),
    S('DATA QUALITY', [`${paper.provenance.trades} paper trade(s), ${paper.provenance.missed} refused, ${paper.provenance.corrupt} unreadable; ${oc.total} observation(s), ${oc.resolved} resolved, ${oc.unresolvable} unresolvable.`], 'OBSERVED', 'evidence records, observer'),
    S('BOUNDARIES', boundaries, 'OBSERVED', 'config, stores'),
  ]
  return {
    kind: 'MONTHLY MODEL AUDIT', id: monthId(monthKey(now)), monthKey: monthKey(now), at: now, engineVersion: VERSION, strategyVersion: sv, previousStrategyVersion: prev?.strategyVersion ?? null,
    strategies,
    knowledge: { total: vs.total, byStatus: vs.byStatus, failed: vs.failed, requiringReview: rr.contradicted.length + rr.reviewRequired.length + rr.stale.length },
    research: { hypotheses: hypCounts, experiments: expCounts, trials: trialRegistry().total, queue: queueSummary(), failures: failureSummary().total },
    dataQuality: { paperTrades: paper.provenance.trades, missed: paper.provenance.missed, corrupt: paper.provenance.corrupt, unresolvable: oc.unresolvable, observations: oc.total },
    boundaries, sections,
    notes: ['An audit describes the model and its record. It rates nothing "best" and promotes nothing.', 'PAPER = live market, simulated execution; BACKTEST = simulated. Never pooled.', 'The engine reads none of this.'],
  }
}

export function monthlyModelAudit(closed: PaperPosition[], now = Date.now(), opts: { rebuild?: boolean } = {}): { audit: MonthlyModelAudit; isNew: boolean } {
  const id = monthId(monthKey(now))
  const prior = opts.rebuild ? null : store().getJson<MonthlyModelAudit>(id)
  if (prior) return { audit: prior, isNew: false }
  const audit = buildMonthlyModelAudit(closed, now)
  store().setJson(id, audit)
  return { audit, isNew: true }
}

/** Stored digests of one kind, newest first. */
export function listDigests(kind: 'daily' | 'weekly' | 'monthly', limit = 30): Array<{ id: string; key: string; at: number }> {
  const prefix = `digest:${kind}:`
  return store().keysWithPrefix(prefix).map((k) => { const d = store().getJson<{ at: number }>(k); return { id: k, key: k.slice(prefix.length), at: d?.at ?? 0 } }).sort((a, b) => b.at - a.at).slice(0, limit)
}

export function getDigest<T = DailyDigest | WeeklyResearchReview | MonthlyModelAudit>(id: string): T | null { return store().getJson<T>(id) }

/** A knowledge-item view of the lesson of the day, for the vault's TEACHING memory. Not written here; the ops loop decides. */
export function lessonItem(l: LessonOfTheDay, dayKey: string): Omit<KnowledgeItem, 'id' | 'created_at' | 'last_reviewed' | 'review_due' | 'new_evidence_count' | 'contradictory_evidence_count' | 'status' | 'version' | 'history'> & { id: string; now: number } {
  return {
    id: `lesson:of-the-day:${dayKey}`, kind: 'lesson', title: `Lesson of the day ${dayKey}: ${l.title}`,
    body: `BEFORE: ${l.before}\nDECISION: ${l.decision}\nAFTER: ${l.after}\nTEACHES: ${l.teaches}\nDOES NOT TEACH: ${l.doesNotTeach.join(' ')}`,
    tags: [l.conceptId, l.kind, 'lesson-of-the-day', 'memory:teaching'], evidenceLabel: l.evidenceLabel,
    provenance: { source: l.source, engineVersion: VERSION, recordIds: [l.caseId], sampleSize: 1, method: 'most significant resolved case of the day' },
    links: [l.caseId], payload: l, now: l.at,
  }
}
