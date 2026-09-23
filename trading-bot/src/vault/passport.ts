/**
 * A passport is the permanent record of one strategy instance: the genome it
 * is, the out-of-sample evidence that earned it a place, the results it has
 * gathered at every stage of its life (backtest → paper → shadow → live), its
 * decay status, and why it exists. It is the lifecycle the factory's survivors
 * enter before any of them is allowed near real money.
 *
 * A passport is immutable in its identity: the genome, the moment it was
 * minted, and the out-of-sample bar it must keep clearing are fixed for life.
 * Everything that happens afterwards is *appended* — results and events are
 * added, and the status and decay are re-derived — but the founding evidence is
 * never rewritten. That is what lets you trust a passport you read later.
 */

import type { BacktestReport } from '../backtest/report.ts'
import type { Metrics } from '../backtest/metrics.ts'
import type { Genome } from '../factory/genome.ts'
import { genomeId } from '../factory/genome.ts'
import { detectDecay, oosLowerBound } from './decay.ts'
import type { DecayStatus } from './decay.ts'

export type PassportStatus = 'candidate' | 'paper' | 'shadow' | 'live' | 'watch' | 'retired'
export const STAGE_ORDER: PassportStatus[] = ['candidate', 'paper', 'shadow', 'live']

/** A result gathered at one stage of the strategy's life. Appended, never edited. */
export type PassportResult = {
  stage: 'backtest' | 'paper' | 'shadow' | 'live'
  at: number
  trades: number
  totalR: number
  avgR: number | null
  /** The individual R-multiples, when known — decay reads these. */
  rMultiples?: number[]
  note?: string
}

/** Anything worth remembering about a passport over its life: a promotion, a demotion, a lesson. */
export type PassportEvent = { at: number; kind: 'minted' | 'promoted' | 'demoted' | 'lesson' | 'note'; detail: string }

export type OosEvidence = {
  trades: number
  avgR: number | null
  totalR: number
  sharpeR: number | null
  maxDrawdownR: number
  /** Walk-forward combined OOS, when it was run. */
  walkForward: { folds: number; trades: number; totalR: number } | null
  /** Monte-Carlo spread. */
  monteCarlo: { totalRp5: number; totalRp95: number; profitableShare: number } | null
}

export type Passport = {
  id: string
  strategyId: string
  genome: Genome
  createdAt: number
  /** Where it came from — a campaign id, or 'manual'. */
  origin: string
  status: PassportStatus
  /** The out-of-sample evidence that earned it a passport. Fixed at minting. */
  oos: OosEvidence
  /** The lower confidence bound on OOS expectancy — the line decay must not fall below. Fixed at minting. */
  oosLowerAvgR: number
  /** The regimes this strategy is built for (its family's home turf). */
  regimeFit: string[]
  /** Results appended over its life, oldest first. */
  results: PassportResult[]
  /** The life story: minting, promotions, demotions, lessons. */
  events: PassportEvent[]
  /** The current decay reading, re-derived whenever a result is appended. */
  decay: DecayStatus
  /** One line: why this exists / what it is for. */
  reason: string
}

const REGIME_FIT: Record<string, string[]> = {
  session: ['killzone', 'liquidity sweep'],
  vwap: ['ranging', 'transition'],
  breakout: ['breakout'],
  trend: ['trending-up', 'trending-down'],
  'mean-reversion': ['ranging'],
  'order-flow': ['any (live tape)'],
  crossover: ['trending-up', 'trending-down'],
}

function oosEvidence(report: BacktestReport): OosEvidence {
  const m: Metrics = report.outOfSample
  const wf = report.walkForward
  const mc = report.monteCarlo
  return {
    trades: m.trades, avgR: m.avgR, totalR: m.totalR, sharpeR: m.sharpeR, maxDrawdownR: m.maxDrawdownR,
    walkForward: wf ? { folds: wf.folds.length, trades: wf.combinedOos.trades, totalR: wf.combinedOos.totalR } : null,
    monteCarlo: mc && mc.samples ? { totalRp5: mc.totalR.p5, totalRp95: mc.totalR.p95, profitableShare: mc.profitableShare } : null,
  }
}

/** A stable passport id from the genome. Same genome → same passport. */
export function passportId(strategyId: string, genome: Genome): string {
  return `pass.${genomeId(genome)}`
}

/**
 * Mint a passport from a backtest report (a factory survivor, or any backtested
 * genome). The report's out-of-sample section becomes the founding evidence and
 * the decay line; the strategy family sets the regime fit.
 */
export function createPassport(strategyId: string, genome: Genome, report: BacktestReport, opts: { origin?: string; family?: string; reason?: string; now?: number } = {}): Passport {
  const now = opts.now ?? Date.now()
  const oos = oosEvidence(report)
  const oosLowerAvgR = oosLowerBound(report.outOfSample)
  const backtestResult: PassportResult = { stage: 'backtest', at: now, trades: oos.trades, totalR: oos.totalR, avgR: oos.avgR, note: 'Out-of-sample backtest at minting.' }
  return {
    id: passportId(strategyId, genome),
    strategyId, genome, createdAt: now,
    origin: opts.origin ?? 'manual',
    status: 'candidate',
    oos, oosLowerAvgR,
    regimeFit: opts.family ? REGIME_FIT[opts.family] ?? [] : [],
    results: [backtestResult],
    events: [{ at: now, kind: 'minted', detail: `Minted from ${opts.origin ?? 'a manual backtest'} with ${oos.trades} out-of-sample trades at ${oos.avgR === null ? '—' : oos.avgR.toFixed(3)}R.` }],
    decay: { decaying: false, reason: 'No live results yet.', rollingExpectancy: null, cusumLow: 0, trades: 0 },
    reason: opts.reason ?? `${strategyId} instance ${JSON.stringify(genome.params)}`,
  }
}

/**
 * Append a result to a passport and re-derive its decay — without ever
 * rewriting the founding evidence. Returns a NEW passport; the input is left
 * untouched (immutability by construction). A decaying passport is demoted to
 * 'watch' automatically (unless already retired).
 */
export function appendResult(passport: Passport, result: PassportResult, opts: { decayMinTrades?: number; decayWindow?: number } = {}): Passport {
  const results = [...passport.results, result]
  // Decay reads the live-ish results (paper/shadow/live), newest R-multiples.
  const liveR = results.filter((r) => r.stage !== 'backtest').flatMap((r) => r.rMultiples ?? [])
  const decay = detectDecay(liveR, passport.oosLowerAvgR, {
    minTrades: opts.decayMinTrades,
    window: opts.decayWindow,
    expectedAvgR: passport.oos.avgR ?? 0,
  })
  const events = [...passport.events]
  let status = passport.status
  if (decay.decaying && passport.status !== 'retired' && passport.status !== 'watch') {
    status = 'watch'
    events.push({ at: result.at, kind: 'demoted', detail: `Demoted to watch: ${decay.reason}` })
  }
  return { ...passport, results, decay, status, events }
}

/** Append a life event (a lesson, a note) without touching results. Returns a new passport. */
export function appendEvent(passport: Passport, kind: PassportEvent['kind'], detail: string, at = Date.now()): Passport {
  return { ...passport, events: [...passport.events, { at, kind, detail }] }
}

/** Set the status explicitly (a promotion), recording the reason. Returns a new passport. Never rewrites evidence. */
export function withStatus(passport: Passport, status: PassportStatus, detail: string, at = Date.now()): Passport {
  if (status === passport.status) return passport
  const kind: PassportEvent['kind'] = STAGE_ORDER.indexOf(status) > STAGE_ORDER.indexOf(passport.status) ? 'promoted' : 'demoted'
  return { ...passport, status, events: [...passport.events, { at, kind, detail }] }
}

/** The best live-ish (or backtest, as a fallback) expectancy on record, for champion-challenger. */
export function stageAvgR(passport: Passport, stage: PassportResult['stage']): { trades: number; avgR: number | null } {
  const rows = passport.results.filter((r) => r.stage === stage)
  const trades = rows.reduce((s, r) => s + r.trades, 0)
  const totalR = rows.reduce((s, r) => s + r.totalR, 0)
  return { trades, avgR: trades > 0 ? totalR / trades : null }
}
