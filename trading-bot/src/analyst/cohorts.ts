/**
 * COHORTS — measurements with their sample size welded on.
 *
 * A cohort is a named subset of evidence records: "Silver Bullet in London",
 * "unicorn + wild volatility", "shorts in a ranging regime". This module
 * computes what a cohort actually did and — the reason it exists — refuses to
 * let a number leave without the count that qualifies it.
 *
 * The status labels are DATASET DESCRIPTIONS, not quality ratings:
 *
 *   INSUFFICIENT SAMPLE  0–9      nothing is claimed; the mean is shown for
 *                                 completeness only
 *   EARLY SAMPLE         10–49    a direction, not a finding
 *   DEVELOPING DATASET   50–199   the interval starts to mean something
 *   LARGER DATASET       200+     still evidence, still not a promise
 *
 * A cohort with a positive mean and eight trades is INSUFFICIENT SAMPLE, full
 * stop. It is never "profitable" and never "high edge"; those words do not
 * appear in this file's output at any sample size, because sample size alone is
 * never converted into a claim about the future.
 *
 * Every statistic reuses the existing infrastructure — the t-interval and
 * sample-size sketch from `attribution.ts`, the drawdown / profit-factor /
 * streak arithmetic from `backtest/metrics.ts` — so a cohort and a validation
 * report cannot disagree about the same trades.
 *
 * Read-only. Nothing here reaches the engine.
 */

import { computeMetrics } from '../backtest/metrics.ts'
import { meanWithInterval, sampleSd, tradesNeededToDecide } from './attribution.ts'
import type { Interval } from './attribution.ts'
import type { Dataset, EvidenceRecord, Provenance } from './records.ts'
import { tradesOf } from './records.ts'

// ---------------------------------------------------------------
// Sample status — thresholds live here, once, and are printed with every number
// ---------------------------------------------------------------

export type SampleStatus = 'INSUFFICIENT SAMPLE' | 'EARLY SAMPLE' | 'DEVELOPING DATASET' | 'LARGER DATASET'

/** The bars. Exported so the docs and the UI print the same numbers this code uses. */
export const SAMPLE_BARS = { insufficient: 10, early: 50, developing: 200 } as const

export function sampleStatus(n: number): SampleStatus {
  if (n < SAMPLE_BARS.insufficient) return 'INSUFFICIENT SAMPLE'
  if (n < SAMPLE_BARS.early) return 'EARLY SAMPLE'
  if (n < SAMPLE_BARS.developing) return 'DEVELOPING DATASET'
  return 'LARGER DATASET'
}

/** What a status means, in the words the UI shows beside it. */
export function describeStatus(s: SampleStatus): string {
  switch (s) {
    case 'INSUFFICIENT SAMPLE': return `Under ${SAMPLE_BARS.insufficient} trades. Nothing is claimed; the numbers are shown so you can see them fill in.`
    case 'EARLY SAMPLE': return `Under ${SAMPLE_BARS.early} trades. A direction, not a finding — the interval is still wide enough to include the opposite conclusion.`
    case 'DEVELOPING DATASET': return `Under ${SAMPLE_BARS.developing} trades. The interval has started to narrow; it is still evidence, not a track record.`
    case 'LARGER DATASET': return `${SAMPLE_BARS.developing} or more trades. A larger dataset — and still a description of the past, never a promise about the future.`
  }
}

// ---------------------------------------------------------------
// Filters
// ---------------------------------------------------------------

/** The dimensions a cohort may be cut on. Only fields the record actually carries. */
export type CohortDimension =
  | 'strategyId' | 'family' | 'session' | 'regime' | 'volatility' | 'symbol' | 'interval'
  | 'direction' | 'hourET' | 'weekdayET' | 'exitReason' | 'newsBucket' | 'qualityBucket'

/** One condition: the record's value for `dimension` must be one of `values`. */
export type CohortFilter = { dimension: CohortDimension; values: Array<string | number> }

export type CohortDefinition = { name: string; filters: CohortFilter[] }

/** Minutes to the next blackout, bucketed the way a reader thinks about it. */
export function newsBucket(minutes: number | null, inBlackout?: boolean | null): string {
  if (inBlackout) return 'inside blackout'
  if (minutes === null) return 'not recorded'
  if (minutes <= 30) return '≤30 min before'
  if (minutes <= 120) return '30–120 min before'
  return '>2 h before'
}

export function qualityBucket(q: number | null): string {
  if (q === null) return 'not recorded'
  if (q >= 80) return '80–100'
  if (q >= 60) return '60–79'
  if (q >= 40) return '40–59'
  return '<40'
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The record's value along a dimension, as the string a table prints. */
export function valueOf(r: EvidenceRecord, d: CohortDimension): string {
  switch (d) {
    case 'strategyId': return r.strategyId
    case 'family': return r.family
    case 'session': return r.session
    case 'regime': return r.regime ?? 'not recorded'
    case 'volatility': return r.volatility ?? 'not recorded'
    case 'symbol': return r.symbol
    case 'interval': return r.interval
    case 'direction': return r.direction
    case 'hourET': return r.hourET === null ? 'not recorded' : `${String(r.hourET).padStart(2, '0')}:00`
    case 'weekdayET': return r.weekdayET === null ? 'not recorded' : WEEKDAYS[r.weekdayET]
    case 'exitReason': return r.exitReason ?? 'not recorded'
    case 'newsBucket': return newsBucket(r.newsMinutes)
    case 'qualityBucket': return qualityBucket(r.quality)
  }
}

export function matches(r: EvidenceRecord, filters: CohortFilter[]): boolean {
  return filters.every((f) => {
    const v = valueOf(r, f.dimension)
    return f.values.some((x) => String(x) === v)
  })
}

// ---------------------------------------------------------------
// The measurement
// ---------------------------------------------------------------

export type CohortStats = {
  n: number
  status: SampleStatus
  statusNote: string
  meanR: number | null
  medianR: number | null
  /** Sample standard deviation of R — the dispersion. Null under two trades. */
  sdR: number | null
  stdErr: number | null
  /** 95% t-interval for the TRUE mean. Null under two trades. */
  ci95: Interval | null
  wins: number
  losses: number
  flat: number
  winRate: number | null
  /** Same number as meanR, named for the reader. */
  expectancyR: number | null
  /** Only reported at DEVELOPING EVIDENCE or above — a ratio of two small sums is noise. */
  profitFactor: number | null
  maxDrawdownR: number
  longestLosingStreak: number
  /** Roughly how many trades before the interval could clear zero at this mean and spread. */
  tradesNeeded: number | null
  /** MAE / MFE means over the trades that have them, with how many that was. */
  mae: { meanR: number | null; n: number }
  mfe: { meanR: number | null; n: number }
  /** Median trade duration in minutes over trades that have one. */
  medianDurationMin: number | null
}

export type Cohort = {
  name: string
  filters: CohortFilter[]
  provenance: Provenance
  stats: CohortStats
  /** Ids of the records inside, so every number is traceable to its trades. */
  recordIds: string[]
  /** How the cohort's trades fall across the other dimensions (counts only). */
  composition: Partial<Record<CohortDimension, Record<string, number>>>
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** The statistics for a list of trade records. Pure. */
export function statsOf(trades: EvidenceRecord[]): CohortStats {
  const rs = trades.map((r) => r.rMultiple as number)
  const n = rs.length
  const status = sampleStatus(n)
  const { mean, stdErr, ci95 } = meanWithInterval(rs)
  const sd = sampleSd(rs)
  const m = computeMetrics(trades.map((r) => ({ time: r.decidedAt, rMultiple: r.rMultiple, pnlUsd: 0, outcome: r.outcome === 'MISSED' ? 'FLAT' : r.outcome })))
  const maes = trades.filter((r) => r.mae.status === 'OBSERVED').map((r) => r.mae.r as number)
  const mfes = trades.filter((r) => r.mfe.status === 'OBSERVED').map((r) => r.mfe.r as number)
  const durations = trades.map((r) => r.durationMs).filter((d): d is number => d !== null).map((d) => d / 60_000)
  const developing = n >= SAMPLE_BARS.early
  return {
    n,
    status,
    statusNote: describeStatus(status),
    meanR: mean,
    medianR: median(rs),
    sdR: sd,
    stdErr,
    ci95,
    wins: m.wins,
    losses: m.losses,
    flat: m.flat,
    winRate: m.winRate,
    expectancyR: mean,
    // A profit factor off nine trades is two small sums divided; it is not reported until the sample can carry it.
    profitFactor: developing && m.profitFactor !== null && Number.isFinite(m.profitFactor) ? m.profitFactor : null,
    maxDrawdownR: m.maxDrawdownR,
    longestLosingStreak: m.longestLosingStreak,
    tradesNeeded: mean !== null && sd !== null ? tradesNeededToDecide(mean, sd) : null,
    mae: { meanR: maes.length ? maes.reduce((s, x) => s + x, 0) / maes.length : null, n: maes.length },
    mfe: { meanR: mfes.length ? mfes.reduce((s, x) => s + x, 0) / mfes.length : null, n: mfes.length },
    medianDurationMin: median(durations),
  }
}

const COMPOSITION_DIMS: CohortDimension[] = ['strategyId', 'session', 'regime', 'volatility', 'direction', 'exitReason']

function composition(trades: EvidenceRecord[], skip: Set<CohortDimension>): Cohort['composition'] {
  const out: Cohort['composition'] = {}
  for (const d of COMPOSITION_DIMS) {
    if (skip.has(d)) continue
    const counts: Record<string, number> = {}
    for (const r of trades) { const v = valueOf(r, d); counts[v] = (counts[v] ?? 0) + 1 }
    out[d] = counts
  }
  return out
}

/** Build one cohort from a dataset. The provenance rides along untouched. */
export function cohort(d: Dataset, def: CohortDefinition): Cohort {
  const trades = tradesOf(d).filter((r) => matches(r, def.filters))
  return {
    name: def.name,
    filters: def.filters,
    provenance: d.provenance,
    stats: statsOf(trades),
    recordIds: trades.map((r) => r.id),
    composition: composition(trades, new Set(def.filters.map((f) => f.dimension))),
  }
}

// ---------------------------------------------------------------
// Dimensions — every value along an axis, as a cohort each
// ---------------------------------------------------------------

export type DimensionTable = {
  dimension: CohortDimension
  provenance: Provenance
  /** Ordered by sample size then name — never by return, so a lucky small cell cannot float to the top. */
  rows: Cohort[]
  /** Trades whose value along this dimension the engine did not record. */
  unrecorded: number
  note: string
}

const KNOWN_VALUES: Partial<Record<CohortDimension, string[]>> = {
  session: ['asia', 'london', 'newYork', 'nyPM', 'none'],
  regime: ['trending-up', 'trending-down', 'ranging', 'breakout', 'transition'],
  volatility: ['quiet', 'normal', 'wild'],
  direction: ['long', 'short'],
  weekdayET: WEEKDAYS,
}

export function byDimension(d: Dataset, dimension: CohortDimension, opts: { includeEmpty?: boolean } = {}): DimensionTable {
  const trades = tradesOf(d)
  const values = new Set<string>(opts.includeEmpty ? KNOWN_VALUES[dimension] ?? [] : [])
  for (const r of trades) values.add(valueOf(r, dimension))
  const rows: Cohort[] = []
  let unrecorded = 0
  for (const v of values) {
    if (v === 'not recorded') { unrecorded = trades.filter((r) => valueOf(r, dimension) === v).length; continue }
    rows.push(cohort(d, { name: v, filters: [{ dimension, values: [v] }] }))
  }
  rows.sort((a, b) => b.stats.n - a.stats.n || a.name.localeCompare(b.name))
  return {
    dimension,
    provenance: d.provenance,
    rows,
    unrecorded,
    note: unrecorded
      ? `${unrecorded} trade${unrecorded === 1 ? '' : 's'} carry no recorded ${dimension} and are left out of every row rather than filed under a guess.`
      : 'Rows are ordered by sample size, not by result.',
  }
}

/** A two-way table (e.g. session × strategy). Each cell is a cohort; empty cells are present and say so. */
export type CrossTable = {
  rowDimension: CohortDimension
  colDimension: CohortDimension
  provenance: Provenance
  rowKeys: string[]
  colKeys: string[]
  cells: Cohort[][]
}

export function crossTable(d: Dataset, rowDimension: CohortDimension, colDimension: CohortDimension): CrossTable {
  const trades = tradesOf(d)
  const rowKeys = [...new Set(trades.map((r) => valueOf(r, rowDimension)))].filter((k) => k !== 'not recorded').sort()
  const colKeys = [...new Set(trades.map((r) => valueOf(r, colDimension)))].filter((k) => k !== 'not recorded').sort()
  const cells = rowKeys.map((rk) => colKeys.map((ck) =>
    cohort(d, { name: `${rk} × ${ck}`, filters: [{ dimension: rowDimension, values: [rk] }, { dimension: colDimension, values: [ck] }] }),
  ))
  return { rowDimension, colDimension, provenance: d.provenance, rowKeys, colKeys, cells }
}

/**
 * A heatmap cell that cannot visually imply significance from a tiny sample.
 * The value is null under the bar so a renderer has nothing to colour; the
 * count is always there so it can print "n=3" in grey instead.
 */
export type HeatCell = { row: string; col: string; n: number; status: SampleStatus; meanR: number | null; shown: boolean }

export function heatmap(d: Dataset, rowDimension: CohortDimension, colDimension: CohortDimension, minToShow = SAMPLE_BARS.insufficient): { cells: HeatCell[]; rowKeys: string[]; colKeys: string[]; provenance: Provenance; note: string } {
  const t = crossTable(d, rowDimension, colDimension)
  const cells: HeatCell[] = []
  for (let i = 0; i < t.rowKeys.length; i++) {
    for (let j = 0; j < t.colKeys.length; j++) {
      const c = t.cells[i][j]
      const shown = c.stats.n >= minToShow
      cells.push({ row: t.rowKeys[i], col: t.colKeys[j], n: c.stats.n, status: c.stats.status, meanR: shown ? c.stats.meanR : null, shown })
    }
  }
  return { cells, rowKeys: t.rowKeys, colKeys: t.colKeys, provenance: d.provenance, note: `Cells under ${minToShow} trades show their count and no value — a colour on three trades is a lie the eye believes.` }
}

// ---------------------------------------------------------------
// Rendering — one cohort as text, the way the API's ?format=text prints it
// ---------------------------------------------------------------

const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

export function renderCohort(c: Cohort): string {
  const s = c.stats
  const L: string[] = []
  L.push(`${c.name}  [${c.provenance.source}]`)
  L.push(`  Trades: ${s.n}   Status: ${s.status}`)
  if (s.n === 0) { L.push('  NOT ENOUGH DATA — no trades match. Nothing is estimated.'); return L.join('\n') }
  L.push(`  Mean R: ${fx(s.meanR)}   Median R: ${fx(s.medianR)}   Variation: ${s.sdR === null ? '—' : '±' + s.sdR.toFixed(2)}   N: ${s.n}`)
  if (s.ci95) L.push(`  95% interval for the true mean: ${fx(s.ci95.lo)}R to ${fx(s.ci95.hi)}R`)
  L.push(`  Win rate: ${s.winRate === null ? '—' : (s.winRate * 100).toFixed(1) + '%'} (${s.wins}W / ${s.losses}L / ${s.flat}F)   Max drawdown: ${s.maxDrawdownR.toFixed(2)}R   Longest losing run: ${s.longestLosingStreak}`)
  L.push(`  Profit factor: ${s.profitFactor === null ? (s.n < SAMPLE_BARS.early ? 'not reported under ' + SAMPLE_BARS.early + ' trades' : '—') : s.profitFactor.toFixed(2)}`)
  L.push(`  MAE: ${s.mae.meanR === null ? 'not available' : fx(s.mae.meanR) + 'R over ' + s.mae.n}   MFE: ${s.mfe.meanR === null ? 'not available' : fx(s.mfe.meanR) + 'R over ' + s.mfe.n}`)
  if (s.tradesNeeded !== null) L.push(`  Trades needed before the interval could clear zero at this mean and spread: ~${s.tradesNeeded}`)
  L.push(`  ${s.statusNote}`)
  return L.join('\n')
}
