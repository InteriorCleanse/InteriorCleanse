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
  const byDay = new Map<string, Candle[]>()
  for (const c of candles) {
    const p = toET(c.openTime)
    byDay.set(p.dateKey, [...(byDay.get(p.dateKey) ?? []), c])
  }

  const eventRanges: number[] = []
  const baselineRanges: number[] = []
  for (const [, day] of byDay) {
    const inWindow = day.filter((c) => {
      const m = toET(c.openTime).minutesOfDay
      return m >= startMin && m < startMin + minutes
    })
    // A partial window is not a sample — a half-covered event window would read
    // as calm for the wrong reason.
    if (inWindow.length >= Math.max(1, Math.floor(minutes / 5) - 1)) {
      const r = rangePct(inWindow)
      if (r !== null) eventRanges.push(r)
    }
    // Baseline: every other window of the same length that day.
    for (let s = 0; s + minutes <= 1440; s += minutes) {
      if (s === startMin) continue
      const run = day.filter((c) => {
        const m = toET(c.openTime).minutesOfDay
        return m >= s && m < s + minutes
      })
      if (run.length >= Math.max(1, Math.floor(minutes / 5) - 1)) {
        const r = rangePct(run)
        if (r !== null) baselineRanges.push(r)
      }
    }
  }

  const medianRangePct = median(eventRanges)
  const baselineRangePct = median(baselineRanges)
  const multiple = medianRangePct !== null && baselineRangePct !== null && baselineRangePct > 0
    ? medianRangePct / baselineRangePct
    : null

  if (eventRanges.length < minSamples || multiple === null) {
    return {
      windowET, minutes, samples: eventRanges.length, medianRangePct, baselineRangePct, multiple,
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
  window: WindowStudy
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
      const surprise = surpriseOf(e)
      const away = minutesAway(e.time, now)

      const when = away > 0
        ? `In ${away < 60 ? `${away} min` : `${(away / 60).toFixed(1)} h`}`
        : `${Math.abs(away)} min ago`
      // The feed's label and the measurement are reported side by side, on
      // purpose. When they disagree, the measurement is the one about you.
      const disagrees = (e.impact === 'High' || e.impact === 'Medium') && window.verdict === 'ORDINARY'
      const read = [
        `${when}. The feed calls it ${e.impact} impact.`,
        window.note,
        disagrees ? `Those disagree, and the measurement is the one about ${input.symbol}.` : '',
        surprise.note,
      ].filter(Boolean).join(' ')

      return { title: e.title, country: e.country, time: e.time, feedImpact: e.impact, minutesAway: away, surprise, window, read }
    })

  return {
    generatedAt: now,
    symbol: input.symbol,
    events,
    historyDays: days,
    headlineCount: input.headlineCount ?? 0,
    caveats: [
      'No direction is called here, on purpose. Which way an instrument takes a surprise depends on the regime and inverts often enough that asserting it would be selling confidence this does not have.',
      'The window study measures the CLOCK, not the event: it is what this symbol usually does at that time of day, across all days in the history — not what it did on past instances of this specific release.',
      'A feed\'s "High impact" label is a claim about markets in general. The measured multiple is the one about this symbol.',
      'Nothing here reaches the engine. The risk chain still uses its own blackout windows; this only describes them.',
    ],
  }
}

/** The read as plain text — for a terminal, a cron, or a glance. */
export function renderNewsRead(r: NewsRead): string {
  const L: string[] = []
  L.push(`NEWS READ — ${r.symbol} — ${r.historyDays} days of history`)
  L.push('Size and timing only. No direction is called.')
  L.push('')
  if (!r.events.length) {
    L.push('Nothing scheduled in the window, and nothing recently printed.')
  }
  for (const e of r.events) {
    L.push(`${new Date(e.time).toISOString().slice(11, 16)}Z  ${e.title} (${e.country})`)
    L.push(`  feed says ${e.feedImpact.padEnd(7)} · measured ${e.window.verdict}${e.window.multiple !== null ? ` ${e.window.multiple.toFixed(2)}×` : ''} on ${e.window.samples} days · ${e.surprise.verdict}`)
    L.push(`  ${e.read}`)
    L.push('')
  }
  L.push('WHAT THIS DOES NOT TELL YOU')
  for (const c of r.caveats) L.push(`  • ${c}`)
  return L.join('\n')
}
