/**
 * THE NEWS BRAIN — what a calendar event is actually worth, measured.
 *
 * Ordinary news commentary runs: "CPI at 8:30, high impact, expect volatility."
 * Every word of that came off the feed's own label. It is a claim, repeated. It
 * says nothing about whether THIS instrument has ever moved on THIS event, and
 * nothing about whether the number that just printed was a surprise or exactly
 * what everyone already expected.
 *
 * This module answers the two questions that commentary skips.
 *
 * 1. WAS IT A SURPRISE?
 *    Markets move on the gap between the print and the forecast, not on the
 *    print. A CPI exactly at forecast is a non-event however it is labelled.
 *    The calendar has carried `forecast`, `previous` and `actual` all along and
 *    nothing has ever compared them — the surprise was sitting in the data,
 *    unread.
 *
 * 2. DOES THIS SYMBOL ACTUALLY CARE?
 *    "High impact" is the feed's opinion about markets in general. Whether
 *    BTCUSDT moves at 08:30 is a measurable fact about BTCUSDT, and the two are
 *    not the same: an event the feed shouts about that this symbol has never
 *    reacted to is noise for you. So the window is measured against the
 *    symbol's own history — what it normally does in that clock window — and
 *    reported with a sample count.
 *
 * WHAT THIS MODULE WILL NOT DO
 *
 * It will not call direction. Ever. "Hot CPI so short it" requires knowing how
 * this instrument maps a surprise to a price move in the current regime, and
 * that mapping is unstable, regime-dependent and frequently inverts — the 2022
 * and 2023 CPI reactions to comparable prints went opposite ways. An honest
 * news read is about SIZE and TIMING: how big the window usually is, and when
 * it opens. Anything that turns a headline into a side is selling confidence it
 * does not have.
 *
 * Read-only and pure. It reads a news report and candles and returns numbers.
 * It cannot place, size, shape or veto an order, and nothing here feeds the
 * engine — `news.isBlackout` remains the only thing risk consults.
 */

import { toET } from '../sessions.ts'
import type { Candle, CalendarEvent } from '../types.ts'

// ---------------------------------------------------------------
// Reading the numbers off the calendar
// ---------------------------------------------------------------

/**
 * Turn a calendar figure into a number.
 *
 * Feeds write these for humans: "0.3%", "-1.2M", "225K", "1.5B", "4.25%".
 * Returns null rather than guessing when it is not a figure at all ("", "—",
 * "Tentative"), because a wrong number here becomes a wrong surprise downstream.
 */
export function parseFigure(raw: string | undefined | null): number | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(/,/g, '')
  if (!s) return null
  const m = /^(-?\d*\.?\d+)\s*([KMBT%])?$/i.exec(s)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const unit = (m[2] ?? '').toUpperCase()
  const mult = unit === 'K' ? 1e3 : unit === 'M' ? 1e6 : unit === 'B' ? 1e9 : unit === 'T' ? 1e12 : 1
  return n * mult
}

export type SurpriseVerdict = 'ABOVE FORECAST' | 'BELOW FORECAST' | 'IN LINE' | 'NOT OUT YET' | 'UNREADABLE'

export type Surprise = {
  actual: number | null
  forecast: number | null
  previous: number | null
  /** actual − forecast, in the figure's own units. */
  surprise: number | null
  /** The surprise as a fraction of |forecast|, when that is meaningful. */
  surpriseRatio: number | null
  verdict: SurpriseVerdict
  /** Deliberately says nothing about which way price should go. */
  note: string
}

/** How far the print landed from what was expected. Never says what that means for price. */
export function surpriseOf(e: Pick<CalendarEvent, 'title' | 'forecast' | 'previous' | 'actual'>): Surprise {
  const actual = parseFigure(e.actual)
  const forecast = parseFigure(e.forecast)
  const previous = parseFigure(e.previous)

  if (actual === null) {
    return {
      actual, forecast, previous, surprise: null, surpriseRatio: null,
      verdict: forecast === null ? 'UNREADABLE' : 'NOT OUT YET',
      note: forecast === null
        ? 'No readable forecast, so there is nothing to be surprised against.'
        : `Not printed yet. The forecast is ${e.forecast}; what matters is the gap when it lands, not the number itself.`,
    }
  }
  if (forecast === null) {
    return {
      actual, forecast, previous, surprise: null, surpriseRatio: null, verdict: 'UNREADABLE',
      note: `Printed at ${e.actual} but with no forecast to compare it to, so whether that is a surprise cannot be said.`,
    }
  }

  const surprise = actual - forecast
  const surpriseRatio = Math.abs(forecast) > 1e-12 ? surprise / Math.abs(forecast) : null
  // "In line" needs a tolerance, and the sensible one is relative: a 0.1 miss on
  // a forecast of 0.3 is large, the same miss on 225000 is nothing.
  const inline = surpriseRatio === null ? Math.abs(surprise) < 1e-9 : Math.abs(surpriseRatio) < 0.02
  const verdict: SurpriseVerdict = inline ? 'IN LINE' : surprise > 0 ? 'ABOVE FORECAST' : 'BELOW FORECAST'

  return {
    actual, forecast, previous, surprise, surpriseRatio, verdict,
    note: inline
      ? `Came in at ${e.actual} against a forecast of ${e.forecast} — effectively as expected, which is usually a non-event however the feed labels it.`
      : `Came in at ${e.actual} against a forecast of ${e.forecast}: ${surprise > 0 ? 'above' : 'below'} by ${Math.abs(surprise).toLocaleString()}${surpriseRatio !== null ? ` (${(Math.abs(surpriseRatio) * 100).toFixed(0)}% of forecast)` : ''}. Which way price takes that depends on the regime and is not called here.`,
  }
}

// ---------------------------------------------------------------
// Does this symbol actually move then?
// ---------------------------------------------------------------

export type WindowStudy = {
  /** The clock window studied, in New York time. */
  windowET: string
  minutes: number
  /** How many separate days contributed a full window. */
  samples: number
  /** Median range through the window, as a percent of its opening price. */
  medianRangePct: number | null
  /** Median range of an ordinary window of the same length, same days. */
  baselineRangePct: number | null
  /** medianRangePct ÷ baselineRangePct. 1.0 = an ordinary few minutes. */
  multiple: number | null
  verdict: 'TOO FEW' | 'ORDINARY' | 'ELEVATED' | 'MUCH BIGGER'
  note: string
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Range through a run of candles, as a percent of the first open. */
function rangePct(run: Candle[]): number | null {
  if (!run.length) return null
  const open = run[0].open
  if (!(open > 0)) return null
  const hi = Math.max(...run.map((c) => c.high))
  const lo = Math.min(...run.map((c) => c.low))
  return ((hi - lo) / open) * 100
}

/**
 * The candle spacing in minutes, measured rather than assumed.
 *
 * The coverage rule below used to hardcode five-minute candles. On 5m data that
 * was right and on 1m data it was badly wrong in the permissive direction: a
 * 30-minute window would have counted as covered on five candles out of thirty,
 * so a window with a six-minute sliver of data in it would have been measured as
 * if it were whole. Deriving the step keeps the 5m behaviour identical and makes
 * every other interval correct.
 */
function stepMinutes(candles: Candle[]): number {
  if (candles.length < 2) return 5
  const gaps: number[] = []
  for (let i = 1; i < Math.min(candles.length, 50); i++) {
    const g = candles[i].openTime - candles[i - 1].openTime
    if (g > 0) gaps.push(g / 60_000)
  }
  const m = median(gaps)
  return m !== null && m > 0 ? m : 5
}

/**
 * How many candles a window needs before it counts as a sample.
 *
 * A partial window is not a sample: a half-covered event window reads as calm
 * for the wrong reason, and a study built out of those understates the very
 * thing it exists to measure.
 */
function coverage(minutes: number, step: number): number {
  return Math.max(1, Math.floor(minutes / step) - 1)
}

/** Candles grouped by New York calendar day. */
function byETDay(candles: Candle[]): Map<string, Candle[]> {
  const byDay = new Map<string, Candle[]>()
  for (const c of candles) {
    const p = toET(c.openTime)
    const day = byDay.get(p.dateKey)
    if (day) day.push(c)
    else byDay.set(p.dateKey, [c])
  }
  return byDay
}

/** Every same-length window of one day except the one starting at `skipStartMin`. */
function baselineRangesOfDay(day: Candle[], minutes: number, need: number, skipStartMin: number | null): number[] {
  const out: number[] = []
  for (let s = 0; s + minutes <= 1440; s += minutes) {
    if (skipStartMin !== null && s === skipStartMin) continue
    const run = day.filter((c) => {
      const m = toET(c.openTime).minutesOfDay
      return m >= s && m < s + minutes
    })
    if (run.length >= need) {
      const r = rangePct(run)
      if (r !== null) out.push(r)
    }
  }
  return out
}

/**
 * What this symbol normally does in a given clock window, from its own history.
 *
 * This is the part commentary cannot do. "High impact" is a label about markets
 * in general; this is a measurement of one instrument. An event the feed shouts
 * about that this symbol has never moved on is, for this account, noise.
 *
 * `minSamples` exists because three days of history is not a pattern — the same
 * rule the attribution layer applies to trades.
 */
export function clockWindowStudy(
  candles: Candle[],
  hourET: number,
  minuteET: number,
  minutes = 30,
  minSamples = 5,
): WindowStudy {
  const windowET = `${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')}`
  const startMin = hourET * 60 + minuteET
  const need = coverage(minutes, stepMinutes(candles))
  const byDay = byETDay(candles)

  const eventRanges: number[] = []
  const baselineRanges: number[] = []
  for (const [, day] of byDay) {
    const inWindow = day.filter((c) => {
      const m = toET(c.openTime).minutesOfDay
      return m >= startMin && m < startMin + minutes
    })
    if (inWindow.length >= need) {
      const r = rangePct(inWindow)
      if (r !== null) eventRanges.push(r)
    }
    baselineRanges.push(...baselineRangesOfDay(day, minutes, need, startMin))
  }

  const medianRangePct = median(eventRanges)
  const baselineRangePct = median(baselineRanges)
  const multiple = medianRangePct !== null && baselineRangePct !== null && baselineRangePct > 0
    ? medianRangePct / baselineRangePct
    : null

  if (eventRanges.length < minSamples || multiple === null) {
    return {
      // The raw medians stay — they are measurements. The MULTIPLE does not: a
      // ratio off three days is not a measurement of anything, and printing it
      // beside the word that refuses to claim it invites exactly the reading the
      // refusal exists to prevent. Seen on a rendering, not reasoned about.
      windowET, minutes, samples: eventRanges.length, medianRangePct, baselineRangePct, multiple: null,
      verdict: 'TOO FEW',
      note: `Only ${eventRanges.length} day${eventRanges.length === 1 ? '' : 's'} of history cover ${windowET} ET — under ${minSamples}, so nothing is claimed about this window.`,
    }
  }
  const verdict = multiple >= 2 ? 'MUCH BIGGER' : multiple >= 1.3 ? 'ELEVATED' : 'ORDINARY'
  return {
    windowET, minutes, samples: eventRanges.length, medianRangePct, baselineRangePct, multiple, verdict,
    note: verdict === 'ORDINARY'
      ? `Across ${eventRanges.length} days this symbol moves about as much at ${windowET} ET as at any other time (${multiple.toFixed(2)}×). Whatever the feed calls the event, this instrument has not historically cared.`
      : `Across ${eventRanges.length} days the ${minutes} minutes from ${windowET} ET run ${multiple.toFixed(2)}× an ordinary window of the same length (${medianRangePct!.toFixed(2)}% vs ${baselineRangePct!.toFixed(2)}%). That is a size-and-timing fact, not a direction.`,
  }
}

// ---------------------------------------------------------------
// What this symbol did on past instances of THIS release
// ---------------------------------------------------------------

export type EventStudy = {
  /** The release this measured, as stored. */
  series: string
  /** Past instances on record, whether or not candles covered them. */
  onRecord: number
  /** Instances that had enough candle coverage to measure. That is the sample. */
  samples: number
  minutes: number
  /** Median range through the window after the release, as a percent of its opening price. */
  medianRangePct: number | null
  /** Median range of an ordinary window of the same length, on those same days. */
  baselineRangePct: number | null
  multiple: number | null
  /** The largest single instance, so a median cannot hide the tail. */
  worstRangePct: number | null
  /** When the most recent measured instance landed. */
  lastMeasured: number | null
  verdict: 'TOO FEW' | 'ORDINARY' | 'ELEVATED' | 'MUCH BIGGER'
  note: string
}

/**
 * The study the clock study could not do.
 *
 * "08:30 ET is usually busy" and "CPI moves this instrument" are different
 * claims, and only the second one is about the event. This measures the second:
 * the realised range in the minutes after each past instance of one specific
 * release, against an ordinary window of the same length on those same days —
 * same-day so the comparison is not contaminated by the market being generally
 * louder in the months the release happened to fall in.
 *
 * Two things it refuses to do. It will not count an instance whose window is not
 * covered by candles, because a window with a sliver of data in it reads as calm
 * for the wrong reason. And it holds the same `minSamples` bar as everything
 * else here: for a monthly release that means roughly five months of memory
 * before anything is claimed. That is the cost of the claim being real.
 *
 * Pure. `instances` comes from the caller — the stored history lives in
 * `news/history.ts` and this module never reaches for it. The caller owns two
 * things this cannot check for itself: that the timestamps really are instances
 * of THIS release, and that none of them is the event being read about. Hand it
 * the wrong list and it will faithfully measure the wrong thing.
 */
export function eventStudy(
  candles: Candle[],
  instances: number[],
  opts: { minutes?: number; minSamples?: number; series?: string } = {},
): EventStudy {
  const minutes = opts.minutes ?? 30
  const minSamples = opts.minSamples ?? 5
  const series = opts.series ?? 'this release'
  const need = coverage(minutes, stepMinutes(candles))
  const byDay = byETDay(candles)
  const span = minutes * 60_000

  const eventRanges: number[] = []
  const baselineRanges: number[] = []
  const measured: number[] = []
  for (const at of [...instances].sort((a, b) => a - b)) {
    const run = candles.filter((c) => c.openTime >= at && c.openTime < at + span)
    if (run.length < need) continue
    const r = rangePct(run)
    if (r === null) continue
    eventRanges.push(r)
    measured.push(at)
    // Baseline from the same day, so the yardstick is that day's own market.
    const p = toET(at)
    const day = byDay.get(p.dateKey)
    if (day) {
      const startMin = Math.floor((p.hour * 60 + p.minute) / minutes) * minutes
      baselineRanges.push(...baselineRangesOfDay(day, minutes, need, startMin))
    }
  }

  const medianRangePct = median(eventRanges)
  const baselineRangePct = median(baselineRanges)
  const multiple = medianRangePct !== null && baselineRangePct !== null && baselineRangePct > 0
    ? medianRangePct / baselineRangePct
    : null
  const worstRangePct = eventRanges.length ? Math.max(...eventRanges) : null
  const lastMeasured = measured.length ? measured[measured.length - 1] : null
  const base = {
    series, onRecord: instances.length, samples: eventRanges.length, minutes,
    medianRangePct, baselineRangePct, multiple, worstRangePct, lastMeasured,
  }

  if (eventRanges.length < minSamples || multiple === null) {
    return {
      ...base,
      // Same rule as the clock study: below the bar, the ratio is not reported.
      multiple: null,
      verdict: 'TOO FEW',
      note: instances.length === 0
        ? `No past instances of ${series} are on record yet, so nothing is claimed about what this release does. The memory fills in as the calendar refreshes.`
        : `${eventRanges.length} of ${instances.length} recorded instance${instances.length === 1 ? '' : 's'} of ${series} fall inside the candle history — under ${minSamples}, so nothing is claimed about this release specifically.`,
    }
  }

  const verdict = multiple >= 2 ? 'MUCH BIGGER' : multiple >= 1.3 ? 'ELEVATED' : 'ORDINARY'
  const tail = worstRangePct !== null ? ` The biggest single one ran ${worstRangePct.toFixed(2)}%.` : ''
  return {
    ...base,
    verdict,
    note: verdict === 'ORDINARY'
      ? `Across the last ${eventRanges.length} instances of ${series}, the ${minutes} minutes after it ran ${multiple.toFixed(2)}× an ordinary window that day — which is to say this instrument has not historically reacted to this release.${tail}`
      : `Across the last ${eventRanges.length} instances of ${series}, the ${minutes} minutes after it ran ${multiple.toFixed(2)}× an ordinary window that day (${medianRangePct!.toFixed(2)}% vs ${baselineRangePct!.toFixed(2)}%).${tail} A size-and-timing fact about the release itself, not a direction.`,
  }
}

// ---------------------------------------------------------------
// The read
// ---------------------------------------------------------------

export type EventRead = {
  title: string
  country: string
  time: number
  /** What the FEED claims. Kept separate from what was measured. */
  feedImpact: CalendarEvent['impact']
  minutesAway: number
  surprise: Surprise
  /** What this symbol does at that time of day, regardless of the event. */
  window: WindowStudy
  /** What it did on past instances of this specific release. Null when nothing is remembered. */
  event: EventStudy | null
  /** Which of the two the read leaned on: the release itself beats the clock when it has the sample. */
  measuredOn: 'event' | 'clock'
  /** Plain English, size and timing only. */
  read: string
}

export type NewsRead = {
  generatedAt: number
  symbol: string
  /** Events within the horizon, soonest first. */
  events: EventRead[]
  /** How much candle history the window studies had to work with. */
  historyDays: number
  /** How many of the events could be measured on the release itself rather than the clock. */
  measuredOnEvent: number
  headlineCount: number
  caveats: string[]
}

/** Minutes between two instants, signed: negative means it already happened. */
function minutesAway(at: number, now: number): number {
  return Math.round((at - now) / 60_000)
}

export function newsRead(input: {
  events: CalendarEvent[]
  candles: Candle[]
  symbol: string
  now?: number
  horizonHours?: number
  windowMinutes?: number
  headlineCount?: number
  /**
   * Timestamps of past instances of one specific release, newest last.
   *
   * Supplied by the caller so this module stays pure — `news/history.ts` is what
   * remembers. Omitted, every event falls back to the clock study, which is what
   * happened before anything was remembered at all.
   */
  pastInstances?: (e: CalendarEvent) => number[]
}): NewsRead {
  const now = input.now ?? Date.now()
  const horizon = (input.horizonHours ?? 36) * 3_600_000
  const windowMinutes = input.windowMinutes ?? 30

  const days = new Set(input.candles.map((c) => toET(c.openTime).dateKey)).size

  const events = input.events
    .filter((e) => e.time >= now - 6 * 3_600_000 && e.time <= now + horizon)
    .sort((a, b) => a.time - b.time)
    .map((e): EventRead => {
      const p = toET(e.time)
      const window = clockWindowStudy(input.candles, p.hour, p.minute, windowMinutes)
      const past = input.pastInstances?.(e) ?? []
      const event = input.pastInstances
        ? eventStudy(input.candles, past, { minutes: windowMinutes, series: e.title })
        : null
      const surprise = surpriseOf(e)
      const away = minutesAway(e.time, now)

      // The release itself outranks the clock when there is enough of it to
      // measure: "CPI moves this instrument" is a stronger claim than "08:30 is
      // usually busy", and it is the one a person actually wants. Until the
      // memory fills in, the clock is what there is, and the read says which.
      const onEvent = event !== null && event.verdict !== 'TOO FEW'
      const measured = onEvent ? event : window

      const when = away > 0
        ? `In ${away < 60 ? `${away} min` : `${(away / 60).toFixed(1)} h`}`
        : `${Math.abs(away)} min ago`
      // The feed's label and the measurement are reported side by side, on
      // purpose. When they disagree, the measurement is the one about you.
      const disagrees = (e.impact === 'High' || e.impact === 'Medium') && measured.verdict === 'ORDINARY'
      const read = [
        `${when}. The feed calls it ${e.impact} impact.`,
        measured.note,
        onEvent ? 'That is measured on this release itself, not just the time of day.' : '',
        // Falling back to the clock is worth saying out loud, with the count, so
        // the difference between "this release is quiet" and "we do not know yet
        // whether this release is quiet" is on the page rather than inferred.
        !onEvent && event !== null && event.onRecord > 0 ? event.note : '',
        // The clock is worth a line alongside a release study when the two
        // disagree: a quiet release landing in a busy slot still lands in a busy
        // slot, and that is a fact about the minutes, not the headline.
        onEvent && window.verdict !== 'TOO FEW' && window.verdict !== event!.verdict
          ? `The clock alone says something different — ${window.note}`
          : '',
        disagrees ? `Those disagree, and the measurement is the one about ${input.symbol}.` : '',
        surprise.note,
      ].filter(Boolean).join(' ')

      return {
        title: e.title, country: e.country, time: e.time, feedImpact: e.impact, minutesAway: away,
        surprise, window, event, measuredOn: onEvent ? 'event' : 'clock', read,
      }
    })

  const measuredOnEvent = events.filter((e) => e.measuredOn === 'event').length

  return {
    generatedAt: now,
    symbol: input.symbol,
    events,
    historyDays: days,
    measuredOnEvent,
    headlineCount: input.headlineCount ?? 0,
    caveats: [
      'No direction is called here, on purpose. Which way an instrument takes a surprise depends on the regime and inverts often enough that asserting it would be selling confidence this does not have.',
      'The window study measures the CLOCK, not the event: it is what this symbol usually does at that time of day, across all days in the history. Where enough past instances of a specific release have been recorded, an event study is reported alongside it and named as such — and until then the clock is what there is.',
      events.length === 0
        ? ''
        : measuredOnEvent === 0
          ? 'None of these were measured on the release itself yet. That memory builds one calendar refresh at a time, so a monthly release takes months before anything can be claimed about it.'
          : `${measuredOnEvent} of ${events.length} were measured on the release itself rather than the clock.`,
      'A feed\'s "High impact" label is a claim about markets in general. The measured multiple is the one about this symbol.',
      'Nothing here reaches the engine. The risk chain still uses its own blackout windows; this only describes them.',
    ].filter(Boolean),
  }
}

/** The read as plain text — for a terminal, a cron, or a glance. */
export function renderNewsRead(r: NewsRead): string {
  const L: string[] = []
  L.push(`NEWS READ — ${r.symbol} — ${r.historyDays} days of history`)
  L.push(`Size and timing only. No direction is called. ${r.measuredOnEvent} of ${r.events.length} measured on the release itself.`)
  L.push('')
  if (!r.events.length) {
    L.push('Nothing scheduled in the window, and nothing recently printed.')
  }
  for (const e of r.events) {
    L.push(`${new Date(e.time).toISOString().slice(11, 16)}Z  ${e.title} (${e.country})`)
    L.push(`  feed says ${e.feedImpact.padEnd(7)} · clock ${e.window.verdict}${e.window.multiple !== null ? ` ${e.window.multiple.toFixed(2)}×` : ''} on ${e.window.samples} days · ${e.surprise.verdict}`)
    if (e.event) {
      const on = e.event.onRecord === 0
        ? 'nothing recorded yet'
        : `${e.event.samples} of ${e.event.onRecord} recorded instance${e.event.onRecord === 1 ? '' : 's'}`
      L.push(`  release  ${e.event.verdict}${e.event.multiple !== null ? ` ${e.event.multiple.toFixed(2)}×` : ''} · ${on}${e.measuredOn === 'event' ? '  ← the read leans on this' : ''}`)
    }
    L.push(`  ${e.read}`)
    L.push('')
  }
  L.push('WHAT THIS DOES NOT TELL YOU')
  for (const c of r.caveats) L.push(`  • ${c}`)
  return L.join('\n')
}
