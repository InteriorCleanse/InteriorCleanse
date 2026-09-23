/**
 * DATA QUALITY — bad data must never quietly become trading evidence.
 *
 * Every number the analyst layer shows rests on two things: the candles the
 * engine saw, and the records it wrote. This module checks both over the
 * window a dataset spans and says, in one word, whether the evidence built on
 * them can be trusted: OK or DEGRADED.
 *
 * The thresholds are stated here and printed with the verdict:
 *
 *   missing candles        > 2% of the window's expected bars   → DEGRADED
 *   duplicate candles      any                                  → DEGRADED
 *   timestamp anomalies    any                                  → DEGRADED
 *   corrupt records        any                                  → DEGRADED
 *   stale feed             candle age over the configured max   → DEGRADED
 *   missing regime         > 50% of trades                      → DEGRADED
 *   missing snapshot       any                                  → warn (older records legitimately have none)
 *   missing order flow     any                                  → warn
 *   unresolved excursions  any                                  → info
 *
 * A DEGRADED verdict does not delete anything. It is a label the dashboard must
 * print above the tables it qualifies, so a reader knows the numbers beneath
 * were built on a window with holes in it.
 *
 * Pure over what it is given. The server hands it candles from the store; the
 * checks themselves never touch the store, the feed or the engine.
 */

import { findGaps } from '../data/candleStore.ts'
import type { Candle } from '../types.ts'
import type { Dataset } from './records.ts'

export type IssueKind =
  | 'missing-candles' | 'duplicate-candles' | 'timestamp-anomaly' | 'stale-feed'
  | 'corrupt-record' | 'incomplete-record' | 'missing-regime' | 'missing-snapshot' | 'missing-order-flow' | 'unresolved-excursion'

export type Severity = 'info' | 'warn' | 'degraded'

export type QualityIssue = { kind: IssueKind; severity: Severity; count: number; detail: string }

export type CandleQuality = {
  window: { from: number; to: number } | null
  stepMs: number
  expected: number
  present: number
  missing: number
  /** The share of expected bars that are missing, 0–1. */
  missingShare: number
  gaps: Array<{ from: number; to: number; bars: number }>
  duplicates: number
  anomalies: Array<{ openTime: number; reason: string }>
}

export type RecordQuality = {
  total: number
  trades: number
  missed: number
  corrupt: number
  incomplete: number
  missingRegime: number
  missingSnapshot: number
  missingOrderFlow: number
  unresolvedExcursions: number
}

export type DataQualityReport = {
  verdict: 'OK' | 'DEGRADED'
  candles: CandleQuality
  records: RecordQuality
  feed: { ageSec: number | null; maxAgeSec: number | null; stale: boolean | null }
  issues: QualityIssue[]
  thresholds: typeof THRESHOLDS
  note: string
}

export const THRESHOLDS = {
  missingCandleShare: 0.02,
  missingRegimeShare: 0.5,
} as const

// ---------------------------------------------------------------
// Candles
// ---------------------------------------------------------------

/**
 * Check a run of candles against the grid they should sit on.
 *
 * The step is given, not inferred: a data-quality check that inferred the
 * grid from the data would be blind to exactly the corruption it exists to
 * find. Duplicates are the same open time twice; anomalies are bars that are
 * off the grid, overlap their neighbour, or carry a price that is not a price.
 */
export function candleQuality(rows: Candle[], stepMs: number, from: number, to: number): CandleQuality {
  const sorted = [...rows].sort((a, b) => a.openTime - b.openTime)
  const window = from > 0 && to >= from ? { from, to } : null
  const anomalies: CandleQuality['anomalies'] = []
  let duplicates = 0
  const seen = new Set<number>()
  const origin = sorted.length ? sorted[0].openTime - (sorted[0].openTime % stepMs) : 0
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]
    if (seen.has(c.openTime)) { duplicates++; continue }
    seen.add(c.openTime)
    if (!Number.isFinite(c.openTime) || c.openTime <= 0) { anomalies.push({ openTime: c.openTime, reason: 'open time is not a timestamp' }); continue }
    if ((c.openTime - origin) % stepMs !== 0) anomalies.push({ openTime: c.openTime, reason: `open time is off the ${stepMs / 60_000}-minute grid` })
    if (!(c.closeTime > c.openTime)) anomalies.push({ openTime: c.openTime, reason: 'close time is not after open time' })
    if (i + 1 < sorted.length && c.closeTime >= sorted[i + 1].openTime && sorted[i + 1].openTime !== c.openTime) anomalies.push({ openTime: c.openTime, reason: 'overlaps the next bar' })
    const prices = [c.open, c.high, c.low, c.close]
    if (prices.some((p) => !Number.isFinite(p) || p <= 0)) anomalies.push({ openTime: c.openTime, reason: 'a price is not a positive number' })
    else if (c.high < c.low || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) anomalies.push({ openTime: c.openTime, reason: 'high/low do not contain open/close' })
  }
  const expected = window ? Math.floor((to - Math.ceil(from / stepMs) * stepMs) / stepMs) + 1 : 0
  const gapRanges = window ? findGaps(seen, stepMs, from, to) : []
  const gaps = gapRanges.map((g) => ({ from: g.from, to: g.to, bars: Math.round((g.to - g.from) / stepMs) + 1 }))
  const missing = gaps.reduce((s, g) => s + g.bars, 0)
  return {
    window, stepMs, expected, present: seen.size, missing,
    missingShare: expected > 0 ? missing / expected : 0,
    gaps, duplicates, anomalies,
  }
}

// ---------------------------------------------------------------
// Records
// ---------------------------------------------------------------

export function recordQuality(d: Dataset): RecordQuality {
  const rs = d.records
  const usable = rs.filter((r) => !r.corrupt)
  const trades = usable.filter((r) => !r.missed)
  return {
    total: rs.length,
    trades: trades.length,
    missed: usable.length - trades.length,
    corrupt: rs.length - usable.length,
    // A taken trade with no fill time, no exit or no R is a record the engine wrote only half of.
    incomplete: trades.filter((r) => r.filledAt === null || r.exit === null || r.rMultiple === null || r.closedAt === null).length,
    missingRegime: trades.filter((r) => r.regime === null).length,
    missingSnapshot: trades.filter((r) => r.source === 'PAPER' && r.engineVersion === null).length,
    missingOrderFlow: trades.filter((r) => r.source === 'PAPER' && r.spreadPct === null).length,
    unresolvedExcursions: trades.filter((r) => r.mae.status === 'NOT COMPUTED').length,
  }
}

// ---------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------

export function dataQualityReport(input: {
  dataset: Dataset
  candles: Candle[]
  stepMs: number
  /** The window the candles should cover; defaults to the dataset's period. */
  window?: { from: number; to: number } | null
  feed?: { ageSec: number | null; maxAgeSec: number } | null
}): DataQualityReport {
  const window = input.window === undefined ? input.dataset.provenance.period : input.window
  const candles = candleQuality(input.candles, input.stepMs, window?.from ?? 0, window?.to ?? 0)
  const records = recordQuality(input.dataset)
  const feedStale = input.feed && input.feed.ageSec !== null ? input.feed.ageSec > input.feed.maxAgeSec : null
  const issues: QualityIssue[] = []
  const add = (kind: IssueKind, severity: Severity, count: number, detail: string) => { if (count > 0) issues.push({ kind, severity, count, detail }) }

  add('missing-candles', candles.missingShare > THRESHOLDS.missingCandleShare ? 'degraded' : 'warn', candles.missing,
    `${candles.missing} of ${candles.expected} expected bars are missing (${(candles.missingShare * 100).toFixed(1)}%) across ${candles.gaps.length} gap${candles.gaps.length === 1 ? '' : 's'}${candles.missingShare > THRESHOLDS.missingCandleShare ? ` — over the ${THRESHOLDS.missingCandleShare * 100}% bar` : ''}.`)
  add('duplicate-candles', 'degraded', candles.duplicates, `${candles.duplicates} bar${candles.duplicates === 1 ? '' : 's'} appear more than once.`)
  add('timestamp-anomaly', 'degraded', candles.anomalies.length, `${candles.anomalies.length} bar${candles.anomalies.length === 1 ? '' : 's'} with a bad timestamp or price: ${[...new Set(candles.anomalies.map((a) => a.reason))].join('; ')}.`)
  if (feedStale) add('stale-feed', 'degraded', 1, `The latest candle is ${input.feed!.ageSec}s old against a ${input.feed!.maxAgeSec}s limit.`)
  add('corrupt-record', 'degraded', records.corrupt, `${records.corrupt} record${records.corrupt === 1 ? '' : 's'} could not be read and are excluded from every statistic.`)
  add('incomplete-record', 'degraded', records.incomplete, `${records.incomplete} taken trade${records.incomplete === 1 ? '' : 's'} lack a fill time, exit or R.`)
  add('missing-regime', records.trades > 0 && records.missingRegime / records.trades > THRESHOLDS.missingRegimeShare ? 'degraded' : 'warn', records.missingRegime,
    `${records.missingRegime} of ${records.trades} trades carry no decision-time regime; regime tables leave them out.`)
  add('missing-snapshot', 'warn', records.missingSnapshot, `${records.missingSnapshot} paper trade${records.missingSnapshot === 1 ? '' : 's'} predate the decision-time snapshot; volatility, news and fused-score cuts cannot include them.`)
  add('missing-order-flow', 'warn', records.missingOrderFlow, `${records.missingOrderFlow} paper trade${records.missingOrderFlow === 1 ? '' : 's'} had no book quote at decision time.`)
  add('unresolved-excursion', 'info', records.unresolvedExcursions, `${records.unresolvedExcursions} trade${records.unresolvedExcursions === 1 ? '' : 's'} have not had MAE/MFE resolved from the candle store.`)

  const degraded = issues.some((i) => i.severity === 'degraded')
  const verdict = degraded ? 'DEGRADED' : 'OK'
  const note = records.total === 0
    ? `DATA QUALITY: ${verdict}. No records in this dataset; the candle window ${window ? 'was checked' : 'is empty'}.`
    : degraded
      ? `DATA QUALITY: DEGRADED. ${issues.filter((i) => i.severity === 'degraded').map((i) => i.detail).join(' ')} Evidence built on this window is qualified by these holes.`
      : `DATA QUALITY: OK. ${candles.expected ? `${candles.present} of ${candles.expected} bars present` : 'no candle window'}, ${records.trades} trades readable${issues.length ? `; ${issues.length} advisory note${issues.length === 1 ? '' : 's'}` : ''}.`
  return {
    verdict, candles, records,
    feed: { ageSec: input.feed?.ageSec ?? null, maxAgeSec: input.feed?.maxAgeSec ?? null, stale: feedStale },
    issues, thresholds: THRESHOLDS, note,
  }
}
