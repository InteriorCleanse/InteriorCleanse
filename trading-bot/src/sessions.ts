/**
 * The session clock.
 *
 * The ICT model divides every day into sessions — Asia, London, New
 * York — and marks each one's high and low. Those highs and lows are
 * where resting orders pile up, which makes them the levels that get
 * hunted. This file knows what time it is in New York, which session
 * a candle belongs to, and what each session's range was.
 *
 * Daylight saving is handled by asking the JavaScript engine for the
 * New York wall-clock time directly, so there is no offset table to
 * get wrong twice a year.
 */

import { config } from '../config.ts'
import type { Candle, Level, SessionName, SessionRange } from './types.ts'

const TZ = config.ict.timezone
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SESSION_ORDER: SessionName[] = ['asia', 'london', 'newYork', 'nyPM']

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hour12: false,
})

export type ETParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
  weekdayName: string
  minutesOfDay: number
  dateKey: string
  clock: string
}

const partsCache = new Map<number, ETParts>()

/** The New York wall-clock reading for an instant. */
export function toET(ms: number): ETParts {
  const cached = partsCache.get(ms)
  if (cached) return cached
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value
  const hour = Number(p.hour) % 24 // some engines print midnight as "24"
  const minute = Number(p.minute)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  const parts: ETParts = {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour,
    minute,
    weekday,
    weekdayName: WEEKDAYS[weekday] ?? p.weekday,
    minutesOfDay: hour * 60 + minute,
    dateKey: `${p.year}-${p.month}-${p.day}`,
    clock: `${String(hour).padStart(2, '0')}:${p.minute}`,
  }
  if (partsCache.size > 50_000) partsCache.clear()
  partsCache.set(ms, parts)
  return parts
}

function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000
  const dt = new Date(t)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * Which trading day an instant belongs to. The day rolls at
 * config.ict.dayStartHour ET, so 9pm Tuesday is already "Wednesday" —
 * it's the Asia session that sets Wednesday up.
 */
export function tradingDayKey(ms: number): string {
  const p = toET(ms)
  return p.hour >= config.ict.dayStartHour ? shiftDateKey(p.dateKey, 1) : p.dateKey
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

function inWindow(minutesOfDay: number, start: string, end: string): boolean {
  const s = parseHHMM(start)
  const e = parseHHMM(end)
  if (s < e) return minutesOfDay >= s && minutesOfDay < e
  // Wraps past midnight, e.g. 20:00 → 00:00
  return minutesOfDay >= s || minutesOfDay < e
}

/** Which session window an instant falls inside, if any. */
export function sessionAt(ms: number): SessionName | null {
  const m = toET(ms).minutesOfDay
  for (const name of SESSION_ORDER) {
    const w = config.ict.sessions[name]
    if (inWindow(m, w.start, w.end)) return name
  }
  return null
}

export function isKillzone(ms: number): boolean {
  const s = sessionAt(ms)
  return s !== null && config.ict.killzones.includes(s)
}

export function isWeekend(ms: number): boolean {
  const d = toET(ms).weekday
  return d === 0 || d === 6
}

/** The next killzone opening, and how far away it is. */
export function nextKillzone(ms: number): { name: SessionName; label: string; startsIn: number } | null {
  const p = toET(ms)
  let best: { name: SessionName; label: string; startsIn: number } | null = null
  for (const name of config.ict.killzones) {
    const w = config.ict.sessions[name]
    const start = parseHHMM(w.start)
    let delta = start - p.minutesOfDay
    if (delta <= 0) delta += 1440
    if (!best || delta < best.startsIn) best = { name, label: w.label, startsIn: delta * 60_000 }
  }
  return best
}

export function sessionLabel(name: SessionName): string {
  return config.ict.sessions[name].label
}

type DayRecord = {
  dayKey: string
  sessions: Partial<Record<SessionName, SessionRange>>
  high: number
  low: number
  firstTime: number
  lastTime: number
}

/**
 * Walks candles in order and keeps every session's high and low, for
 * every trading day it has seen. Never looks ahead: at any point it
 * only knows what has already closed.
 */
export class SessionTracker {
  readonly days = new Map<string, DayRecord>()
  readonly order: string[] = []

  add(candle: Candle): { dayKey: string; session: SessionName | null } {
    const dayKey = tradingDayKey(candle.openTime)
    let day = this.days.get(dayKey)
    if (!day) {
      day = { dayKey, sessions: {}, high: candle.high, low: candle.low, firstTime: candle.openTime, lastTime: candle.closeTime }
      this.days.set(dayKey, day)
      this.order.push(dayKey)
      // Any session left open on the previous day is now finished.
      const prev = this.days.get(this.order[this.order.length - 2] ?? '')
      if (prev) for (const s of Object.values(prev.sessions)) s.complete = true
    }
    day.high = Math.max(day.high, candle.high)
    day.low = Math.min(day.low, candle.low)
    day.lastTime = candle.closeTime

    const session = sessionAt(candle.openTime)

    // A candle outside a session's window finishes that session.
    for (const s of Object.values(day.sessions)) {
      if (!s.complete && s.name !== session) s.complete = true
    }

    if (session) {
      let range = day.sessions[session]
      if (!range) {
        range = {
          name: session,
          label: sessionLabel(session),
          dayKey,
          startTime: candle.openTime,
          endTime: candle.closeTime,
          high: candle.high,
          low: candle.low,
          highTime: candle.openTime,
          lowTime: candle.openTime,
          complete: false,
          candles: 0,
        }
        day.sessions[session] = range
      }
      if (candle.high > range.high) {
        range.high = candle.high
        range.highTime = candle.openTime
      }
      if (candle.low < range.low) {
        range.low = candle.low
        range.lowTime = candle.openTime
      }
      range.endTime = candle.closeTime
      range.candles++
    }
    return { dayKey, session }
  }

  day(dayKey: string): DayRecord | undefined {
    return this.days.get(dayKey)
  }

  /** The trading day before this one, if we have it. */
  previousDay(dayKey: string): DayRecord | null {
    const i = this.order.indexOf(dayKey)
    return i > 0 ? this.days.get(this.order[i - 1]) ?? null : null
  }

  /**
   * The levels that matter for a day: each session's high and low as
   * they stand, plus yesterday's high and low. Levels only exist once
   * the session has actually started — nothing is predicted.
   */
  levelsFor(dayKey: string): Level[] {
    const day = this.days.get(dayKey)
    const out: Level[] = []
    if (!day) return out

    const push = (kind: Level['kind'], price: number, time: number, label: string) =>
      out.push({ kind, price, time, label })

    const a = day.sessions.asia
    if (a) {
      push('asia-high', a.high, a.highTime, 'Asia high')
      push('asia-low', a.low, a.lowTime, 'Asia low')
    }
    const l = day.sessions.london
    if (l) {
      push('london-high', l.high, l.highTime, 'London high')
      push('london-low', l.low, l.lowTime, 'London low')
    }
    const n = day.sessions.newYork
    if (n) {
      push('ny-high', n.high, n.highTime, 'New York high')
      push('ny-low', n.low, n.lowTime, 'New York low')
    }
    const prev = this.previousDay(dayKey)
    if (prev) {
      push('pdh', prev.high, prev.lastTime, "Yesterday's high")
      push('pdl', prev.low, prev.lastTime, "Yesterday's low")
    }
    return out
  }
}

/** A human-readable description of a session window in ET and local time. */
export function describeWindow(name: SessionName): string {
  const w = config.ict.sessions[name]
  return `${w.label} ${w.start}–${w.end} ET`
}
