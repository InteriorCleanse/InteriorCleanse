/**
 * Multi-timeframe intelligence (Phase 22D).
 *
 * Higher-timeframe CONTEXT is kept visibly separate from EXECUTION-timeframe
 * structure, because they answer different questions: the weekly high says
 * where the market might be heading for, the 5m break says what is happening
 * now. Conflating them is how people talk themselves into trades.
 *
 * Three honesty rules:
 *
 *  1. TIMEFRAMES ARE DISCOVERED, NOT ASSUMED. A higher timeframe is offered
 *     only when the stored candles actually support it (enough completed bars).
 *     Where they do not, it is reported UNAVAILABLE — never synthesised.
 *  2. NO PARALLEL MODEL. Higher-timeframe swings are produced by the ENGINE'S
 *     OWN `SwingTracker`, run over aggregated candles. Previous-period highs and
 *     lows are plain max/min over real candles — arithmetic, not a second
 *     opinion. Nothing here re-implements structure, gaps or strategies.
 *  3. NO LOOK-AHEAD. A period's high/low is knowable only once that period has
 *     CLOSED, and an aggregated swing only once the tracker confirms it. Both
 *     are recorded in `knownAt`, not assumed away.
 */

import type { Candle } from '../types.ts'
import { SwingTracker } from '../structure.ts'
import { makeAnnotation, sortAnnotations } from './types.ts'
import type { ChartAnnotation, AnnotationType } from './types.ts'

/** Minutes per interval label, for the intervals this project understands. */
export const INTERVAL_MINUTES: Record<string, number> = {
  '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30,
  '1h': 60, '4h': 240, '1d': 1440, '1w': 10080,
}

/** The ladder, coarsest first. Only those with real data are ever used. */
export const HTF_LADDER = ['1w', '1d', '4h', '1h', '15m', '5m', '1m'] as const

export type TimeframeAvailability = {
  timeframe: string
  minutes: number
  /** How many complete aggregated bars the stored candles support. */
  bars: number
  available: boolean
  note: string
}

/**
 * Aggregate candles into a coarser timeframe. Buckets are anchored to the epoch
 * so the same candles always produce the same bars. A bucket is emitted only
 * when it is COMPLETE — a half-formed higher-timeframe bar would be a small
 * look-ahead lie about where the period closed.
 */
export function aggregateCandles(candles: Candle[], targetMinutes: number, anchorMs = 0): Candle[] {
  if (targetMinutes <= 0 || !candles.length) return []
  const ms = targetMinutes * 60_000
  const byBucket = new Map<number, Candle[]>()
  for (const c of candles) {
    const b = Math.floor((c.openTime - anchorMs) / ms) * ms + anchorMs
    const list = byBucket.get(b)
    if (list) list.push(c); else byBucket.set(b, [c])
  }
  const out: Candle[] = []
  for (const bucket of [...byBucket.keys()].sort((a, b) => a - b)) {
    const group = byBucket.get(bucket)!.slice().sort((a, b) => a.openTime - b.openTime)
    const last = group[group.length - 1]
    // Complete only when the group's final candle closes at/after the bucket's end.
    if (last.closeTime < bucket + ms - 1) continue
    out.push({
      openTime: bucket,
      closeTime: bucket + ms - 1,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: last.close,
      volume: group.reduce((s, c) => s + c.volume, 0),
    })
  }
  return out
}

/**
 * Which higher timeframes the stored candles can actually support. `minBars` is
 * the floor below which a timeframe is not worth drawing (and is reported as
 * such rather than drawn thinly).
 */
export function availableTimeframes(candles: Candle[], baseInterval: string, minBars = 3): TimeframeAvailability[] {
  const baseMin = INTERVAL_MINUTES[baseInterval] ?? 0
  const out: TimeframeAvailability[] = []
  for (const tf of HTF_LADDER) {
    const minutes = INTERVAL_MINUTES[tf]
    if (!minutes || (baseMin > 0 && minutes < baseMin)) continue // never "upsample" below the feed
    const bars = aggregateCandles(candles, minutes).length
    const available = bars >= minBars
    out.push({
      timeframe: tf, minutes, bars, available,
      note: available
        ? `${bars} complete ${tf} bars from the stored candles.`
        : `UNAVAILABLE: only ${bars} complete ${tf} bar(s) in the stored candles; at least ${minBars} are needed. Nothing is synthesised.`,
    })
  }
  return out
}

/** Which band an annotation belongs to, relative to the execution timeframe. */
export type TimeframeBand = 'htf-context' | 'execution'

export function bandFor(timeframe: string, executionTimeframe: string): TimeframeBand {
  const a = INTERVAL_MINUTES[timeframe] ?? 0
  const b = INTERVAL_MINUTES[executionTimeframe] ?? 0
  return a > b ? 'htf-context' : 'execution'
}

/** Split a mixed annotation set into the two bands the UI shows separately. */
export function splitByBand(list: ChartAnnotation[], executionTimeframe: string): { htfContext: ChartAnnotation[]; execution: ChartAnnotation[] } {
  const htfContext: ChartAnnotation[] = []
  const execution: ChartAnnotation[] = []
  for (const a of list) (bandFor(a.timeframe, executionTimeframe) === 'htf-context' ? htfContext : execution).push(a)
  return { htfContext, execution }
}

// ---------------------------------------------------------------
// Higher-timeframe annotations
// ---------------------------------------------------------------

/**
 * Weeks are anchored to **Monday 00:00 UTC**, not to the epoch. The Unix epoch
 * was a Thursday, so plain epoch bucketing would produce "weeks" running
 * Thursday→Wednesday, which is not what anyone means by a weekly high. This is a
 * VISUALIZATION choice and is documented as such; the engine has no weekly
 * concept for it to disagree with.
 */
export const WEEK_ANCHOR_MS = 4 * 86_400_000 // 1970-01-05 was the first Monday

/** The previous COMPLETE period's high and low, and when each became knowable. */
type PeriodExtreme = { high: number; low: number; periodStart: number; periodEnd: number }

function previousCompletePeriod(candles: Candle[], minutes: number, asOf: number, anchorMs = 0): PeriodExtreme | null {
  const bars = aggregateCandles(candles, minutes, anchorMs)
  // The last bar whose period ENDED at or before `asOf` — the previous complete one.
  const done = bars.filter((b) => b.closeTime <= asOf)
  const prev = done[done.length - 1]
  if (!prev) return null
  return { high: prev.high, low: prev.low, periodStart: prev.openTime, periodEnd: prev.closeTime }
}

export type MtfInput = {
  symbol: string
  executionTimeframe: string
  engineVersion: string
  candles: Candle[]
  /** The moment being analysed; everything is judged knowable relative to this. */
  asOf: number
  regime?: string | null
  now?: number
}

/**
 * Higher-timeframe context annotations: previous week / previous day extremes,
 * and the engine's own swing structure read on the aggregated bars.
 *
 * Every one is stamped `knownAt = periodEnd` (or the confirming bar's close), so
 * a replay at an earlier cursor simply will not see it.
 */
export function annotateHigherTimeframes(input: MtfInput): ChartAnnotation[] {
  const now = input.now ?? Date.now()
  const base = { symbol: input.symbol, engineVersion: input.engineVersion, regime: input.regime ?? null }
  const out: ChartAnnotation[] = []
  const avail = availableTimeframes(input.candles, input.executionTimeframe)

  // --- previous complete WEEK extremes -----------------------------------
  //
  // Deliberately WEEK ONLY. The previous DAY's high and low are owned by the
  // engine, which derives them on the ICT trading day that rolls at 18:00 ET
  // (`config.ict.dayStartHour`) and publishes them as `pdh`/`pdl` levels —
  // already annotated by `annotateLiquidity`. Computing them here from
  // UTC-midnight buckets produced a SECOND, DIFFERENT previous-day line (measured
  // at $279.56 away from the engine's on real data), which is precisely the
  // "second trading engine" failure this layer exists to avoid. The engine is
  // authoritative; we do not recompute what it already knows.
  //
  // The week is genuinely additive: the engine has no weekly concept at all, so
  // there is nothing here to contradict. Its anchoring is a documented
  // visualization choice (see WEEK_ANCHOR_MS).
  const periods: Array<{ tf: string; minutes: number; hi: AnnotationType; lo: AnnotationType; label: string; anchor: number }> = [
    { tf: '1w', minutes: INTERVAL_MINUTES['1w'], hi: 'previous-week-high', lo: 'previous-week-low', label: 'week', anchor: WEEK_ANCHOR_MS },
  ]
  for (const p of periods) {
    const ok = avail.find((x) => x.timeframe === p.tf)?.available
    if (!ok) continue
    const ext = previousCompletePeriod(input.candles, p.minutes, input.asOf, p.anchor)
    if (!ext) continue
    for (const side of ['high', 'low'] as const) {
      out.push(makeAnnotation({
        ...base,
        timeframe: p.tf,
        annotationType: side === 'high' ? p.hi : p.lo,
        layer: 'liquidity',
        source: 'liquidity',
        sourceFeature: `htf:${p.tf}:${side}`,
        eventTime: ext.periodStart,
        // Knowable only once the period closed.
        knownAt: ext.periodEnd,
        price: side === 'high' ? ext.high : ext.low,
        direction: side === 'high' ? 'bearish' : 'bullish',
        dataQuality: 'REAL',
        rationale: `Previous ${p.label} ${side} at $${(side === 'high' ? ext.high : ext.low).toFixed(2)}, from the ${p.tf} bar (weeks anchored Monday 00:00 UTC) that closed ${new Date(ext.periodEnd).toISOString()}. Higher-timeframe context aggregated for display, not an execution signal, and not an engine level.`,
        lifecycleStatus: 'ACTIVE',
        invalidationCondition: `A ${p.tf} close beyond this level retires it as context.`,
        discriminator: `${p.tf}:${ext.periodStart}`,
      }, now))
    }
  }

  // --- higher-timeframe swing structure, via the ENGINE's own tracker -----
  for (const tf of ['1d', '4h', '1h'] as const) {
    const a = avail.find((x) => x.timeframe === tf)
    if (!a?.available) continue
    const bars = aggregateCandles(input.candles, a.minutes).filter((b) => b.closeTime <= input.asOf)
    if (bars.length < 8) continue
    const tracker = new SwingTracker()
    for (let i = 0; i < bars.length; i++) {
      const s = tracker.add(bars, i)
      if (!s) continue
      const type: AnnotationType =
        s.label === 'HH' ? 'higher-high' : s.label === 'HL' ? 'higher-low'
        : s.label === 'LH' ? 'lower-high' : s.label === 'LL' ? 'lower-low'
        : s.kind === 'high' ? 'swing-high' : 'swing-low'
      out.push(makeAnnotation({
        ...base,
        timeframe: tf,
        annotationType: type,
        layer: 'structure',
        source: 'swing-tracker',
        sourceFeature: `htf-swing:${tf}`,
        eventTime: s.time,
        // The tracker confirms a swing only on the LATER bar `i` — that is when it became knowable.
        knownAt: bars[i].closeTime,
        price: s.price,
        direction: s.kind === 'high' ? 'bearish' : 'bullish',
        dataQuality: 'REAL',
        rationale: `${tf} ${s.label} at $${s.price.toFixed(2)} — higher-timeframe structure, confirmed ${Math.round((bars[i].closeTime - s.time) / 60000)} minutes after it printed.`,
        lifecycleStatus: 'ACTIVE',
        discriminator: `${tf}:${s.time}`,
      }, now))
    }
  }
  return sortAnnotations(out)
}

/** The availability report the UI shows so a missing timeframe is visible, not silent. */
export function timeframeReport(candles: Candle[], executionTimeframe: string): { executionTimeframe: string; timeframes: TimeframeAvailability[] } {
  return { executionTimeframe, timeframes: availableTimeframes(candles, executionTimeframe) }
}
