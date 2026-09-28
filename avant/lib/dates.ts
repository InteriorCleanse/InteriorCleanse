/**
 * Calendar-date helpers over `YYYY-MM-DD` strings.
 *
 * Every function here works in UTC on purpose: a trip that starts on the 3rd
 * and ends on the 5th is two days long wherever the visitor happens to be,
 * and a `Date` built from a local midnight would drift across DST changes.
 */

const DAY_MS = 86_400_000

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export const ISO_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Strict: the string must be a real calendar day, so 2026-02-29 is rejected. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const ms = parseIso(value)
  return !Number.isNaN(ms) && toIso(ms) === value
}

export function isIsoTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIME.test(value)
}

/** Milliseconds since the epoch for UTC midnight of `date`. */
export function parseIso(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function todayIso(now: Date = new Date()): string {
  return toIso(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

export function addDays(date: string, days: number): string {
  return toIso(parseIso(date) + days * DAY_MS)
}

/** Whole calendar days from `start` to `end`; negative when reversed. */
export function daysBetween(start: string, end: string): number {
  return Math.round((parseIso(end) - parseIso(start)) / DAY_MS)
}

/**
 * Billable days for a trip. A trip is billed in 24-hour blocks from the
 * pickup time, rounded up, and never for less than one day, so a Friday 10:00
 * to Sunday 14:00 trip is three days, not two.
 */
export function billableDays(start: string, startTime: string, end: string, endTime: string): number {
  const from = parseIso(start) + minutesOf(startTime) * 60_000
  const to = parseIso(end) + minutesOf(endTime) * 60_000
  if (to <= from) return 1
  return Math.max(1, Math.ceil((to - from) / DAY_MS))
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** True when two inclusive date ranges share at least one day. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return parseIso(aStart) <= parseIso(bEnd) && parseIso(bStart) <= parseIso(aEnd)
}

/** Coming Saturday to the Monday after it, from `today`. */
export function weekendFrom(today: string): { start: string; end: string } {
  const dow = new Date(parseIso(today)).getUTCDay()
  const untilSaturday = (6 - dow + 7) % 7 || 7
  const start = addDays(today, untilSaturday)
  return { start, end: addDays(start, 2) }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Fri, Oct 3" — short enough for a card, unambiguous enough for a receipt. */
export function formatDate(date: string, withYear = false): string {
  const d = new Date(parseIso(date))
  const base = `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  return withYear ? `${base}, ${d.getUTCFullYear()}` : base
}

export function formatRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${formatDate(start, !sameYear)} – ${formatDate(end, !sameYear)}`
}

/** "10:00" → "10:00 AM" */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Pickup times a host can be reasonably asked for, on the half hour. */
export const PICKUP_TIMES: string[] = Array.from({ length: 30 }, (_, i) => {
  const minutes = 7 * 60 + i * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`
})
