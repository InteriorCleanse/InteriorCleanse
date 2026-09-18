/**
 * CALENDAR HISTORY — remembering that this release has happened before.
 *
 * The news brain shipped with a caveat written into it by hand:
 *
 *   "The window study measures the CLOCK, not the event: it is what this symbol
 *    usually does at that time of day, across all days in the history — not what
 *    it did on past instances of this specific release."
 *
 * That is a real limitation, not a disclaimer. "08:30 ET is usually busy" and
 * "CPI moves this instrument" are different claims, and only the second one is
 * about the event. The reason the module could only make the first is that
 * nothing stored what the calendar said yesterday: the feed carries the current
 * week and is overwritten on every refresh, so the moment CPI printed, the fact
 * that it had ever printed was gone.
 *
 * This module is the memory. Every calendar refresh is folded into a per-release
 * series, so after a few months there is something real to measure against:
 * where the last six CPI prints landed, what was forecast, and — once the feed
 * fills it in — what actually came out.
 *
 * TWO RULES IT DOES NOT BEND
 *
 *   1. It records what the feed said. It does not invent an instance that was
 *      never seen, and it will not overwrite a recorded `actual` with a blank
 *      one because a later refresh dropped the field.
 *   2. It stores and returns. No study, no verdict, no direction — those live in
 *      the brain, which stays pure and takes this as input.
 *
 * Nothing here reaches the engine.
 */

import { store } from '../store.ts'
import type { CalendarEvent } from '../types.ts'

/** kv key prefix. One row per release series. */
const PREFIX = 'calhist:'

/**
 * A rescheduled release is the same instance, not a new one. Real instances of
 * the same series are weeks apart (monthly) or a week apart (claims), so six
 * hours is comfortably below the gap and comfortably above any reschedule.
 */
const MERGE_WINDOW_MS = 6 * 3_600_000

/** ~4 years of a monthly release, ~1 year of a weekly one. */
const MAX_INSTANCES = 48

/** Beyond this the regime has changed enough that the instance is history, not evidence. */
const RETAIN_MS = 800 * 86_400_000

export type CalendarInstance = {
  /** When the release landed (or is scheduled to), as last seen on the feed. */
  time: number
  impact: CalendarEvent['impact']
  forecast: string
  previous: string
  /** null until the feed fills it in. Never cleared once recorded. */
  actual: string | null
  firstSeen: number
  lastSeen: number
}

export type CalendarSeries = {
  series: string
  /** The most recent title the feed used for this series, for display. */
  title: string
  country: string
  instances: CalendarInstance[]
}

// ---------------------------------------------------------------
// Which release is this?
// ---------------------------------------------------------------

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december'

/** A token that says WHICH month/quarter a release covers, not WHAT it is. */
const QUALIFIER = new RegExp(`^(?:${MONTHS}|q[1-4]|h[12]|\\d{4})$`, 'i')

/**
 * A stable id for "this release", across the different ways feeds write it.
 *
 * The line this draws matters. "CPI (Aug)" and "CPI (Sep)" are two instances of
 * one series — the month is which one, not which release. But "Core CPI m/m" and
 * "CPI m/m" are genuinely different numbers, and so are "Prelim GDP" and "Final
 * GDP", so nothing that distinguishes a release is stripped. Getting this wrong
 * in the permissive direction would pool unrelated events into one series and
 * quietly inflate the sample count, which is the exact failure the sample
 * discipline elsewhere exists to prevent.
 */
export function seriesKey(country: string, title: string): string {
  const stripped = title.replace(/\(([^)]*)\)/g, (whole, inner: string) => {
    const words = inner.trim().split(/\s+/).filter(Boolean)
    return words.length > 0 && words.every((w) => QUALIFIER.test(w)) ? ' ' : whole
  })
  const words = stripped.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  // A trailing month or year is the same qualifier without the brackets.
  while (words.length > 1 && QUALIFIER.test(words[words.length - 1])) words.pop()
  return `${country.trim().toLowerCase()}:${words.join(' ')}`
}

// ---------------------------------------------------------------
// Folding a refresh into the record — pure, so it can be tested alone
// ---------------------------------------------------------------

const clean = (s: string | undefined | null): string => (typeof s === 'string' ? s.trim() : '')

/**
 * Merge one feed sighting into a series' instances.
 *
 * Returns the new list and whether anything actually changed, so a refresh that
 * says nothing new does not rewrite the row.
 */
export function mergeInstance(
  existing: CalendarInstance[],
  e: Pick<CalendarEvent, 'time' | 'impact' | 'forecast' | 'previous' | 'actual'>,
  now: number,
): { instances: CalendarInstance[]; changed: boolean } {
  if (!Number.isFinite(e.time)) return { instances: existing, changed: false }

  const actual = clean(e.actual) || null
  const forecast = clean(e.forecast)
  const previous = clean(e.previous)

  const idx = existing.findIndex((i) => Math.abs(i.time - e.time) <= MERGE_WINDOW_MS)
  let changed = false
  let out: CalendarInstance[]

  if (idx === -1) {
    out = [...existing, { time: e.time, impact: e.impact, forecast, previous, actual, firstSeen: now, lastSeen: now }]
    changed = true
  } else {
    const prev = existing[idx]
    const next: CalendarInstance = {
      ...prev,
      time: e.time,
      impact: e.impact,
      forecast: forecast || prev.forecast,
      previous: previous || prev.previous,
      // A later refresh that drops the field is a gap in the feed, not a
      // retraction. What was printed stays printed.
      actual: actual ?? prev.actual,
      lastSeen: now,
    }
    changed = next.time !== prev.time || next.impact !== prev.impact || next.forecast !== prev.forecast
      || next.previous !== prev.previous || next.actual !== prev.actual
    out = [...existing]
    out[idx] = next
  }

  const pruned = out
    .filter((i) => now - i.time <= RETAIN_MS)
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_INSTANCES)
  if (pruned.length !== out.length) changed = true
  return { instances: pruned, changed }
}

// ---------------------------------------------------------------
// The stored side
// ---------------------------------------------------------------

export function readSeries(key: string): CalendarSeries | null {
  const row = store().getJson<CalendarSeries>(PREFIX + key)
  if (!row || !Array.isArray(row.instances)) return null
  return row
}

/**
 * Fold a calendar refresh into the record.
 *
 * Called on every successful news fetch. It is deliberately cheap and
 * deliberately silent about failure at the call site — a history write is worth
 * less than the report it rode in on.
 */
export function recordCalendar(events: CalendarEvent[], now = Date.now()): { series: number; written: number } {
  const bySeries = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    if (!e.title || !Number.isFinite(e.time)) continue
    const key = seriesKey(e.country, e.title)
    bySeries.set(key, [...(bySeries.get(key) ?? []), e])
  }

  let written = 0
  for (const [key, group] of bySeries) {
    const prior = readSeries(key)
    let instances = prior?.instances ?? []
    let changed = false
    let title = prior?.title ?? group[0].title
    for (const e of group) {
      const r = mergeInstance(instances, e, now)
      instances = r.instances
      changed = changed || r.changed
      title = e.title
    }
    if (prior && prior.title !== title) changed = true
    if (!changed && prior) continue
    store().setJson(PREFIX + key, { series: key, title, country: group[0].country, instances } satisfies CalendarSeries)
    written++
  }
  return { series: bySeries.size, written }
}

/**
 * Past instances of one specific release, oldest first.
 *
 * `before` excludes the instance being read about — an event cannot be its own
 * history — and `limit` keeps the most RECENT instances, because a release from
 * three regimes ago says less about this one than last month's did.
 */
export function pastInstances(country: string, title: string, before: number, limit = 24): CalendarInstance[] {
  const s = readSeries(seriesKey(country, title))
  if (!s) return []
  return s.instances.filter((i) => i.time < before).sort((a, b) => a.time - b.time).slice(-limit)
}

/** Every series on record, most-recorded first. For diagnostics and the API. */
export function allSeries(): CalendarSeries[] {
  const out: CalendarSeries[] = []
  for (const key of store().keysWithPrefix(PREFIX)) {
    const s = store().getJson<CalendarSeries>(key)
    if (s && Array.isArray(s.instances)) out.push(s)
  }
  return out.sort((a, b) => b.instances.length - a.instances.length)
}

/**
 * How much memory exists yet.
 *
 * Worth surfacing rather than hiding: on a fresh install this is zero and every
 * event study will say TOO FEW, which is the truth and should look like it.
 */
export function historyDepth(): { series: number; instances: number; oldest: number | null; withActual: number } {
  const series = allSeries()
  let instances = 0
  let withActual = 0
  let oldest: number | null = null
  for (const s of series) {
    for (const i of s.instances) {
      instances++
      if (i.actual) withActual++
      if (oldest === null || i.time < oldest) oldest = i.time
    }
  }
  return { series: series.length, instances, oldest, withActual }
}
