/**
 * PAPER VS BACKTEST — side by side, with the two never confused and the
 * difference never over-read.
 *
 * The backtest column is SIMULATED. The paper column is LIVE MARKET DATA with
 * SIMULATED EXECUTION. Each row prints both, and the header prints both
 * provenance labels, because a reader who forgets which is which will draw the
 * wrong conclusion from either.
 *
 * The verdict is one of three neutral words, and the thresholds are stated:
 *
 *   INSUFFICIENT SAMPLE   either side has fewer than `minPerSide` trades
 *   ALIGNED               a 95% Welch interval for (paper − backtest) includes 0
 *   DIFFERENT             that interval excludes 0
 *
 * DIFFERENT is not "degradation" and not "improvement": the direction is
 * printed as a signed number and the cause is not asserted. A difference can
 * be spread, slippage, fill latency, regime mix, the calendar, or chance in
 * either column; this module measures it and says which way, nothing more.
 */

import { sampleSd, tCritical95 } from './attribution.ts'
import type { Interval } from './attribution.ts'
import { SAMPLE_BARS, statsOf } from './cohorts.ts'
import type { CohortStats } from './cohorts.ts'
import { tradesOf } from './records.ts'
import { toET } from '../sessions.ts'
import type { Dataset, Provenance } from './records.ts'

export type ComparisonVerdict = 'ALIGNED' | 'DIFFERENT' | 'INSUFFICIENT SAMPLE'

export type SideBySideRow = { metric: string; backtest: string; paper: string }

export type PaperVsBacktest = {
  backtest: Provenance
  paper: Provenance
  rows: SideBySideRow[]
  verdict: ComparisonVerdict
  /** paper − backtest, in R per trade, with its 95% Welch interval. Null under the bar. */
  deltaR: number | null
  ci95: Interval | null
  thresholds: { minPerSide: number; interval: '95% Welch t-interval on the difference of means' }
  note: string
  caveats: string[]
}

const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)
const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`)
// New York calendar days, like every other date on the page.
const dayKey = (ms: number) => toET(ms).dateKey

function rowsOf(b: CohortStats, p: CohortStats, bp: Provenance, pp: Provenance, assumptions: { backtest: string; paper: string }): SideBySideRow[] {
  const period = (x: Provenance) => (x.period ? `${dayKey(x.period.from)} → ${dayKey(x.period.to)}` : 'no period')
  return [
    { metric: 'Trades', backtest: String(b.n), paper: String(p.n) },
    { metric: 'Sample status', backtest: b.status, paper: p.status },
    { metric: 'Mean R', backtest: fx(b.meanR), paper: fx(p.meanR) },
    { metric: 'Median R', backtest: fx(b.medianR), paper: fx(p.medianR) },
    { metric: 'Win rate', backtest: pct(b.winRate), paper: pct(p.winRate) },
    { metric: 'Max drawdown (R)', backtest: b.n ? b.maxDrawdownR.toFixed(2) : '—', paper: p.n ? p.maxDrawdownR.toFixed(2) : '—' },
    { metric: 'Expectancy (R)', backtest: fx(b.expectancyR), paper: fx(p.expectancyR) },
    { metric: 'MAE (mean R, n)', backtest: b.mae.meanR === null ? 'not available' : `${fx(b.mae.meanR)} (${b.mae.n})`, paper: p.mae.meanR === null ? 'not available' : `${fx(p.mae.meanR)} (${p.mae.n})` },
    { metric: 'MFE (mean R, n)', backtest: b.mfe.meanR === null ? 'not available' : `${fx(b.mfe.meanR)} (${b.mfe.n})`, paper: p.mfe.meanR === null ? 'not available' : `${fx(p.mfe.meanR)} (${p.mfe.n})` },
    { metric: 'Execution assumptions', backtest: assumptions.backtest, paper: assumptions.paper },
    { metric: 'Data period', backtest: period(bp), paper: period(pp) },
    { metric: 'Data type', backtest: bp.dataType, paper: pp.dataType },
  ]
}

/**
 * Compare a paper dataset against a backtest dataset.
 *
 * Either dataset may be empty; the table still renders with the empty column
 * saying so, because "no paper trades yet" beside a full backtest column is
 * the honest picture at launch and hiding the row would hide it.
 */
export function comparePaperToBacktest(
  paper: Dataset,
  backtest: Dataset,
  opts: { minPerSide?: number; assumptions?: { backtest: string; paper: string } } = {},
): PaperVsBacktest {
  if (paper.provenance.source !== 'PAPER') throw new Error(`the paper side must be a PAPER dataset, got ${paper.provenance.source}`)
  if (backtest.provenance.source !== 'BACKTEST') throw new Error(`the backtest side must be a BACKTEST dataset, got ${backtest.provenance.source}`)
  const minPerSide = opts.minPerSide ?? SAMPLE_BARS.insufficient
  const assumptions = opts.assumptions ?? { backtest: 'realistic fill model', paper: 'realistic fill model against the live book' }
  const pt = tradesOf(paper)
  const bt = tradesOf(backtest)
  const ps = statsOf(pt)
  const bs = statsOf(bt)
  const rows = rowsOf(bs, ps, backtest.provenance, paper.provenance, assumptions)
  const caveats = [
    'The backtest column is SIMULATED. The paper column is live market data with simulated execution. Neither is real-money performance.',
    'DIFFERENT names a measured gap and its direction. It does not assert a cause and does not mean the strategy has degraded or improved.',
    `The comparison needs at least ${minPerSide} trades on each side; below that it says INSUFFICIENT SAMPLE and nothing else.`,
  ]

  if (ps.n < minPerSide || bs.n < minPerSide) {
    return {
      backtest: backtest.provenance, paper: paper.provenance, rows, verdict: 'INSUFFICIENT SAMPLE', deltaR: null, ci95: null,
      thresholds: { minPerSide, interval: '95% Welch t-interval on the difference of means' },
      note: ps.n === 0
        ? `No paper trades yet. The backtest column is a simulation to compare against once paper has ${minPerSide} or more trades.`
        : `Paper has ${ps.n} and the backtest has ${bs.n}; ${minPerSide} on each side is the minimum before the difference can be measured.`,
      caveats,
    }
  }
  const sp = sampleSd(pt.map((r) => r.rMultiple as number))
  const sb = sampleSd(bt.map((r) => r.rMultiple as number))
  if (sp === null || sb === null || ps.meanR === null || bs.meanR === null) {
    return { backtest: backtest.provenance, paper: paper.provenance, rows, verdict: 'INSUFFICIENT SAMPLE', deltaR: null, ci95: null, thresholds: { minPerSide, interval: '95% Welch t-interval on the difference of means' }, note: 'Not enough variation on one side to measure a difference.', caveats }
  }
  const vp = sp ** 2 / ps.n, vb = sb ** 2 / bs.n
  const se = Math.sqrt(vp + vb)
  const df = se > 0 ? (vp + vb) ** 2 / ((vp ** 2) / (ps.n - 1) + (vb ** 2) / (bs.n - 1)) : 1
  const delta = ps.meanR - bs.meanR
  const t = tCritical95(df)
  const ci95 = { lo: delta - t * se, hi: delta + t * se }
  const aligned = ci95.lo <= 0 && ci95.hi >= 0
  return {
    backtest: backtest.provenance, paper: paper.provenance, rows,
    verdict: aligned ? 'ALIGNED' : 'DIFFERENT',
    deltaR: delta, ci95,
    thresholds: { minPerSide, interval: '95% Welch t-interval on the difference of means' },
    note: aligned
      ? `Paper is ${fx(delta)}R per trade relative to the backtest, and the plausible range for that gap (${fx(ci95.lo)}R to ${fx(ci95.hi)}R) includes zero. The two are consistent with each other at this sample.`
      : `Paper is ${fx(delta)}R per trade relative to the backtest, and the plausible range for that gap (${fx(ci95.lo)}R to ${fx(ci95.hi)}R) excludes zero. The gap is measurable; its cause is not asserted here.`,
    caveats,
  }
}

export function renderComparison(c: PaperVsBacktest): string {
  const w = Math.max(...c.rows.map((r) => r.metric.length)) + 2
  const L: string[] = []
  L.push(`PAPER VS BACKTEST — verdict: ${c.verdict}`)
  L.push(`  BACKTEST: ${c.backtest.label}`)
  L.push(`  PAPER:    ${c.paper.label}`)
  L.push('')
  L.push(`  ${'metric'.padEnd(w)}${'BACKTEST'.padEnd(36)}PAPER`)
  for (const r of c.rows) L.push(`  ${r.metric.padEnd(w)}${r.backtest.padEnd(36)}${r.paper}`)
  L.push('')
  L.push(`  ${c.note}`)
  for (const v of c.caveats) L.push(`  • ${v}`)
  return L.join('\n')
}
