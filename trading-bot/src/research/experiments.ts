/**
 * THE EXPERIMENT REGISTRY AND RUNNER.
 *
 * An experiment is a frozen, reproducible test of one hypothesis against one
 * baseline. Freezing comes first: the dataset definition (a hash over the
 * record ids and the window), the strategy version, the parameter snapshot,
 * the in-sample and out-of-sample periods, the method and the baseline are
 * written into the registry BEFORE anything is computed, and the experiment's
 * id is derived from all of them — so the same test cannot be registered
 * twice, and a result cannot be produced by quietly changing the question
 * until it comes out right. A different parameter set is a different
 * experiment, and every one counts as a trial in the overfitting registry.
 *
 * Three kinds:
 *
 *   cohort    — a hypothesis about a cohort of the record (PAPER or BACKTEST):
 *               treatment = records matching the filters; baseline = the
 *               complement. In-sample = before the split; OOS = after.
 *   filter    — the sandbox: would restricting the strategy to a session,
 *               regime, volatility or quality cohort have changed its result?
 *               Same arithmetic, framed as filter vs the trades it would have
 *               excluded. The production strategy is not touched.
 *   parameter — the sandbox: a parameter variant of a strategy, backtested
 *               with the existing runner against the defaults. Expensive, so
 *               only ever on an explicit request, never on a timer.
 *
 * Every run: stage results, baseline comparison (Welch), walk-forward and
 * Monte Carlo robustness, the multiple-testing context, the challenger's
 * attacks, counterevidence, the hypothesis update, and a reassessment date.
 */

import { config } from '../../config.ts'
import { sampleSd, tCritical95 } from '../analyst/attribution.ts'
import { SAMPLE_BARS, matches, sampleStatus, statsOf } from '../analyst/cohorts.ts'
import type { CohortFilter } from '../analyst/cohorts.ts'
import { fromReplayTrade } from '../analyst/records.ts'
import type { Dataset, EvidenceRecord } from '../analyst/records.ts'
import { monteCarlo } from '../backtest/monteCarlo.ts'
import { runBacktestDetailed } from '../backtest/runner.ts'
import { walkForward } from '../backtest/walkForward.ts'
import type { TradeLike } from '../backtest/metrics.ts'
import { FEATURE_VERSION } from '../features/types.ts'
import { multipleTesting } from '../factory/ic.ts'
import { metaById } from '../strategies/registry.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'
import { getHypothesis, recordRobustness, recordStage, saveHypothesis, addCounterevidence } from './hypotheses.ts'
import type { HypothesisDirection, StageResult } from './hypotheses.ts'
import { recordTrials, trialsFor } from './overfitting.ts'

export type ExperimentKind = 'cohort' | 'filter' | 'parameter'
export type BaselineKind = 'complement' | 'excluded-trades' | 'defaults' | 'prior-version'
export type ExperimentStatus = 'REGISTERED' | 'RUNNING' | 'DONE' | 'FAILED'
export type ExperimentResult = 'INSUFFICIENT DATA' | 'NOT SUPPORTED' | 'OBSERVED IN SAMPLE' | 'OOS SUPPORTED' | 'INCONCLUSIVE' | 'NOT RUN'

export type ExperimentSpec = {
  hypothesisId: string | null
  kind: ExperimentKind
  strategyId: string
  source: 'PAPER' | 'BACKTEST'
  filters: CohortFilter[]
  params?: Record<string, number> | null
  direction: HypothesisDirection
  /** Records decided before this instant are in-sample; at or after are out-of-sample. Null = chronological 60/40. */
  splitAt?: number | null
  method?: string
  note?: string
}

export type Interval = { lo: number; hi: number }

export type SideResult = { trades: number; sampleStatus: StageResult['sampleStatus']; meanR: number | null; ci95: Interval | null; totalR: number; winRate: number | null; maxDrawdownR: number; recordIds: string[] }

export type WelchComparison = { deltaR: number | null; ci95: Interval | null; verdict: 'TOO FEW' | 'INDISTINGUISHABLE' | 'TREATMENT AHEAD' | 'BASELINE AHEAD'; note: string }

export type Experiment = {
  experimentId: string
  hypothesisId: string | null
  kind: ExperimentKind
  strategyId: string
  source: 'PAPER' | 'BACKTEST'
  dataType: 'LIVE MARKET / SIMULATED EXECUTION' | 'SIMULATED'
  datasetHash: string
  datasetLabel: string
  strategyVersion: string
  parameterSnapshot: Record<string, number>
  dateRange: { from: number; to: number } | null
  splitAt: number | null
  markets: string[]
  timeframes: string[]
  features: string[]
  direction: HypothesisDirection
  method: string
  baseline: { kind: BaselineKind; label: string }
  inSampleResult: SideResult | null
  oosResult: SideResult | null
  baselineInSample: SideResult | null
  baselineOos: SideResult | null
  comparison: { inSample: WelchComparison | null; oos: WelchComparison | null }
  walkForwardResult: { folds: number; positiveFolds: number; positiveShare: number | null; combinedOosAvgR: number | null; trades: number } | null
  monteCarloResult: { samples: number; totalRp5: number; totalRp95: number; maxDrawdownP95: number; profitableShare: number } | null
  robustnessResult: { verdict: 'ROBUST' | 'FRAGILE' | 'UNTESTED'; notes: string[] } | null
  multipleTestingContext: { trials: number; sidak: number; bonferroni: number; note: string }
  selectionNotes: string[]
  limitations: string[]
  counterevidence: string[]
  result: ExperimentResult
  challenge: unknown | null
  status: ExperimentStatus
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  nextTest: number | null
  error: string | null
  engineVersion: string
}

export const REASSESS_MS = 30 * 86_400_000
const PREFIX = 'experiment:'

const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

function hash(s: string): string {
  let h = 2166136261
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(36)
}

/** The dataset definition, frozen: sorted record ids plus the window. Same records, same hash. */
export function datasetHash(d: Dataset): string {
  const ids = d.records.map((r) => r.id).sort()
  const from = d.provenance.period?.from ?? 0, to = d.provenance.period?.to ?? 0
  return `${d.provenance.source.toLowerCase()}-${ids.length}-${hash(ids.join(',') + `|${from}|${to}`)}`
}

function parameterSnapshot(strategyId: string, params?: Record<string, number> | null): Record<string, number> {
  const meta = metaById().get(strategyId)
  const out: Record<string, number> = {}
  for (const p of meta?.parameters ?? []) out[p.name] = p.default
  for (const [k, v] of Object.entries(params ?? {})) out[k] = v
  return out
}

export function experimentId(spec: ExperimentSpec, dsHash: string): string {
  // The hypothesis is part of the identity: the same arithmetic run for two hypotheses is two experiments, each updating its own record.
  const key = [spec.hypothesisId ?? '', spec.kind, spec.strategyId, spec.source, JSON.stringify(spec.filters), JSON.stringify(spec.params ?? null), spec.splitAt ?? 'auto', dsHash, spec.method ?? '', spec.direction].join('|')
  return `exp-${spec.kind}-${hash(key)}`
}

// ---------------------------------------------------------------
// Registry
// ---------------------------------------------------------------

export function getExperiment(id: string): Experiment | null { return store().getJson<Experiment>(PREFIX + id) }
export function saveExperiment(e: Experiment): Experiment { store().setJson(PREFIX + e.experimentId, e); return e }
export function listExperiments(filter: { hypothesisId?: string; strategyId?: string; status?: ExperimentStatus; result?: ExperimentResult } = {}): Experiment[] {
  const out: Experiment[] = []
  for (const key of store().keysWithPrefix(PREFIX)) {
    const e = store().getJson<Experiment>(key)
    if (!e) continue
    if (filter.hypothesisId && e.hypothesisId !== filter.hypothesisId) continue
    if (filter.strategyId && e.strategyId !== filter.strategyId) continue
    if (filter.status && e.status !== filter.status) continue
    if (filter.result && e.result !== filter.result) continue
    out.push(e)
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Freeze the experiment. Returns the existing record when the same experiment
 * was registered before — a duplicate is never a second row.
 */
export function registerExperiment(spec: ExperimentSpec, dataset: Dataset, now = Date.now()): { experiment: Experiment; isNew: boolean } {
  const dsHash = datasetHash(dataset)
  const id = experimentId(spec, dsHash)
  const prior = getExperiment(id)
  if (prior) return { experiment: prior, isNew: false }
  const usable = dataset.records.filter((r) => !r.corrupt && !r.missed && r.rMultiple !== null)
  const times = usable.map((r) => r.decidedAt).sort((a, b) => a - b)
  const splitAt = spec.splitAt ?? (times.length ? times[Math.floor(times.length * 0.6)] : null)
  const baseline: Experiment['baseline'] = spec.kind === 'parameter' ? { kind: 'defaults', label: `${spec.strategyId} at its default parameters, same window, same fill model` } : spec.kind === 'filter' ? { kind: 'excluded-trades', label: 'the trades the filter would have excluded (unfiltered population reported beside)' } : { kind: 'complement', label: 'records outside the cohort, same source and window' }
  const e: Experiment = {
    experimentId: id, hypothesisId: spec.hypothesisId, kind: spec.kind, strategyId: spec.strategyId, source: spec.source,
    dataType: spec.source === 'PAPER' ? 'LIVE MARKET / SIMULATED EXECUTION' : 'SIMULATED',
    datasetHash: dsHash, datasetLabel: `SOURCE: ${spec.source} · RECORDS: ${usable.length} · ${dataset.provenance.dataType}`,
    strategyVersion: `${VERSION}/f${FEATURE_VERSION}`, parameterSnapshot: parameterSnapshot(spec.strategyId, spec.params),
    dateRange: times.length ? { from: times[0], to: times[times.length - 1] } : null, splitAt,
    markets: [config.symbol], timeframes: [config.interval],
    features: spec.filters.map((f) => `${f.dimension}=${f.values.join('|')}`), direction: spec.direction,
    method: spec.method ?? (spec.kind === 'parameter' ? 'variant backtest vs default backtest; Welch interval on per-trade R; walk-forward and Monte Carlo from the same trades' : 'treatment vs baseline cohort, Welch 95% interval on the mean R; in-sample before the split, out-of-sample after; walk-forward and Monte Carlo on the treatment'),
    baseline, inSampleResult: null, oosResult: null, baselineInSample: null, baselineOos: null, comparison: { inSample: null, oos: null },
    walkForwardResult: null, monteCarloResult: null, robustnessResult: null,
    multipleTestingContext: { trials: 0, sidak: 0, bonferroni: 0, note: 'not run' },
    selectionNotes: [spec.note ?? 'Registered before any computation; the dataset, split, parameters and method are frozen in this record.'],
    limitations: [], counterevidence: [], result: 'NOT RUN', challenge: null, status: 'REGISTERED',
    createdAt: now, startedAt: null, finishedAt: null, nextTest: null, error: null, engineVersion: VERSION,
  }
  return { experiment: saveExperiment(e), isNew: true }
}

// ---------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------

function side(records: EvidenceRecord[]): SideResult {
  const s = statsOf(records)
  return { trades: s.n, sampleStatus: s.status, meanR: s.meanR, ci95: s.ci95, totalR: records.reduce((a, r) => a + (r.rMultiple ?? 0), 0), winRate: s.winRate, maxDrawdownR: s.maxDrawdownR, recordIds: records.map((r) => r.id) }
}

/** Welch's interval for the difference of two means — the baseline comparison. */
export function welch(treatment: number[], baseline: number[], minTrades = SAMPLE_BARS.insufficient): WelchComparison {
  if (treatment.length < minTrades || baseline.length < minTrades) return { deltaR: null, ci95: null, verdict: 'TOO FEW', note: `treatment ${treatment.length}, baseline ${baseline.length}; ${minTrades} each is the minimum before a comparison means anything.` }
  const sa = sampleSd(treatment), sb = sampleSd(baseline)
  if (sa === null || sb === null) return { deltaR: null, ci95: null, verdict: 'TOO FEW', note: 'Not enough variation to compare.' }
  const ma = treatment.reduce((a, b) => a + b, 0) / treatment.length, mb = baseline.reduce((a, b) => a + b, 0) / baseline.length
  const va = sa ** 2 / treatment.length, vb = sb ** 2 / baseline.length
  const se = Math.sqrt(va + vb)
  const df = se > 0 ? (va + vb) ** 2 / ((va ** 2) / (treatment.length - 1) + (vb ** 2) / (baseline.length - 1)) : 1
  const delta = ma - mb
  const t = tCritical95(df)
  const ci95 = { lo: delta - t * se, hi: delta + t * se }
  if (ci95.lo > 0) return { deltaR: delta, ci95, verdict: 'TREATMENT AHEAD', note: `treatment ahead of baseline by ${fx(delta)}R per trade; the gap survives the uncertainty in both (95% ${fx(ci95.lo)} to ${fx(ci95.hi)}).` }
  if (ci95.hi < 0) return { deltaR: delta, ci95, verdict: 'BASELINE AHEAD', note: `baseline ahead of treatment by ${fx(-delta)}R per trade (95% ${fx(ci95.lo)} to ${fx(ci95.hi)}).` }
  return { deltaR: delta, ci95, verdict: 'INDISTINGUISHABLE', note: `the gap is ${fx(delta)}R but its plausible range (${fx(ci95.lo)} to ${fx(ci95.hi)}) includes zero — inside the noise.` }
}

function supports(direction: HypothesisDirection, c: WelchComparison | null): 'supports' | 'contradicts' | 'insufficient' {
  if (!c || c.verdict === 'TOO FEW') return 'insufficient'
  if (c.verdict === 'INDISTINGUISHABLE') return 'insufficient'
  if (direction === 'difference') return 'supports'
  const ahead = c.verdict === 'TREATMENT AHEAD'
  return (direction === 'positive') === ahead ? 'supports' : 'contradicts'
}

function toTradeLike(rs: EvidenceRecord[]): TradeLike[] {
  return rs.map((r) => ({ time: r.decidedAt, rMultiple: r.rMultiple, pnlUsd: 0, outcome: (r.rMultiple ?? 0) > 0 ? 'WIN' : (r.rMultiple ?? 0) < 0 ? 'LOSS' : 'FLAT' }))
}

function robustness(treatment: EvidenceRecord[]): { wf: Experiment['walkForwardResult']; mc: Experiment['monteCarloResult']; verdict: NonNullable<Experiment['robustnessResult']> } {
  const rs = treatment.map((r) => r.rMultiple as number)
  const times = treatment.map((r) => r.decidedAt)
  const notes: string[] = []
  let wf: Experiment['walkForwardResult'] = null
  if (treatment.length >= SAMPLE_BARS.insufficient && times.length) {
    const from = Math.min(...times), to = Math.max(...times) + 1
    const w = walkForward(toTradeLike(treatment), from, to, config.backtest.walkForward.trainDays, config.backtest.walkForward.testDays)
    const scored = w.folds.filter((f) => f.testMetrics.trades > 0)
    const positive = scored.filter((f) => (f.testMetrics.avgR ?? 0) > 0).length
    wf = { folds: w.folds.length, positiveFolds: positive, positiveShare: scored.length ? positive / scored.length : null, combinedOosAvgR: w.combinedOos.avgR, trades: w.combinedOos.trades }
    if (!scored.length) notes.push('Walk-forward: no fold had a test trade; the window is too short for the configured folds.')
    else if (wf.positiveShare !== null && wf.positiveShare < config.factory.stabilityMinShare) notes.push(`Walk-forward: only ${positive} of ${scored.length} test folds positive (bar ${Math.round(config.factory.stabilityMinShare * 100)}%).`)
    else notes.push(`Walk-forward: ${positive} of ${scored.length} test folds positive.`)
  } else notes.push(`Walk-forward not run: ${treatment.length} treatment trades is under the ${SAMPLE_BARS.insufficient}-trade bar.`)
  let mc: Experiment['monteCarloResult'] = null
  if (rs.length >= SAMPLE_BARS.insufficient) {
    const m = monteCarlo(rs, config.backtest.monteCarloSamples)
    mc = { samples: m.samples, totalRp5: m.totalR.p5, totalRp95: m.totalR.p95, maxDrawdownP95: m.maxDrawdownR.p95, profitableShare: m.profitableShare }
    notes.push(`Monte Carlo: total R 5th–95th ${fx(m.totalR.p5)} to ${fx(m.totalR.p95)}; ${Math.round(m.profitableShare * 100)}% of shuffles profitable; drawdown p95 ${m.maxDrawdownR.p95.toFixed(2)}R.`)
  }
  const fragile = (wf && wf.positiveShare !== null && wf.positiveShare < config.factory.stabilityMinShare) || (mc !== null && mc.profitableShare < 0.5)
  const untested = !wf || wf.positiveShare === null || !mc
  return { wf, mc, verdict: { verdict: untested ? 'UNTESTED' : fragile ? 'FRAGILE' : 'ROBUST', notes } }
}

// ---------------------------------------------------------------
// The runner
// ---------------------------------------------------------------

export type RunDeps = {
  /** The dataset the experiment was registered on; the runner re-checks its hash. */
  dataset: Dataset
  /** For parameter experiments: the backtest runner (injected so tests can stub it). */
  backtest?: (id: string, params: Record<string, number> | null) => Promise<{ trades: import('../types.ts').ReplayTrade[] }>
  challenge?: (e: Experiment) => unknown
  now?: number
}

export async function runExperiment(id: string, deps: RunDeps): Promise<Experiment> {
  const e0 = getExperiment(id)
  if (!e0) throw new Error(`no experiment ${id}`)
  if (e0.status === 'DONE') return e0 // reproducible: a finished experiment is not re-run into a different answer
  const now = deps.now ?? Date.now()
  const e: Experiment = { ...e0, status: 'RUNNING', startedAt: now }
  saveExperiment(e)
  try {
    let treatment: EvidenceRecord[] = []
    let baseline: EvidenceRecord[] = []
    let splitAt = e.splitAt
    if (e.kind === 'parameter') {
      const run = deps.backtest ?? (async (sid, params) => runBacktestDetailed(sid, { params: params ?? undefined }))
      const variant = (await run(e.strategyId, Object.keys(e.parameterSnapshot).length ? e.parameterSnapshot : null)).trades
      const defaults = (await run(e.strategyId, null)).trades
      treatment = variant.map((t) => fromReplayTrade(t, { symbol: config.symbol, interval: config.interval })).filter((r) => !r.corrupt && r.rMultiple !== null)
      baseline = defaults.map((t) => fromReplayTrade(t, { symbol: config.symbol, interval: config.interval })).filter((r) => !r.corrupt && r.rMultiple !== null)
      const times = [...treatment, ...baseline].map((r) => r.decidedAt).sort((a, b) => a - b)
      splitAt = splitAt ?? (times.length ? times[Math.floor(times.length * 0.6)] : null)
      recordTrials({ strategyId: e.strategyId, source: 'research-lab', count: 2, note: `experiment ${e.experimentId}: variant + baseline backtest`, at: now })
    } else {
      if (datasetHash(deps.dataset) !== e.datasetHash) e.limitations.push(`The dataset supplied at run time (${datasetHash(deps.dataset)}) differs from the frozen definition (${e.datasetHash}); the run used the frozen filters over the supplied records and says so.`)
      const usable = deps.dataset.records.filter((r) => !r.corrupt && !r.missed && r.rMultiple !== null)
      const filters = e.features.map((f) => { const [dimension, vals] = f.split('='); return { dimension, values: vals.split('|') } }) as CohortFilter[]
      treatment = usable.filter((r) => matches(r, filters))
      baseline = usable.filter((r) => !matches(r, filters))
      recordTrials({ strategyId: e.strategyId, source: 'research-lab', count: 1, note: `experiment ${e.experimentId}`, at: now })
    }
    const inS = (rs: EvidenceRecord[]) => (splitAt === null ? [] : rs.filter((r) => r.decidedAt < splitAt!))
    const oos = (rs: EvidenceRecord[]) => (splitAt === null ? rs : rs.filter((r) => r.decidedAt >= splitAt!))
    e.splitAt = splitAt
    e.inSampleResult = side(inS(treatment)); e.baselineInSample = side(inS(baseline))
    e.oosResult = side(oos(treatment)); e.baselineOos = side(oos(baseline))
    e.comparison = { inSample: welch(inS(treatment).map((r) => r.rMultiple as number), inS(baseline).map((r) => r.rMultiple as number)), oos: welch(oos(treatment).map((r) => r.rMultiple as number), oos(baseline).map((r) => r.rMultiple as number)) }
    const rob = robustness(treatment)
    e.walkForwardResult = rob.wf; e.monteCarloResult = rob.mc; e.robustnessResult = rob.verdict
    const trials = Math.max(1, trialsFor(e.strategyId))
    const mt = multipleTesting(trials)
    e.multipleTestingContext = { trials, sidak: mt.sidak, bonferroni: mt.bonferroni, note: mt.note }
    // Counterevidence: treatment trades that went against the direction, out of sample.
    const against = oos(treatment).filter((r) => (e.direction === 'negative' ? (r.rMultiple as number) > 0 : (r.rMultiple as number) < 0))
    if (against.length) e.counterevidence.push(`${against.length} of ${oos(treatment).length} out-of-sample treatment trades went against the hypothesis (${against.slice(0, 5).map((r) => r.id).join(', ')}${against.length > 5 ? ', …' : ''}).`)
    const inV = supports(e.direction, e.comparison.inSample), oosV = supports(e.direction, e.comparison.oos)
    e.result = e.oosResult.trades < SAMPLE_BARS.insufficient && e.inSampleResult.trades < SAMPLE_BARS.insufficient ? 'INSUFFICIENT DATA'
      : oosV === 'supports' ? 'OOS SUPPORTED' : oosV === 'contradicts' ? 'NOT SUPPORTED' : inV === 'supports' ? 'OBSERVED IN SAMPLE' : e.oosResult.trades < SAMPLE_BARS.insufficient ? 'INSUFFICIENT DATA' : 'INCONCLUSIVE'
    if (e.result === 'OBSERVED IN SAMPLE') e.limitations.push('Supported in-sample only; the out-of-sample comparison did not separate treatment from baseline.')
    if (e.baseline.kind === 'complement' || e.baseline.kind === 'excluded-trades') e.limitations.push('Treatment and baseline share the strategy, the window and the fill model; they differ only by the cohort filter. A cohort chosen after seeing results is in-sample by construction.')
    if (e.source === 'BACKTEST') e.limitations.push('SIMULATED: realistic fill model, but no live spread or latency observed.')
    e.challenge = deps.challenge ? deps.challenge(e) : null
    e.status = 'DONE'; e.finishedAt = now; e.nextTest = now + REASSESS_MS
    saveExperiment(e)
    // The hypothesis learns the result — stage results, robustness, counterevidence — through its own versioned API.
    if (e.hypothesisId) {
      let h = getHypothesis(e.hypothesisId)
      if (h) {
        const stage = (s: SideResult, label: string): StageResult => ({ at: now, source: e.source, dataType: e.dataType, trades: s.trades, sampleStatus: sampleStatus(s.trades), meanR: s.meanR, ci95: s.ci95, method: `${e.method} — ${label} (experiment ${e.experimentId})`, recordIds: s.recordIds.slice(0, 500), note: s.trades < SAMPLE_BARS.insufficient ? `${s.trades} treatment record(s) — under the bar.` : `${s.trades} treatment records; baseline comparison: ${e.comparison[label === 'in-sample' ? 'inSample' : 'oos']?.note ?? '—'}` })
        if (e.inSampleResult.trades > 0) h = recordStage(h, 'inSample', stage(e.inSampleResult, 'in-sample'), now)
        if (e.oosResult.trades > 0) h = recordStage(h, 'outOfSample', stage(e.oosResult, 'out-of-sample'), now)
        h = recordRobustness(h, { at: now, walkForward: e.walkForwardResult ? { folds: e.walkForwardResult.folds, trades: e.walkForwardResult.trades, combinedOosAvgR: e.walkForwardResult.combinedOosAvgR } : null, monteCarlo: e.monteCarloResult ? { samples: e.monteCarloResult.samples, totalRp5: e.monteCarloResult.totalRp5, totalRp95: e.monteCarloResult.totalRp95, profitableShare: e.monteCarloResult.profitableShare } : null, note: rob.verdict.notes.join(' ') }, now)
        for (const c of e.counterevidence) h = addCounterevidence(h, `${c} (experiment ${e.experimentId})`, now)
        saveHypothesis(h)
      }
    }
    return e
  } catch (err) {
    e.status = 'FAILED'; e.error = (err as Error).message; e.finishedAt = now
    return saveExperiment(e)
  }
}

/** Experiments whose reassessment date has passed — for the queue. */
export function experimentsDueForReassessment(now = Date.now()): Experiment[] {
  return listExperiments({ status: 'DONE' }).filter((e) => e.nextTest !== null && e.nextTest <= now)
}

export function renderExperiment(e: Experiment): string {
  const sideText = (s: SideResult | null) => (s ? `n=${s.trades} mean ${fx(s.meanR)}R${s.ci95 ? ` (${fx(s.ci95.lo)}..${fx(s.ci95.hi)})` : ''}` : '—')
  return [
    `EXPERIMENT ${e.experimentId} · ${e.kind} · ${e.strategyId} · ${e.source} · ${e.status} · ${e.result}`,
    `dataset ${e.datasetHash} · strategy ${e.strategyVersion} · params ${JSON.stringify(e.parameterSnapshot)} · split ${e.splitAt ? new Date(e.splitAt).toISOString() : 'none'}`,
    `treatment in-sample ${sideText(e.inSampleResult)} | baseline ${sideText(e.baselineInSample)} | ${e.comparison.inSample?.note ?? ''}`,
    `treatment OOS ${sideText(e.oosResult)} | baseline ${sideText(e.baselineOos)} | ${e.comparison.oos?.note ?? ''}`,
    `robustness ${e.robustnessResult?.verdict ?? '—'}: ${e.robustnessResult?.notes.join(' ') ?? ''}`,
    `multiple testing: ${e.multipleTestingContext.note}`,
    e.counterevidence.length ? `counterevidence: ${e.counterevidence.join(' ')}` : 'counterevidence: none recorded',
    `limitations: ${e.limitations.join(' ')}`,
  ].join('\n')
}
