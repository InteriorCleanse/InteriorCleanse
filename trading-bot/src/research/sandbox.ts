/**
 * THE PAPER EXPERIMENT SANDBOX and CHAMPION / CHALLENGER.
 *
 * A researcher can test a filter, a parameter, a regime restriction, a
 * session restriction or a confluence requirement without touching the
 * production strategy: each is registered as an experiment (frozen id,
 * version, dataset, parameters) and run by the experiment runner against
 * its baseline. Filter-type tests are arithmetic over the recorded trades;
 * parameter-type tests run the existing backtester with the variant scoped to
 * that run and cleared afterwards. Nothing here writes a parameter, a
 * passport or a position.
 *
 * Champion / challenger: the production candidate is the vault's champion
 * (Phase 15); challengers are the other passports and the sandbox's
 * experiments. The comparison is read-only and `compareChallenger` is quoted
 * as information — no promotion happens here, and `nextStage` never reaches
 * live in any case.
 */

import { config } from '../../config.ts'
import { cachedBacktest } from '../analyst/evidence.ts'
import { SAMPLE_BARS, cohort } from '../analyst/cohorts.ts'
import type { CohortFilter } from '../analyst/cohorts.ts'
import { backtestDataset, paperDataset } from '../analyst/records.ts'
import type { Dataset } from '../analyst/records.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { metaById, strategyIds } from '../strategies/registry.ts'
import { championOf, compareChallenger } from '../vault/promotion.ts'
import { passportsFor } from '../vault/store.ts'
import { stageAvgR } from '../vault/passport.ts'
import type { Passport } from '../vault/passport.ts'
import { challenge } from './challenger.ts'
import { listExperiments, registerExperiment, runExperiment } from './experiments.ts'
import type { Experiment, ExperimentSpec, RunDeps } from './experiments.ts'
import { listHypotheses } from './hypotheses.ts'

export type SandboxKind = 'filter' | 'session-restriction' | 'regime-restriction' | 'volatility-restriction' | 'confluence-requirement' | 'parameter'

export type SandboxRequest = {
  kind: SandboxKind
  strategyId: string
  source: 'PAPER' | 'BACKTEST'
  /** For restrictions: the values kept (sessions, regimes, volatility labels, quality buckets). */
  values?: string[]
  /** For a confluence requirement: minimum fused score bucket kept, e.g. '80–100'. */
  qualityBuckets?: string[]
  params?: Record<string, number>
  hypothesisId?: string | null
  note?: string
}

const DIMENSION: Record<Exclude<SandboxKind, 'parameter' | 'filter'>, CohortFilter['dimension']> = { 'session-restriction': 'session', 'regime-restriction': 'regime', 'volatility-restriction': 'volatility', 'confluence-requirement': 'qualityBucket' }

export function sandboxSpec(req: SandboxRequest): ExperimentSpec {
  if (req.strategyId !== 'fused' && !strategyIds().includes(req.strategyId)) throw new Error(`unknown strategy "${req.strategyId}"`)
  if (req.kind === 'parameter') {
    const allowed = new Set((metaById().get(req.strategyId)?.parameters ?? []).map((p) => p.name))
    const params = req.params ?? {}
    for (const k of Object.keys(params)) if (!allowed.has(k)) throw new Error(`"${k}" is not a tunable parameter of ${req.strategyId}${allowed.size ? ` (tunable: ${[...allowed].join(', ')})` : ' (nothing is tunable)'}`)
    if (!Object.keys(params).length) throw new Error('a parameter experiment needs at least one parameter value')
    return { hypothesisId: req.hypothesisId ?? null, kind: 'parameter', strategyId: req.strategyId, source: 'BACKTEST', filters: [], params, direction: 'positive', note: req.note ?? 'Sandbox parameter variant against the defaults. The production parameters are untouched.' }
  }
  const filters: CohortFilter[] = req.kind === 'filter' ? [] : [{ dimension: DIMENSION[req.kind], values: (req.kind === 'confluence-requirement' ? req.qualityBuckets : req.values) ?? [] }]
  if (req.kind !== 'filter' && !filters[0].values.length) throw new Error('a restriction needs the values to keep')
  const strategyFilter: CohortFilter = { dimension: 'strategyId', values: [req.strategyId] }
  return { hypothesisId: req.hypothesisId ?? null, kind: 'filter', strategyId: req.strategyId, source: req.source, filters: [strategyFilter, ...filters], direction: 'positive', note: req.note ?? `Sandbox ${req.kind}: would restricting ${req.strategyId} to this cohort have changed its result? The production strategy is untouched.` }
}

function datasetFor(req: SandboxRequest, closed: PaperPosition[]): Dataset {
  if (req.source === 'BACKTEST' || req.kind === 'parameter') { const bt = cachedBacktest(req.strategyId); return backtestDataset(bt?.trades ?? [], { symbol: config.symbol, interval: config.interval }) }
  return paperDataset(closed)
}

/** Register and run a sandbox experiment. A duplicate request returns the finished record. */
export async function runSandbox(req: SandboxRequest, closed: PaperPosition[], deps: Partial<RunDeps> = {}): Promise<{ experiment: Experiment; isNew: boolean }> {
  const spec = sandboxSpec(req)
  const dataset = datasetFor(req, closed)
  const reg = registerExperiment(spec, dataset, deps.now)
  if (reg.experiment.status === 'DONE') return reg
  const usable = dataset.records.filter((r) => !r.corrupt && !r.missed && r.rMultiple !== null)
  const e = await runExperiment(reg.experiment.experimentId, {
    dataset, backtest: deps.backtest, now: deps.now,
    challenge: (x) => challenge(x, { oosTreatment: usable.filter((r) => x.oosResult?.recordIds.includes(r.id)), hypothesesOnRecord: listHypotheses().length, draftedFromObservation: false, now: deps.now }),
  })
  return { experiment: e, isNew: reg.isNew }
}

// ---------------------------------------------------------------
// Champion / challenger
// ---------------------------------------------------------------

export type ChallengerRow = {
  id: string
  label: string
  kind: 'passport' | 'experiment'
  status: string
  oosAvgR: number | null
  oosTrades: number
  paperAvgR: number | null
  paperTrades: number
  maxDrawdownR: number | null
  decaying: boolean | null
  /** The vault's own promotion read, quoted; nothing acts on it here. */
  promotion: string | null
  note: string
}

export type ChampionChallengerView = {
  strategyId: string
  champion: ChallengerRow | null
  challengers: ChallengerRow[]
  paperCohort: { n: number; meanR: number | null; ci95: { lo: number; hi: number } | null; maxDrawdownR: number; signalsPerDay: number | null; rejectionShare: number | null }
  notes: string[]
}

function passportRow(p: Passport, champion: Passport | null): ChallengerRow {
  const paper = stageAvgR(p, 'paper')
  const promo = champion && champion.id !== p.id ? compareChallenger(champion, p) : null
  return { id: p.id, label: `${p.strategyId} ${Object.entries(p.genome.params ?? {}).map(([k, v]) => `${k}=${v}`).join(' ') || '(defaults)'}`, kind: 'passport', status: p.status, oosAvgR: p.oos.avgR, oosTrades: p.oos.trades, paperAvgR: paper.avgR, paperTrades: paper.trades, maxDrawdownR: p.oos.maxDrawdownR, decaying: p.decay.decaying, promotion: promo ? promo.reason : null, note: p.reason }
}

export function championChallengerView(strategyId: string, closed: PaperPosition[]): ChampionChallengerView {
  const passports = passportsFor(strategyId)
  const champ = championOf(passports)
  const rows = passports.map((p) => passportRow(p, champ))
  const exps = listExperiments({ strategyId, status: 'DONE' }).slice(0, 20).map((e): ChallengerRow => ({ id: e.experimentId, label: `${e.kind}: ${e.features.join(', ') || JSON.stringify(e.parameterSnapshot)}`, kind: 'experiment', status: e.result, oosAvgR: e.oosResult?.meanR ?? null, oosTrades: e.oosResult?.trades ?? 0, paperAvgR: e.source === 'PAPER' ? e.oosResult?.meanR ?? null : null, paperTrades: e.source === 'PAPER' ? e.oosResult?.trades ?? 0 : 0, maxDrawdownR: e.oosResult?.maxDrawdownR ?? null, decaying: null, promotion: null, note: `${e.comparison.oos?.note ?? 'no out-of-sample comparison'} Challenger: ${(e.challenge as { overall?: string } | null)?.overall ?? 'not run'}.` }))
  const d = paperDataset(closed)
  const co = cohort(d, { name: strategyId, filters: [{ dimension: 'strategyId', values: [strategyId] }] })
  const mine = closed.filter((p) => (p.strategyId ?? 'session-ifvg') === strategyId)
  const days = mine.length ? Math.max(1, (Math.max(...mine.map((p) => p.openedAt)) - Math.min(...mine.map((p) => p.openedAt))) / 86_400_000) : null
  const missed = mine.filter((p) => p.exitReason === 'missed').length
  return {
    strategyId,
    champion: champ ? passportRow(champ, null) : null,
    challengers: [...rows.filter((r) => r.id !== champ?.id), ...exps],
    paperCohort: { n: co.stats.n, meanR: co.stats.n >= SAMPLE_BARS.insufficient ? co.stats.meanR : null, ci95: co.stats.n >= SAMPLE_BARS.insufficient ? co.stats.ci95 : null, maxDrawdownR: co.stats.maxDrawdownR, signalsPerDay: days && mine.length ? mine.length / days : null, rejectionShare: mine.length ? missed / mine.length : null },
    notes: [
      champ ? `Champion: the vault's furthest-along non-decaying passport for ${strategyId}. Nothing promotes automatically; the step to live is a human decision.` : `No vault passport for ${strategyId} — the production strategy runs at its built-in parameters and is the de-facto champion. Sandbox experiments are the challengers.`,
      'A challenger is compared on out-of-sample expectancy, paper expectancy, drawdown, decay, and the experiment runner\'s OOS / walk-forward / Monte Carlo. The comparison is information; no replacement happens here.',
    ],
  }
}
