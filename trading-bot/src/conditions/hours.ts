/**
 * MARKET HOURS — when each kind of market is actually open. Pure: no network,
 * no clock (every function takes `now`).
 *
 *   crypto   24/7.
 *   forex    Sunday 17:00 ET to Friday 17:00 ET. The daily rollover around
 *            17:00 ET is the thinnest minute of the FX day, so 16:55–17:10 ET
 *            reads as "rollover".
 *   stocks   NYSE/Nasdaq regular session 09:30–16:00 ET, Monday to Friday,
 *            with pre-market 04:00–09:30 and after-hours 16:00–20:00.
 *            Holidays are computed by the exchange's published rules (see
 *            usMarketHolidays) and early closes at 13:00 ET.
 *   options  US listed options trade the regular session only: 09:30–16:00 ET
 *            on stock-market days. Outside it they are CLOSED — the only
 *            asset class here that is never tradable overnight.
 *   futures  CME Globex: Sunday 18:00 ET to Friday 17:00 ET, with a daily
 *            maintenance break 17:00–18:00 ET Monday to Thursday. CME holiday
 *            schedules vary by product and are not modelled; on a US holiday
 *            the reading says so rather than guess.
 *
 * All times are America/New_York, so daylight-saving shifts are handled by the
 * time-zone database rather than by hand.
 */

export type AssetClass = 'crypto' | 'forex' | 'stock' | 'option' | 'future'
export type Phase = '24/7' | 'regular' | 'pre-market' | 'after-hours' | 'rollover' | 'maintenance' | 'closed'

export type HoursReading = {
  asset: AssetClass
  open: boolean
  phase: Phase
  label: string
  /** Minutes until the next regular open (null when open or unknown). */
  opensInMin: number | null
  /** Minutes until the current session closes (null when closed or 24/7). */
  closesInMin: number | null
  note: string | null
}

type NY = { y: number; m: number; d: number; dow: number; min: number }

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Wall-clock parts in New York for an instant. */
const NY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
export function nyParts(ms: number): NY {
  const p = Object.fromEntries(NY_FMT.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), dow: DOW[p.weekday] ?? 0, min: Number(p.hour) * 60 + Number(p.minute) }
}

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const dowOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay()
function nthWeekday(y: number, m: number, dow: number, n: number): number {
  const first = dowOf(y, m, 1)
  return 1 + ((dow - first + 7) % 7) + (n - 1) * 7
}
function lastWeekday(y: number, m: number, dow: number): number {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = dowOf(y, m, days)
  return days - ((last - dow + 7) % 7)
}
/** Western Easter (Anonymous Gregorian algorithm). */
function easter(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return { m: month, d: day }
}
/** Saturday holidays move to Friday, Sunday holidays to Monday. */
function observed(y: number, m: number, d: number): string {
  const w = dowOf(y, m, d)
  const t = new Date(Date.UTC(y, m - 1, d + (w === 6 ? -1 : w === 0 ? 1 : 0)))
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/**
 * NYSE full-day holidays for a year, by the exchange's rules: New Year's Day,
 * Martin Luther King Jr. Day, Washington's Birthday, Good Friday, Memorial Day,
 * Juneteenth, Independence Day, Labor Day, Thanksgiving and Christmas, with
 * weekend dates observed on the nearest weekday. One NYSE exception: when
 * January 1 falls on a Saturday the market does not close the Friday before.
 */
export function usMarketHolidays(y: number): Set<string> {
  const out = new Set<string>()
  if (dowOf(y, 1, 1) !== 6) out.add(observed(y, 1, 1))
  out.add(ymd(y, 1, nthWeekday(y, 1, 1, 3)))
  out.add(ymd(y, 2, nthWeekday(y, 2, 1, 3)))
  const e = easter(y); const gf = new Date(Date.UTC(y, e.m - 1, e.d - 2))
  out.add(ymd(y, gf.getUTCMonth() + 1, gf.getUTCDate()))
  out.add(ymd(y, 5, lastWeekday(y, 5, 1)))
  if (y >= 2022) out.add(observed(y, 6, 19))
  out.add(observed(y, 7, 4))
  out.add(ymd(y, 9, nthWeekday(y, 9, 1, 1)))
  out.add(ymd(y, 11, nthWeekday(y, 11, 4, 4)))
  out.add(observed(y, 12, 25))
  return out
}

/** 13:00 ET early closes: the day after Thanksgiving, Christmas Eve, and July 3 when both it and July 4 are weekdays. */
export function usEarlyCloses(y: number): Set<string> {
  const out = new Set<string>()
  out.add(ymd(y, 11, nthWeekday(y, 11, 4, 4) + 1))
  const ce = dowOf(y, 12, 24); if (ce >= 1 && ce <= 5) out.add(ymd(y, 12, 24))
  const j3 = dowOf(y, 7, 3), j4 = dowOf(y, 7, 4); if (j3 >= 1 && j3 <= 4 && j4 >= 2 && j4 <= 5) out.add(ymd(y, 7, 3))
  return out
}

export function isUsMarketDay(p: NY): boolean {
  return p.dow >= 1 && p.dow <= 5 && !usMarketHolidays(p.y).has(ymd(p.y, p.m, p.d))
}

const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Minutes from `now` until the first minute that satisfies `pred`, scanning up to 8 days. */
function minutesUntil(now: number, pred: (p: NY) => boolean): number | null {
  const start = Math.ceil(now / 60_000) * 60_000
  for (let t = start, i = 0; i < 8 * 24 * 4; i++, t += 15 * 60_000) {
    if (pred(nyParts(t))) {
      // refine to the minute
      for (let u = t - 15 * 60_000 + 60_000; u <= t; u += 60_000) if (u >= start && pred(nyParts(u))) return Math.round((u - now) / 60_000)
      return Math.round((t - now) / 60_000)
    }
  }
  return null
}

const OPEN = 9 * 60 + 30, CLOSE = 16 * 60, EARLY = 13 * 60, PRE = 4 * 60, AFTER = 20 * 60, FX = 17 * 60, CME_OPEN = 18 * 60

function stockSession(p: NY): { phase: Phase; close: number } {
  if (!isUsMarketDay(p)) return { phase: 'closed', close: CLOSE }
  const close = usEarlyCloses(p.y).has(ymd(p.y, p.m, p.d)) ? EARLY : CLOSE
  if (p.min >= OPEN && p.min < close) return { phase: 'regular', close }
  if (p.min >= PRE && p.min < OPEN) return { phase: 'pre-market', close }
  if (p.min >= close && p.min < AFTER) return { phase: 'after-hours', close }
  return { phase: 'closed', close }
}
function fxOpen(p: NY): boolean {
  if (p.dow === 6) return false
  if (p.dow === 0) return p.min >= FX
  if (p.dow === 5) return p.min < FX
  return true
}
function cmeOpen(p: NY): boolean {
  if (p.dow === 6) return false
  if (p.dow === 0) return p.min >= CME_OPEN
  if (p.dow === 5) return p.min < FX
  return !(p.min >= FX && p.min < CME_OPEN)
}

/** When is this kind of market open, right now? */
export function marketHours(asset: AssetClass, now: number): HoursReading {
  const p = nyParts(now)
  const holiday = isUsMarketDay(p) || p.dow === 0 || p.dow === 6 ? null : 'US market holiday'
  const base = { asset, opensInMin: null as number | null, closesInMin: null as number | null, note: null as string | null }
  switch (asset) {
    case 'crypto':
      return { ...base, open: true, phase: '24/7', label: 'Open 24/7' }
    case 'forex': {
      if (!fxOpen(p)) return { ...base, open: false, phase: 'closed', label: 'Weekend close', opensInMin: minutesUntil(now, fxOpen), note: 'FX reopens Sunday 17:00 ET (Sydney/Wellington).' }
      const roll = p.min >= FX - 5 && p.min < FX + 10
      const closes = p.dow === 5 ? FX - p.min : null
      return { ...base, open: true, phase: roll ? 'rollover' : 'regular', label: roll ? 'Daily rollover: thinnest minutes of the day' : 'Open (24h, Sun–Fri)', closesInMin: closes, note: holiday ? `${holiday}: FX trades, but US liquidity is thin.` : null }
    }
    case 'stock': {
      const s = stockSession(p)
      const regularNext = (q: NY) => stockSession(q).phase === 'regular'
      if (s.phase === 'regular') return { ...base, open: true, phase: 'regular', label: `Regular session until ${hm(s.close)} ET`, closesInMin: s.close - p.min, note: s.close === EARLY ? 'Early close today (13:00 ET).' : null }
      if (s.phase === 'pre-market' || s.phase === 'after-hours') return { ...base, open: true, phase: s.phase, label: s.phase === 'pre-market' ? 'Pre-market: thin, wide spreads' : 'After-hours: thin, wide spreads', opensInMin: s.phase === 'pre-market' ? OPEN - p.min : minutesUntil(now, regularNext), closesInMin: s.phase === 'pre-market' ? null : AFTER - p.min }
      return { ...base, open: false, phase: 'closed', label: holiday ? 'Closed: US market holiday' : 'Closed', opensInMin: minutesUntil(now, regularNext) }
    }
    case 'option': {
      const s = stockSession(p)
      const regularNext = (q: NY) => stockSession(q).phase === 'regular'
      if (s.phase === 'regular') return { ...base, open: true, phase: 'regular', label: `Options open until ${hm(s.close)} ET`, closesInMin: s.close - p.min, note: s.close === EARLY ? 'Early close today (13:00 ET).' : 'Listed options trade the regular session only.' }
      return { ...base, open: false, phase: 'closed', label: holiday ? 'Options closed: US market holiday' : 'Options closed (regular session only)', opensInMin: minutesUntil(now, regularNext), note: 'Listed options do not trade pre-market, after-hours or overnight.' }
    }
    case 'future': {
      if (cmeOpen(p)) return { ...base, open: true, phase: 'regular', label: 'Globex open (Sun 18:00 – Fri 17:00 ET)', closesInMin: p.dow === 5 ? FX - p.min : (p.min < FX ? FX - p.min : null), note: holiday ? `${holiday}: CME runs abbreviated hours that vary by product; not modelled here.` : null }
      const maint = p.dow >= 1 && p.dow <= 4 && p.min >= FX && p.min < CME_OPEN
      return { ...base, open: false, phase: maint ? 'maintenance' : 'closed', label: maint ? 'Daily maintenance break (17:00–18:00 ET)' : 'Weekend close', opensInMin: minutesUntil(now, cmeOpen) }
    }
  }
}
