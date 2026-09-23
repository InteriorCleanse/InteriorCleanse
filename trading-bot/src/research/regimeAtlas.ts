/**
 * THE REGIME ATLAS — where each strategy family's results have REPEATED across
 * similar conditions, and where they have not.
 *
 * Different families do different things in different conditions: trend and
 * breakout families in expansions, mean-reversion in quiet ranges, and most
 * families struggling in the noisy middle. The atlas maps recorded results by
 * family × volatility and family × regime, keeps PAPER and BACKTEST apart, and
 * puts the sample size in every cell. A cell under the bar shows its count and
 * nothing else.
 *
 * "Repeats" has a stated meaning here: the family's mean R has the same sign,
 * with a 95% interval that excludes zero, in at least two ADJACENT condition
 * buckets each at or above the early-sample bar. That is a description of the
 * record, not a claim about the future, and it changes nothing in the engine —
 * the engine's own regime weights are fixed configuration in fusion/weights.ts.
 *
 * Pure over the dataset.
 */

import { SAMPLE_BARS, crossTable } from '../analyst/cohorts.ts'
import type { Cohort, CohortDimension } from '../analyst/cohorts.ts'
import type { Dataset } from '../analyst/records.ts'

/** The order conditions are laid out in, so "adjacent" means something. */
export const VOLATILITY_ORDER = ['quiet', 'normal', 'wild'] as const
export const REGIME_ORDER = ['ranging', 'transition', 'trending-up', 'trending-down', 'breakout'] as const

export type AtlasCell = {
  family: string
  condition: string
  n: number
  status: Cohort['stats']['status']
  meanR: number | null
  ci95: Cohort['stats']['ci95']
  winRate: number | null
  /** True only when n clears the early bar and the interval excludes zero. */
  established: boolean
  sign: 'positive' | 'negative' | null
  recordIds: string[]
}

export type FamilyRow = {
  family: string
  cells: AtlasCell[]
  /** Conditions where the sign repeated in adjacent, established cells. */
  repeats: Array<{ sign: 'positive' | 'negative'; conditions: string[] }>
  /** Conditions where the family has an established NEGATIVE mean — the "dies here" of the map. */
  struggles: string[]
  note: string
}

export type RegimeAtlas = {
  dimension: 'volatility' | 'regime'
  conditions: string[]
  source: Dataset['provenance']['source']
  dataType: Dataset['provenance']['dataType']
  trades: number
  rows: FamilyRow[]
  notes: string[]
}

function cellOf(c: Cohort, family: string, condition: string): AtlasCell {
  const s = c.stats
  const established = s.n >= SAMPLE_BARS.early && s.ci95 !== null && (s.ci95.lo > 0 || s.ci95.hi < 0)
  const sign = established ? (s.ci95!.lo > 0 ? 'positive' : 'negative') : null
  return { family, condition, n: s.n, status: s.status, meanR: s.n >= SAMPLE_BARS.insufficient ? s.meanR : null, ci95: s.n >= SAMPLE_BARS.insufficient ? s.ci95 : null, winRate: s.n >= SAMPLE_BARS.insufficient ? s.winRate : null, established, sign, recordIds: c.recordIds }
}

function repeatsIn(cells: AtlasCell[], order: readonly string[]): FamilyRow['repeats'] {
  const byCond = new Map(cells.map((c) => [c.condition, c]))
  const out: FamilyRow['repeats'] = []
  let run: AtlasCell[] = []
  const flush = () => { if (run.length >= 2) out.push({ sign: run[0].sign!, conditions: run.map((c) => c.condition) }); run = [] }
  for (const cond of order) {
    const c = byCond.get(cond)
    if (c && c.established && (run.length === 0 || run[run.length - 1].sign === c.sign)) run.push(c)
    else { flush(); if (c && c.established) run.push(c) }
  }
  flush()
  return out
}

export function regimeAtlas(d: Dataset, dimension: 'volatility' | 'regime'): RegimeAtlas {
  const order = dimension === 'volatility' ? VOLATILITY_ORDER : REGIME_ORDER
  const t = crossTable(d, 'family' as CohortDimension, dimension as CohortDimension)
  const conditions = [...order].filter((c) => t.colKeys.includes(c))
  const rows: FamilyRow[] = t.rowKeys.map((family, i) => {
    const cells = conditions.map((cond) => cellOf(t.cells[i][t.colKeys.indexOf(cond)], family, cond))
    const repeats = repeatsIn(cells, order)
    const struggles = cells.filter((c) => c.established && c.sign === 'negative').map((c) => c.condition)
    const established = cells.filter((c) => c.established)
    const note = established.length === 0
      ? `No condition has an established result for ${family} yet (needs ${SAMPLE_BARS.early}+ trades and an interval clear of zero). Counts are shown; nothing is claimed.`
      : repeats.length
        ? `${family}: the sign repeated across ${repeats.map((r) => `${r.conditions.join(' → ')} (${r.sign})`).join('; ')}. A repeat across adjacent conditions is the atlas's bar for "this is where the family has worked", on this record.`
        : `${family}: ${established.length} condition(s) established but none adjacent to another with the same sign. One cell is a result; a repeat is a pattern.`
    return { family, cells, repeats, struggles, note }
  })
  const trades = t.cells.flat().reduce((a, c) => a + c.stats.n, 0)
  return {
    dimension, conditions, source: d.provenance.source, dataType: d.provenance.dataType, trades, rows,
    notes: [
      `Source: ${d.provenance.source} (${d.provenance.dataType}). PAPER and BACKTEST are never pooled here.`,
      `Cells under ${SAMPLE_BARS.insufficient} trades show their count only; "established" needs ${SAMPLE_BARS.early}+ trades and a 95% interval that excludes zero.`,
      'The engine\'s regime weighting is configuration; this map reads the record and changes nothing.',
      trades === 0 ? 'NOT ENOUGH DATA — no trades in this dataset.' : `${trades} trade(s) across ${t.rowKeys.length} famil${t.rowKeys.length === 1 ? 'y' : 'ies'} and ${conditions.length} condition(s).`,
    ],
  }
}

/** The plain-text rendering the API's ?format=text uses. */
export function renderAtlas(a: RegimeAtlas): string {
  const fx = (n: number | null) => (n === null ? '   —  ' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}R`.padStart(6))
  const lines = [`REGIME ATLAS · ${a.dimension.toUpperCase()} · ${a.source} · ${a.trades} trades`, ''.padEnd(16) + a.conditions.map((c) => c.padStart(14)).join('')]
  for (const r of a.rows) {
    lines.push(r.family.padEnd(16) + r.cells.map((c) => `${fx(c.meanR)} n=${String(c.n).padEnd(3)}`.padStart(14)).join(''))
  }
  lines.push('', ...a.rows.map((r) => `· ${r.note}`), '', ...a.notes.map((n) => `· ${n}`))
  return lines.join('\n')
}
