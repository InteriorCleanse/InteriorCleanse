/**
 * The candle store — the bot's own price history, on disk.
 *
 * Every closed candle the bot has ever seen is kept in the store, whether
 * it arrived over the live stream or was fetched over REST. Callers ask
 * for a window; the store answers from disk and fetches only what is
 * missing. That means:
 *
 *   - a restart does not re-download a month of candles;
 *   - a gap (the stream dropped, the laptop slept) is noticed and filled
 *     from the exchange, and announced on the bus as a gap;
 *   - the look-back test can grow to months of history without re-fetching.
 *
 * A gap the exchange itself cannot fill (it had an outage) is remembered
 * as a KNOWN gap so it is not re-requested forever.
 *
 * Rule kept from day one: no candle is ever invented. If a range cannot be
 * fetched, the caller gets what exists and a gap is recorded.
 */

import { config } from '../../config.ts'
import { INTERVAL_MS, getCandlesRange, MarketDataError } from '../market.ts'
import { store } from '../store.ts'
import { bus } from './bus.ts'
import type { Candle } from '../types.ts'
import type { FeedCandle } from './types.ts'

type Range = { from: number; to: number }

function stepOf(interval: string): number {
  return INTERVAL_MS[interval] ?? 300_000
}

/** The open time of the most recent candle that has fully closed. */
export function lastClosedOpenTime(interval: string, now = Date.now()): number {
  const step = stepOf(interval)
  return Math.floor(now / step) * step - step
}

/** Open times expected in [from, to] that are not present, grouped into ranges. Pure. */
export function findGaps(present: Iterable<number>, step: number, from: number, to: number): Range[] {
  const have = new Set(present)
  const gaps: Range[] = []
  let cur: Range | null = null
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    if (have.has(t)) {
      if (cur) { gaps.push(cur); cur = null }
    } else {
      if (cur) cur.to = t
      else cur = { from: t, to: t }
    }
  }
  if (cur) gaps.push(cur)
  return gaps
}

const knownKey = (symbol: string, interval: string) => `candles:known-gaps:${symbol}:${interval}`

function knownGaps(symbol: string, interval: string): Range[] {
  return store().getJson<Range[]>(knownKey(symbol, interval)) ?? []
}

function rememberGap(symbol: string, interval: string, gap: Range): void {
  const list = knownGaps(symbol, interval)
  list.push(gap)
  store().setJson(knownKey(symbol, interval), list.slice(-500))
}

function insideKnown(gap: Range, known: Range[]): boolean {
  return known.some((k) => gap.from >= k.from && gap.to <= k.to)
}

let lastPruneAt = 0

/**
 * Makes sure every closed candle with an open time in [from, to] is in the
 * store, fetching the missing ranges, and returns them in order.
 */
export async function ensureRange(symbol: string, interval: string, from: number, to: number, opts: { now?: number; onGap?: (what: string) => void } = {}): Promise<Candle[]> {
  const step = stepOf(interval)
  const now = opts.now ?? Date.now()
  const s = store()
  const end = Math.min(to, lastClosedOpenTime(interval, now))
  const start = Math.ceil(from / step) * step
  if (end < start) return []

  const present = s.candlesBetween(symbol, interval, start, end).map((c) => c.openTime)
  const known = knownGaps(symbol, interval)
  const gaps = findGaps(present, step, start, end).filter((g) => !insideKnown(g, known))
  let lastError: MarketDataError | null = null
  for (const gap of gaps) {
    try {
      const fetched = await getCandlesRange(symbol, interval, gap.from, gap.to)
      s.upsertCandles(symbol, interval, fetched, 'rest')
      const got = new Set(fetched.map((c) => c.openTime))
      const still = findGaps(got, step, gap.from, gap.to)
      for (const g of still) {
        // Only a gap the exchange had a fair chance to fill is remembered as permanent.
        if (g.to + step * 3 < now) rememberGap(symbol, interval, g)
      }
      if (present.length > 0 && fetched.length > 0) {
        const what = `Back-filled ${fetched.length} candle(s) from ${new Date(gap.from).toISOString()} over REST`
        opts.onGap?.(what)
        bus.emit('stream:gap', what, now)
      }
    } catch (err) {
      if (err instanceof MarketDataError) { lastError = err; continue }
      throw err
    }
  }
  const rows = s.candlesBetween(symbol, interval, start, end)
  if (rows.length === 0 && lastError) throw lastError

  if (now - lastPruneAt > 6 * 3_600_000) {
    lastPruneAt = now
    s.pruneCandles(symbol, interval, now - config.data.keepDays * 86_400_000)
  }
  return rows.map(({ openTime, closeTime, open, high, low, close, volume }) => ({ openTime, closeTime, open, high, low, close, volume }))
}

/** The most recent `limit` closed candles. Same contract as market.getCandles, but store-first. */
export async function getCandles(symbol: string, interval: string, limit: number, now = Date.now()): Promise<Candle[]> {
  const step = stepOf(interval)
  const end = lastClosedOpenTime(interval, now)
  const start = end - (limit - 1) * step
  const rows = await ensureRange(symbol, interval, start, end, { now })
  if (rows.length === 0) throw new MarketDataError('Could not download real prices from any source.', ['(the candle store is empty and every source failed)'])
  return rows.slice(-limit)
}

/** Every closed candle from `startMs` to now. Same contract as market.getCandlesSince, store-first. */
export async function getCandlesSince(symbol: string, interval: string, startMs: number, now = Date.now()): Promise<Candle[]> {
  const rows = await ensureRange(symbol, interval, startMs, lastClosedOpenTime(interval, now), { now })
  if (rows.length === 0) throw new MarketDataError('Could not download real prices from any source.', ['(the candle store is empty and every source failed)'])
  return rows
}

/** A closed candle from the stream goes straight into the store. Returns true if it was new. */
export function recordClosedCandle(symbol: string, interval: string, c: FeedCandle): boolean {
  if (!c.complete) return false
  const existing = store().candlesBetween(symbol, interval, c.openTime, c.openTime)
  store().upsertCandles(symbol, interval, [c], c.source)
  return existing.length === 0
}

export function storedCandleCount(symbol: string, interval: string): number {
  return store().candleCount(symbol, interval)
}

export function lastStoredCandle(symbol: string, interval: string): Candle | null {
  const rows = store().lastCandles(symbol, interval, 1)
  return rows[0] ?? null
}
