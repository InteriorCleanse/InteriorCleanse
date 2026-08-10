import type { Period } from '@/lib/metrics/engine'

/**
 * Period and comparison resolution.
 *
 * All arithmetic is UTC-anchored against an explicit `now`, never `new Date()`
 * read inside the function. Two reasons: the tenant's reporting timezone
 * decides what "today" means, and a function that reads the clock cannot be
 * tested for the month boundary that breaks it.
 */

export type PresetKey =
  | 'today'
  | 'yesterday'
  | 'last_7'
  | 'last_30'
  | 'month_to_date'
  | 'quarter_to_date'
  | 'year_to_date'

export type ComparisonKey = 'previous_period' | 'previous_year' | 'none'

export const PRESET_LABELS: Record<PresetKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7: 'Last 7 days',
  last_30: 'Last 30 days',
  month_to_date: 'Month to date',
  quarter_to_date: 'Quarter to date',
  year_to_date: 'Year to date',
}

export const COMPARISON_LABELS: Record<ComparisonKey, string> = {
  previous_period: 'Previous period',
  previous_year: 'Previous year',
  none: 'No comparison',
}

const DAY = 86_400_000

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function endOfDay(d: Date): Date {
  return new Date(startOfDay(d).getTime() + DAY - 1)
}

export function resolvePreset(preset: PresetKey, now: Date, timezone = 'UTC'): Period {
  const today = startOfDay(now)

  const range = (start: Date, end: Date): Period => ({
    start,
    end,
    label: PRESET_LABELS[preset],
    timezone,
  })

  switch (preset) {
    case 'today':
      return range(today, endOfDay(now))
    case 'yesterday': {
      const y = new Date(today.getTime() - DAY)
      return range(y, endOfDay(y))
    }
    case 'last_7':
      // Inclusive of today, so "last 7 days" is 7 days of data, not 8.
      return range(new Date(today.getTime() - 6 * DAY), endOfDay(now))
    case 'last_30':
      return range(new Date(today.getTime() - 29 * DAY), endOfDay(now))
    case 'month_to_date':
      return range(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), endOfDay(now))
    case 'quarter_to_date': {
      const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3
      return range(new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1)), endOfDay(now))
    }
    case 'year_to_date':
      return range(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), endOfDay(now))
  }
}

/**
 * The comparison window for a period.
 *
 * `previous_period` is the immediately preceding window of the same length, so
 * a 7-day range compares against the 7 days before it — not the same dates last
 * month. `previous_year` shifts by a calendar year, which keeps day-of-week
 * alignment roughly intact for seasonal businesses.
 */
export function resolveComparison(period: Period, comparison: ComparisonKey): Period | null {
  if (comparison === 'none') return null

  if (comparison === 'previous_period') {
    const span = period.end.getTime() - period.start.getTime()
    const end = new Date(period.start.getTime() - 1)
    return {
      start: new Date(end.getTime() - span),
      end,
      label: `Previous ${describeSpan(span)}`,
      timezone: period.timezone,
    }
  }

  const shift = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))

  return {
    start: shift(period.start),
    end: shift(period.end),
    label: 'Same period last year',
    timezone: period.timezone,
  }
}

function describeSpan(ms: number): string {
  const days = Math.max(1, Math.round((ms + 1) / DAY))
  if (days === 1) return 'day'
  if (days === 7) return '7 days'
  if (days >= 28 && days <= 31) return 'month'
  return `${days} days`
}

// ── Change between two values ───────────────────────────────────────────────

export type Change = {
  /** Absolute difference in the metric's own units. */
  absolute: number
  /** Fractional change. Null when the baseline is zero — see below. */
  percent: number | null
  direction: 'up' | 'down' | 'flat'
  /**
   * Set when a percentage cannot be expressed. Growth from zero is infinite,
   * not "100% up" — reporting a number there is a lie that reads as insight.
   */
  unavailableReason?: string
}

export function computeChange(current: number, previous: number): Change {
  const absolute = current - previous
  const direction = absolute === 0 ? 'flat' : absolute > 0 ? 'up' : 'down'

  if (previous === 0) {
    return {
      absolute,
      percent: null,
      direction,
      unavailableReason:
        current === 0 ? 'No activity in either period' : 'No activity in the comparison period',
    }
  }

  // Denominator is the magnitude, so a move from -100 to -50 reads as an
  // improvement of 50% rather than a nonsensical negative percentage.
  return { absolute, percent: absolute / Math.abs(previous), direction }
}

/**
 * Whether an increase is good. Revenue up is good; refund rate up is not, and a
 * dashboard that paints both green is worse than one with no colour at all.
 */
const LOWER_IS_BETTER = new Set(['refund_rate', 'cac', 'ad_spend'])

export function changeSentiment(
  metricKey: string,
  direction: Change['direction'],
): 'positive' | 'negative' | 'neutral' {
  if (direction === 'flat') return 'neutral'
  const good = LOWER_IS_BETTER.has(metricKey) ? direction === 'down' : direction === 'up'
  return good ? 'positive' : 'negative'
}

/** Buckets a period into day/week/month for time-series granularity. */
export type Granularity = 'day' | 'week' | 'month'

export function defaultGranularity(period: Period): Granularity {
  const days = (period.end.getTime() - period.start.getTime()) / DAY
  if (days <= 31) return 'day'
  if (days <= 200) return 'week'
  return 'month'
}

export function bucketStart(date: Date, granularity: Granularity): Date {
  if (granularity === 'day') return startOfDay(date)
  if (granularity === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  }
  // ISO week: Monday.
  const day = (date.getUTCDay() + 6) % 7
  return new Date(startOfDay(date).getTime() - day * DAY)
}

/** Every bucket in the period, including empty ones — a gap is data, not absence. */
export function bucketsFor(period: Period, granularity: Granularity): Date[] {
  const buckets: Date[] = []
  let cursor = bucketStart(period.start, granularity)

  while (cursor.getTime() <= period.end.getTime()) {
    buckets.push(cursor)
    if (granularity === 'day') cursor = new Date(cursor.getTime() + DAY)
    else if (granularity === 'week') cursor = new Date(cursor.getTime() + 7 * DAY)
    else cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }

  return buckets
}
