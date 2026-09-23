/**
 * THE HISTORICAL → PAPER DRIFT MONITOR — where the paper record has departed
 * from the historical (backtest) population, by strategy, session, regime and
 * volatility, on mean R, MAE, MFE, drawdown, signal frequency and rejection
 * rate.
 *
 * It reports DIFFERENCES. It does not say why. A difference between a
 * simulated fill and a live-book fill can be spread, slippage, latency, the
 * regime mix of the two windows, the calendar, or chance in either column;
 * naming the cause is a research question, and that is exactly what a
 * DIFFERENT row becomes — a signal for the research queue and an entry on the
 * "what should we study next" screen. Nothing here changes a parameter,
 * a strategy or a gate.
 *
 * PAPER and BACKTEST stay two datasets throughout. They are compared, never
 * pooled. Every comparison prints both sample sizes, and under the bar it says
 * INSUFFICIENT and nothing else.
 */

import { config } from '../../config.ts'
import { cachedBacktest } from '../analyst/evidence.ts'
import { SAMPLE_BARS, byDimension, statsOf } from '../analyst/cohorts.ts'
import type { CohortDimension, CohortStats } from '../analyst/cohorts.ts'
import { backtestDataset, paperDataset, tradesOf } from '../analyst/records.ts'
import type { Dataset, EvidenceRecord, Provenance } from '../analyst/records.ts'
import { welch } from '../research/experiments.ts'
import type { WelchComparison } from '../research/experiments.ts'
import type { QueueSignal } from '../research/queue.ts'
import type { DriftInput } from '../research/recommend.ts'
import type { PaperPosition } from '../paperTrader.ts'

export type DriftVerdict = 'ALIGNED' | 'DIFFERENT' | 'INSUFFICIENT'
export type DriftDimension = 'overall' | 'strategyId' | 'session' | 'regime' | 'volatility'
export type DriftMetricName = 'mean R' | 'MAE' | 'MFE' | 'max drawdown' | 'signal frequency' | 'rejection rate'

export type DriftMetric = {
  metric: DriftMetricName
  paper: number | null
  backtest: number | null
  /** paper − backtest in the metric's own unit; null when not comparable. */
  delta: number | null
  /** Present on the metrics that carry a Welch interval (mean R, MAE, MFE). */
  welch: WelchComparison | null
  comparable: boolean
  note: string
}

export type DriftRow = {
  dimension: DriftDimension
  value: string
  paperN: number
  backtestN: number
  verdict: DriftVerdict
  metrics: DriftMetric[]
  /** The metrics that differ, by name — the row's reason for being reported. */
  differs: DriftMetricName[]
  note: string
}

export type DriftReport = {
  at: number
  strategyId: string | null
  paper: Provenance
  backtest: Provenance
  overall: DriftRow
  rows: DriftRow[]
  /** Only the rows with something to report. The monitor reports differences, not agreement. */
  differences: DriftRow[]
  signals: QueueSignal[]
  forRecommend: DriftInput
  note: string
  caveats: string[]
}

const DAY = 86_400_000
const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)
/** A gap smaller than this, in R per trade, is not reported as a difference even when its interval excludes zero: it is measurable in the arithmetic and meaningless at the desk. */
export const MIN_EFFECT_R = 0.01

function days(p: Provenance): number | null {
  if (!p.period) return null
  return Math.max(1 / 24, (p.period.to - p.period.from) / DAY)
}

function excursionMetric(name: 'MAE' | 'MFE', pt: EvidenceRecord[], bt: EvidenceRecord[]): DriftMetric {
  const key = name === 'MAE' ? 'mae' : 'mfe'
  const p = pt.filter((r) => r[key].status === 'OBSERVED').map((r) => r[key].r as number)
  const b = bt.filter((r) => r[key].status === 'OBSERVED').map((r) => r[key].r as number)
  if (!p.length || !b.length) return { metric: name, paper: p.length ? mean(p) : null, backtest: b.length ? mean(b) : null, delta: null, welch: null, comparable: false, note: `${name} observed on ${p.length} paper and ${b.length} backtest trade(s); both sides need it before a comparison.` }
  const w = welch(p, b)
  return { metric: name, paper: mean(p), backtest: mean(b), delta: w.deltaR, welch: w, comparable: w.verdict !== 'TOO FEW', note: `${name} over ${p.length} paper vs ${b.length} backtest trade(s) with an observed excursion: ${w.note}` }
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/** One row: the same cohort on both sides, every metric compared, verdict from the metrics that can be compared. Pure. */
export function driftRow(dimension: DriftDimension, value: string, paper: Dataset, backtest: Dataset, pt: EvidenceRecord[], bt: EvidenceRecord[]): DriftRow {
  const ps: CohortStats = statsOf(pt)
  const bs: CohortStats = statsOf(bt)
  const metrics: DriftMetric[] = []
  const meanW = welch(pt.map((r) => r.rMultiple as number), bt.map((r) => r.rMultiple as number))
  metrics.push({ metric: 'mean R', paper: ps.meanR, backtest: bs.meanR, delta: meanW.deltaR, welch: meanW, comparable: meanW.verdict !== 'TOO FEW', note: meanW.note })
  metrics.push(excursionMetric('MAE', pt, bt))
  metrics.push(excursionMetric('MFE', pt, bt))
  const ddComparable = ps.n >= SAMPLE_BARS.insufficient && bs.n >= SAMPLE_BARS.insufficient
  metrics.push({ metric: 'max drawdown', paper: ps.n ? ps.maxDrawdownR : null, backtest: bs.n ? bs.maxDrawdownR : null, delta: ddComparable ? ps.maxDrawdownR - bs.maxDrawdownR : null, welch: null, comparable: ddComparable, note: ddComparable ? `Max drawdown ${ps.maxDrawdownR.toFixed(2)}R paper vs ${bs.maxDrawdownR.toFixed(2)}R backtest. A drawdown is one path; it has no interval, so it is shown and not judged.` : `Under ${SAMPLE_BARS.insufficient} trades on a side; a drawdown off that few is the order the trades happened in.` })
  // Signal frequency: trades per day over each side's own window. Comparable only when both windows are known and the cohort is the whole strategy (a sub-cohort's window is the parent's).
  const pd = days(paper.provenance), bd = days(backtest.provenance)
  const pf = pd ? ps.n / pd : null, bf = bd ? bs.n / bd : null
  const freqComparable = pf !== null && bf !== null && pd! >= 7 && bd! >= 7 && bs.n >= SAMPLE_BARS.insufficient
  metrics.push({ metric: 'signal frequency', paper: pf, backtest: bf, delta: freqComparable ? pf! - bf! : null, welch: null, comparable: freqComparable, note: pf !== null && bf !== null ? `${pf.toFixed(2)} trades/day over ${Math.round(pd!)} paper day(s) vs ${bf.toFixed(2)} over ${Math.round(bd!)} backtest day(s).${freqComparable ? (Math.abs(pf - bf) > Math.max(0.5 * bf, 0.1) ? ' The rates differ by more than half of the historical rate.' : ' The rates are within half of the historical rate of each other.') : ' Windows under a week, or too few historical trades, are not compared.'}` : 'One side has no period; frequency needs a window.' })
  // Rejection rate: paper refusals before a fill. The replay has no risk chain, so the historical side has no rate to compare to.
  const pm = paper.records.filter((r) => r.missed).length
  const prate = ps.n + pm > 0 ? pm / (ps.n + pm) : null
  metrics.push({ metric: 'rejection rate', paper: prate, backtest: null, delta: null, welch: null, comparable: false, note: prate === null ? 'No paper decisions yet.' : `${(prate * 100).toFixed(0)}% of paper decisions were refused before a fill (${pm} of ${ps.n + pm}). The backtest has no risk chain, so there is nothing to compare this to; it is reported, not judged.` })

  const differs: DriftMetricName[] = []
  for (const m of metrics) {
    if (!m.comparable) continue
    if (m.welch) { if ((m.welch.verdict === 'TREATMENT AHEAD' || m.welch.verdict === 'BASELINE AHEAD') && Math.abs(m.welch.deltaR ?? 0) >= MIN_EFFECT_R) differs.push(m.metric); continue }
    if (m.metric === 'signal frequency' && m.paper !== null && m.backtest !== null && Math.abs(m.paper - m.backtest) > Math.max(0.5 * m.backtest, 0.1)) differs.push(m.metric)
  }
  const anyComparable = metrics.some((m) => m.comparable)
  const verdict: DriftVerdict = !anyComparable || meanW.verdict === 'TOO FEW' ? 'INSUFFICIENT' : differs.length ? 'DIFFERENT' : 'ALIGNED'
  const label = dimension === 'overall' ? 'the whole record' : `${dimension} ${value}`
  const note = verdict === 'INSUFFICIENT'
    ? `${label}: paper ${ps.n}, backtest ${bs.n} — under the ${SAMPLE_BARS.insufficient}-per-side bar, no difference is stated.`
    : verdict === 'DIFFERENT'
      ? `${label}: paper differs from the historical population on ${differs.join(', ')} (paper mean ${fx(ps.meanR)}R over ${ps.n} vs backtest ${fx(bs.meanR)}R over ${bs.n}). The cause is not asserted here.`
      : `${label}: nothing measurable separates paper from the historical population at this sample (paper ${ps.n}, backtest ${bs.n}).`
  return { dimension, value, paperN: ps.n, backtestN: bs.n, verdict, metrics, differs, note }
}

/**
 * The full report: overall plus one row per value of session, regime and
 * volatility present on either side, and per strategy when the datasets span
 * several. Pure over the two datasets.
 */
export function driftReport(paper: Dataset, backtest: Dataset, opts: { now?: number; strategyId?: string | null } = {}): DriftReport {
  if (paper.provenance.source !== 'PAPER') throw new Error(`the paper side must be a PAPER dataset, got ${paper.provenance.source}`)
  if (backtest.provenance.source !== 'BACKTEST') throw new Error(`the backtest side must be a BACKTEST dataset, got ${backtest.provenance.source}`)
  const now = opts.now ?? Date.now()
  const pt = tradesOf(paper), bt = tradesOf(backtest)
  const overall = driftRow('overall', 'all', paper, backtest, pt, bt)
  const rows: DriftRow[] = []
  const dims: Array<Exclude<DriftDimension, 'overall'>> = ['strategyId', 'session', 'regime', 'volatility']
  for (const dim of dims) {
    const values = new Set<string>([...byDimension(paper, dim as CohortDimension).rows.map((r) => r.name), ...byDimension(backtest, dim as CohortDimension).rows.map((r) => r.name)])
    if (dim === 'strategyId' && values.size < 2) continue
    for (const v of [...values].sort()) {
      const pr = byDimension(paper, dim as CohortDimension).rows.find((r) => r.name === v)
      const br = byDimension(backtest, dim as CohortDimension).rows.find((r) => r.name === v)
      const pIds = new Set(pr?.recordIds ?? []), bIds = new Set(br?.recordIds ?? [])
      rows.push(driftRow(dim, v, paper, backtest, pt.filter((r) => pIds.has(r.id)), bt.filter((r) => bIds.has(r.id))))
    }
  }
  const differences = [overall, ...rows].filter((r) => r.verdict === 'DIFFERENT')
  const strategyId = opts.strategyId ?? (paper.provenance.trades ? pt[0]?.strategyId ?? null : bt[0]?.strategyId ?? null)
  const signals: QueueSignal[] = differences.map((r) => ({
    origin: 'drift',
    question: r.dimension === 'overall' ? `Why does the paper record differ from the historical population on ${r.differs.join(', ')}?` : `Why does paper ${r.dimension} "${r.value}" differ from the historical population?`,
    hypothesis: null,
    source: 'PAPER',
    strategyId,
    filters: r.dimension === 'overall' ? [] : [{ dimension: r.dimension as CohortDimension, values: [r.value] }],
    direction: 'difference',
    reason: r.note,
  }))
  const forRecommend: DriftInput = differences.map((r) => ({ dimension: r.dimension, value: r.value, verdict: r.verdict, note: r.note }))
  return {
    at: now, strategyId, paper: paper.provenance, backtest: backtest.provenance, overall, rows, differences, signals, forRecommend,
    note: differences.length
      ? `${differences.length} cohort(s) where paper differs from the historical population. Each becomes a research question; none becomes a change.`
      : overall.verdict === 'INSUFFICIENT'
        ? `Under the ${SAMPLE_BARS.insufficient}-per-side bar; no drift is measured yet. Paper trading builds the sample.`
        : 'No measurable drift at this sample. Agreement at a small sample is not confirmation; it is the absence of a measurable difference.',
    caveats: [
      'BACKTEST is SIMULATED. PAPER is live market data with simulated execution. They are compared, never pooled.',
      'DIFFERENT names a measured gap and its direction on the named metrics. It does not assert a cause and does not mean the strategy has degraded or improved.',
      'Rejection rate has no historical counterpart: the replay has no risk chain. It is reported, not compared.',
      'A drawdown is one path with no interval; it is shown beside its counterpart and never decides a verdict.',
    ],
  }
}

/** The report for one strategy against its cached backtest, from the stored records. Null when no backtest has been cached (a POST refreshes one; a GET never does). */
export function driftFor(strategyId: string, closed: PaperPosition[], now = Date.now()): DriftReport | null {
  const bt = cachedBacktest(strategyId)
  if (!bt) return null
  const paper = paperDataset(closed.filter((p) => (p.strategyId ?? 'session-ifvg') === strategyId))
  const backtest = backtestDataset(bt.trades ?? [], { symbol: config.symbol, interval: config.interval })
  return driftReport(paper, backtest, { now, strategyId })
}

/** Every strategy with a cached backtest and at least one paper decision. */
export function driftAll(closed: PaperPosition[], strategyIds: string[], now = Date.now()): { reports: DriftReport[]; skipped: Array<{ strategyId: string; reason: string }>; signals: QueueSignal[]; forRecommend: DriftInput } {
  const reports: DriftReport[] = []
  const skipped: Array<{ strategyId: string; reason: string }> = []
  for (const id of strategyIds) {
    const r = driftFor(id, closed, now)
    if (!r) { skipped.push({ strategyId: id, reason: 'no cached backtest — POST /api/evidence/backtest computes one' }); continue }
    reports.push(r)
  }
  return { reports, skipped, signals: reports.flatMap((r) => r.signals), forRecommend: reports.flatMap((r) => r.forRecommend) }
}
