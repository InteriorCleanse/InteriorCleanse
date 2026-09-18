/**
 * RESEARCH OPS — the one scheduler for the whole learning layer.
 *
 * Two entry points, nothing else:
 *
 *   `watch:cycle` (from the bus, after every engine cycle)
 *       → observe the cycle, resolve due candidates. Bounded, synchronous,
 *         wrapped so nothing it does can reach the engine.
 *
 *   one timer (every RESEARCH_TICK_MS)
 *       → harvest failures · drift monitor · regenerate the queue · decay
 *         monitor · run AT MOST ONE testable experiment with its challenger ·
 *         write the daily digest / weekly review / monthly audit when the
 *         period has rolled · persist the ops state.
 *
 * Every step is idempotent: observation, experiment, queue, digest and
 * failure ids are content-addressed, so a tick that runs twice after a
 * restart writes nothing twice. The ops state (`research:ops` in the kv
 * store) records the last and next run and the last period keys written, so
 * a restart resumes where it stopped: an experiment left RUNNING is picked
 * up and finished, a digest already written is not written again, a period
 * that rolled while the process was down is written on the first tick.
 *
 * What this never does: change a parameter, a strategy, a gate, a position.
 * It reads the record and writes the research stores. The engine would run
 * identically if this file did not exist — the boundary test pins it.
 */

import { config } from '../../config.ts'
import { cachedBacktest } from '../analyst/evidence.ts'
import { backtestDataset, paperDataset } from '../analyst/records.ts'
import type { Dataset } from '../analyst/records.ts'
import { bus } from '../data/bus.ts'
import type { WatchCycle } from '../data/bus.ts'
import { runDecayMonitor } from '../knowledge/decayMonitor.ts'
import type { DecayReport } from '../knowledge/decayMonitor.ts'
import { harvestFailures } from '../knowledge/failures.ts'
import { addItem } from '../knowledge/vault.ts'
import { observeCycle, resolveCandidates } from '../observer/observer.ts'
import type { CycleResult, ResolveResult } from '../observer/observer.ts'
import { readPositions } from '../paperTrader.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { challenge } from '../research/challenger.ts'
import { getExperiment, listExperiments, registerExperiment, runExperiment } from '../research/experiments.ts'
import type { Experiment, ExperimentSpec } from '../research/experiments.ts'
import { createHypothesis, getHypothesis, listHypotheses } from '../research/hypotheses.ts'
import { generateQueue, linkHypothesis, nextTestable, setQueueStatus } from '../research/queue.ts'
import type { QueueItem } from '../research/queue.ts'
import { tradingDayKey } from '../sessions.ts'
import { strategyIds } from '../strategies/registry.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'
import { dailyDigest, lessonItem, monthKey, monthlyModelAudit, weekKey, weeklyResearchReview } from './digest.ts'
import { driftAll } from './drift.ts'
import type { DriftInput } from '../research/recommend.ts'

export const RESEARCH_TICK_MS = 15 * 60_000
export const MAX_EXPERIMENTS_PER_TICK = 1
export const MAX_RESOLVE_PER_CYCLE = 5
const KEY = 'research:ops'
const DAY = 86_400_000

export type OpsStep = { name: string; ok: boolean; ms: number; detail: string }

export type OpsReport = {
  at: number
  steps: OpsStep[]
  experiment: { id: string; result: string; queueItemId: string } | null
  digests: string[]
  nextRun: number
  note: string
}

export type OpsState = {
  version: 1
  engineVersion: string
  startedAt: number | null
  lastCycleAt: number | null
  cycles: number
  runs: number
  lastRun: number | null
  nextRun: number | null
  running: boolean
  lastDigestDay: string | null
  lastWeekly: string | null
  lastMonthly: string | null
  lastExperimentId: string | null
  lastError: { at: number; message: string } | null
  lastReport: OpsReport | null
  lastCycle: { at: number; recorded: number; duplicates: number; resolved: number; pending: number } | null
}

const FRESH: OpsState = { version: 1, engineVersion: VERSION, startedAt: null, lastCycleAt: null, cycles: 0, runs: 0, lastRun: null, nextRun: null, running: false, lastDigestDay: null, lastWeekly: null, lastMonthly: null, lastExperimentId: null, lastError: null, lastReport: null, lastCycle: null }

export function readOps(): OpsState { return { ...FRESH, ...(store().getJson<Partial<OpsState>>(KEY) ?? {}) } }
function writeOps(s: OpsState): OpsState { store().setJson(KEY, s); return s }
export function resetOps(): void { writeOps({ ...FRESH }) }

/** The instant the current trading day began (New York day-start hour), found by bisection on the day key. */
export function tradingDayStart(now: number): number {
  const key = tradingDayKey(now)
  let lo = now - DAY, hi = now
  if (tradingDayKey(lo) === key) return lo
  for (let i = 0; i < 40 && hi - lo > 1; i++) { const mid = Math.floor((lo + hi) / 2); if (tradingDayKey(mid) === key) hi = mid; else lo = mid }
  return hi
}

// ---------------------------------------------------------------
// The cycle hook
// ---------------------------------------------------------------

/** After an engine cycle: observe it, resolve what is due. Never throws. */
export function onWatchCycle(c: WatchCycle): { cycle: CycleResult | null; resolve: ResolveResult | null; error: string | null } {
  let cycle: CycleResult | null = null
  let resolve: ResolveResult | null = null
  let error: string | null = null
  try {
    cycle = observeCycle(c.snap, c.at)
    resolve = resolveCandidates(c.at, { max: MAX_RESOLVE_PER_CYCLE })
  } catch (err) { error = String((err as Error)?.message ?? err) }
  const s = readOps()
  writeOps({ ...s, lastCycleAt: c.at, cycles: s.cycles + 1, lastCycle: { at: c.at, recorded: cycle?.recorded.length ?? 0, duplicates: cycle?.duplicates ?? 0, resolved: resolve?.resolved.length ?? 0, pending: resolve?.pending ?? 0 }, lastError: error ? { at: c.at, message: error } : s.lastError })
  return { cycle, resolve, error }
}

// ---------------------------------------------------------------
// The research tick
// ---------------------------------------------------------------

export type TickDeps = {
  closed?: () => PaperPosition[]
  currentRegime?: () => string | null
  now?: number
  /** Injected for tests; the default runs the real challenger. */
  challenge?: (e: Experiment, oos: import('../analyst/records.ts').EvidenceRecord[], fromObservation: boolean) => unknown
}

/** The strategy an experiment belongs to: the item's own, else the one strategy the dataset holds, else the fused record. */
function strategyOf(q: QueueItem, dataset: Dataset): string {
  if (q.dataset.strategyId) return q.dataset.strategyId
  const ids = new Set(dataset.records.filter((r) => !r.corrupt && !r.missed).map((r) => r.strategyId))
  return ids.size === 1 ? [...ids][0] : 'fused'
}

function specFor(q: QueueItem, hypothesisId: string, strategyId: string): ExperimentSpec {
  return { hypothesisId, kind: 'cohort', strategyId, source: q.dataset.source, filters: q.dataset.filters, direction: q.direction, method: `cohort experiment from queue item ${q.id}: ${q.question}`, note: q.note }
}

/** Make sure the queue item has a hypothesis on record, drafting one from the question when it has none. */
function ensureHypothesis(q: QueueItem, now: number, strategyId: string): string {
  if (q.hypothesisId && getHypothesis(q.hypothesisId)) return q.hypothesisId
  const filters = q.dataset.filters.map((f) => `${f.dimension} in {${f.values.join(', ')}}`).join(' and ') || 'the whole record'
  const h = createHypothesis({
    question: q.question,
    observation: q.note || `Queued from ${q.origin}.`,
    hypothesis: q.hypothesis ?? (q.direction === 'difference' ? `The cohort (${filters}) has a mean R different from the rest of the ${q.dataset.source} record.` : `The cohort (${filters}) has a mean R ${q.direction === 'positive' ? 'above' : 'below'} the rest of the ${q.dataset.source} record.`),
    nullHypothesis: `The cohort's mean R is not distinguishable from the rest of the ${q.dataset.source} record at this sample.`,
    direction: q.direction, dataset: { source: q.dataset.source, label: q.dataset.source === 'PAPER' ? 'PAPER — live market, simulated execution' : 'BACKTEST — simulated' },
    cohortFilters: q.dataset.filters, method: 'cohort mean with 95% t-interval; Welch comparison against the complement; chronological 60/40 in-sample / out-of-sample', strategy: strategyId === 'fused' ? null : strategyId, now,
  })
  linkHypothesis(q.id, h.id, now)
  return h.id
}

/** Run one testable cohort experiment, with its challenger. Parameter experiments are never started here — they are a sandbox request a person makes. */
async function runOneExperiment(paper: Dataset, backtest: (id: string) => Dataset | null, now: number, deps: TickDeps): Promise<OpsReport['experiment']> {
  // First: an experiment left RUNNING by a crash is finished before anything new starts.
  const stranded = listExperiments({ status: 'RUNNING' }).filter((e) => e.kind !== 'parameter')[0]
  const pick = stranded ? null : nextTestable(now)
  if (!stranded && !pick) return null
  const q = pick
  const dataset = q ? (q.dataset.source === 'BACKTEST' ? backtest(q.dataset.strategyId ?? '') : paper) : (stranded!.source === 'BACKTEST' ? backtest(stranded!.strategyId) : paper)
  if (!dataset) { if (q) setQueueStatus(q.id, 'BLOCKED', 'No cached backtest for this strategy; POST /api/evidence/backtest computes one.', now); return null }
  let id: string
  let queueItemId: string
  if (stranded) { id = stranded.experimentId; queueItemId = stranded.method.match(/queue item (\S+):/)?.[1] ?? '' }
  else {
    const sid = strategyOf(q!, dataset)
    const hid = ensureHypothesis(q!, now, sid)
    const reg = registerExperiment(specFor(q!, hid, sid), dataset, now)
    id = reg.experiment.experimentId
    queueItemId = q!.id
    if (reg.experiment.status === 'DONE') { setQueueStatus(q!.id, 'TESTED', `Experiment ${id} already on record (${reg.experiment.result}).`, now); return { id, result: reg.experiment.result, queueItemId } }
    setQueueStatus(q!.id, 'UNDER TEST', `Experiment ${id} registered.`, now)
  }
  const usable = dataset.records.filter((r) => !r.corrupt && !r.missed && r.rMultiple !== null)
  const fromObservation = q?.origin === 'observation'
  const e = await runExperiment(id, {
    dataset, now,
    challenge: (x) => { const oos = usable.filter((r) => x.oosResult?.recordIds.includes(r.id)); return deps.challenge ? deps.challenge(x, oos, fromObservation) : challenge(x, { oosTreatment: oos, hypothesesOnRecord: listHypotheses().length, draftedFromObservation: fromObservation, now }) },
  })
  if (queueItemId) setQueueStatus(queueItemId, e.status === 'DONE' ? 'TESTED' : 'QUEUED', `Experiment ${id} ${e.status}: ${e.result}.`, now)
  return { id, result: e.result, queueItemId }
}

/** One bounded research tick. Safe to call from a timer, a route, or a test; a second call while one runs returns the running note. */
export async function researchTick(deps: TickDeps = {}): Promise<OpsReport> {
  const now = deps.now ?? Date.now()
  const s0 = readOps()
  if (s0.running && s0.lastRun !== null && now - s0.lastRun < RESEARCH_TICK_MS * 4) {
    return { at: now, steps: [], experiment: null, digests: [], nextRun: s0.nextRun ?? now + RESEARCH_TICK_MS, note: 'A research tick is already running; this one was skipped.' }
  }
  writeOps({ ...s0, running: true, startedAt: s0.startedAt ?? now })
  const steps: OpsStep[] = []
  const digests: string[] = []
  const out: { experiment: OpsReport['experiment']; error: OpsState['lastError'] } = { experiment: null, error: null }
  const step = async (name: string, fn: () => Promise<string> | string) => {
    const t = Date.now()
    try { const detail = await fn(); steps.push({ name, ok: true, ms: Date.now() - t, detail }) } catch (err) { const message = String((err as Error)?.message ?? err); steps.push({ name, ok: false, ms: Date.now() - t, detail: message }); out.error = { at: now, message: `${name}: ${message}` } }
  }
  const closed = (deps.closed ?? (() => readPositions().closed))()
  const paper = paperDataset(closed)
  const backtestCache = new Map<string, Dataset | null>()
  const backtest = (id: string): Dataset | null => { if (!backtestCache.has(id)) backtestCache.set(id, cachedBacktestDataset(id)); return backtestCache.get(id) ?? null }
  let drift: DriftInput = []
  let driftSignals: ReturnType<typeof driftAll>['signals'] = []

  await step('harvest failures', () => { const h = harvestFailures(now); return h.note })
  await step('drift monitor', () => { const d = driftAll(closed, strategyIds(), now); drift = d.forRecommend; driftSignals = d.signals; return `${d.reports.length} strateg${d.reports.length === 1 ? 'y' : 'ies'} compared, ${d.skipped.length} without a cached backtest, ${d.signals.length} difference(s) signalled.` })
  await step('research queue', () => { const g = generateQueue({ paper, signals: driftSignals, now }); return `${g.created} created, ${g.updated} updated, ${g.items.length} item(s).` })
  await step('decay monitor', () => { const r: DecayReport = runDecayMonitor({ now, paper, currentRegime: deps.currentRegime?.() ?? null, drift }); return r.note })
  await step('experiment', async () => { out.experiment = await runOneExperiment(paper, backtest, now, deps); return out.experiment ? `${out.experiment.id}: ${out.experiment.result}` : 'nothing testable this tick' })
  // Period rolls. The first tick after a roll writes the period that ended; the first tick ever only marks the period.
  const s1 = readOps()
  const dayKey = tradingDayKey(now), wk = weekKey(now), mk = monthKey(now)
  let lastDigestDay = s1.lastDigestDay, lastWeekly = s1.lastWeekly, lastMonthly = s1.lastMonthly
  await step('daily digest', () => {
    if (lastDigestDay === null) { lastDigestDay = dayKey; return `First tick; day ${dayKey} marked, no digest written yet.` }
    if (lastDigestDay === dayKey) return `Day ${dayKey} not over.`
    const endOfPrev = tradingDayStart(now) - 1
    const d = dailyDigest(closed, endOfPrev, { drift })
    digests.push(d.digest.id)
    if (d.digest.lessonOfTheDay) { const li = lessonItem(d.digest.lessonOfTheDay, d.digest.dayKey); addItem({ kind: li.kind, id: li.id, title: li.title, body: li.body, evidenceLabel: li.evidenceLabel, provenance: li.provenance, tags: li.tags, links: li.links, payload: li.payload, now: li.now }) }
    lastDigestDay = dayKey
    return `${d.digest.id} ${d.isNew ? 'written' : 'already on record'}${d.digest.lessonOfTheDay ? `; lesson of the day: ${d.digest.lessonOfTheDay.title}` : ''}.`
  })
  await step('weekly review', () => {
    if (lastWeekly === null) { lastWeekly = wk; return `First tick; week ${wk} marked.` }
    if (lastWeekly === wk) return `Week ${wk} in progress.`
    const w = weeklyResearchReview(closed, now, { drift })
    digests.push(w.review.id)
    lastWeekly = wk
    return `${w.review.id} ${w.isNew ? 'written' : 'already on record'} — covers the seven days before it.`
  })
  await step('monthly audit', () => {
    if (lastMonthly === null) { lastMonthly = mk; return `First tick; month ${mk} marked.` }
    if (lastMonthly === mk) return `Month ${mk} in progress.`
    const m = monthlyModelAudit(closed, now)
    digests.push(m.audit.id)
    lastMonthly = mk
    return `${m.audit.id} ${m.isNew ? 'written' : 'already on record'}.`
  })
  const nextRun = now + RESEARCH_TICK_MS
  const { experiment, error } = out
  const report: OpsReport = { at: now, steps, experiment, digests, nextRun, note: `${steps.filter((x) => x.ok).length}/${steps.length} step(s) ran; ${experiment ? 'one experiment' : 'no experiment'}; ${digests.length} digest(s) written. Nothing in production changed.` }
  writeOps({ ...readOps(), running: false, runs: s1.runs + 1, lastRun: now, nextRun, lastDigestDay, lastWeekly, lastMonthly, lastExperimentId: experiment?.id ?? s1.lastExperimentId, lastError: error ?? s1.lastError, lastReport: report })
  return report
}

/** The backtest dataset for one strategy, from the cache only. It never runs a backtest. */
function cachedBacktestDataset(strategyId: string): Dataset | null {
  const bt = cachedBacktest(strategyId)
  if (!bt) return null
  return backtestDataset(bt.trades ?? [], { symbol: config.symbol, interval: config.interval })
}

// ---------------------------------------------------------------
// The scheduler
// ---------------------------------------------------------------

export type ResearchOps = { stop: () => void; state: () => OpsState; runNow: () => Promise<OpsReport>; isRunning: () => boolean }

/**
 * Subscribe to the bus and start the one timer. Resumes from the persisted
 * state: if a run is due (never run, or nextRun has passed) the first tick
 * comes after a short settle; otherwise it waits for nextRun.
 */
export function startResearchOps(opts: { tickMs?: number; settleMs?: number; deps?: TickDeps; log?: (line: string) => void } = {}): ResearchOps {
  const tickMs = opts.tickMs ?? RESEARCH_TICK_MS
  const settle = opts.settleMs ?? 20_000
  const log = opts.log ?? (() => {})
  let inflight: Promise<OpsReport> | null = null
  const s = readOps()
  writeOps({ ...s, running: false, startedAt: s.startedAt ?? Date.now() })
  const off = bus.on('watch:cycle', (c) => { const r = onWatchCycle(c); if (r.error) log(`observer: ${r.error}`); else if (r.cycle?.recorded.length || r.resolve?.resolved.length) log(`observer: ${r.cycle?.recorded.length ?? 0} event(s), ${r.resolve?.resolved.length ?? 0} case(s) resolved`) })
  const run = (): Promise<OpsReport> => {
    if (inflight) return inflight
    inflight = researchTick(opts.deps).then((r) => { log(`research: ${r.note}`); return r }).catch((err) => { const message = String((err as Error)?.message ?? err); writeOps({ ...readOps(), running: false, lastError: { at: Date.now(), message } }); log(`research failed: ${message}`); return { at: Date.now(), steps: [], experiment: null, digests: [], nextRun: Date.now() + tickMs, note: message } }).finally(() => { inflight = null })
    return inflight
  }
  const due = s.nextRun === null || s.nextRun <= Date.now()
  const firstIn = due ? settle : Math.max(settle, s.nextRun! - Date.now())
  const first = setTimeout(() => void run(), firstIn)
  const timer = setInterval(() => void run(), tickMs)
  log(`research ops: first tick in ${Math.round(firstIn / 1000)}s (${due ? 'a run is due' : `resuming; next run was ${new Date(s.nextRun!).toISOString()}`}), then every ${Math.round(tickMs / 60_000)} min.`)
  return { stop: () => { clearTimeout(first); clearInterval(timer); off() }, state: readOps, runNow: run, isRunning: () => inflight !== null }
}
