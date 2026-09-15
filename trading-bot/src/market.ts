/**
 * Gets REAL price history from free public endpoints.
 *
 * Rules this file obeys, without exception:
 *   - It never invents a candle.
 *   - It never returns "sample" or "example" data.
 *   - If it cannot reach the internet, it says so loudly and stops.
 *     A bot that guesses prices is worse than a bot that admits defeat.
 */

import { dataSources } from '../config.ts'
import type { Candle } from './types.ts'

/** Thrown when we genuinely could not get real prices. */
export class MarketDataError extends Error {
  readonly hostsTried: string[]
  constructor(message: string, hostsTried: string[]) {
    super(message)
    this.name = 'MarketDataError'
    this.hostsTried = hostsTried
  }
}

/** Milliseconds per candle for each interval the bot supports. */
export const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
}

/** Binance returns arrays; this turns one into a readable object. */
function toCandle(raw: unknown[]): Candle {
  return {
    openTime: Number(raw[0]),
    open: Number(raw[1]),
    high: Number(raw[2]),
    low: Number(raw[3]),
    close: Number(raw[4]),
    volume: Number(raw[5]),
    closeTime: Number(raw[6]),
  }
}

/**
 * The last candle from the exchange is usually still forming — its
 * price is not final. Acting on it means acting on a half-written
 * number, and would make look-back tests look better than reality.
 */
function dropUnclosedCandle(candles: Candle[]): Candle[] {
  const now = Date.now()
  return candles.filter((c) => c.closeTime <= now)
}

async function fetchOnce(
  baseUrl: string,
  symbol: string,
  interval: string,
  limit: number,
  opts: { startTime?: number; endTime?: number } = {},
): Promise<Candle[]> {
  const url = new URL(baseUrl)
  url.searchParams.set('symbol', symbol)
  url.searchParams.set('interval', interval)
  url.searchParams.set('limit', String(Math.min(limit, 1000)))
  if (opts.startTime) url.searchParams.set('startTime', String(opts.startTime))
  if (opts.endTime) url.searchParams.set('endTime', String(opts.endTime))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!Array.isArray(json)) throw new Error('unexpected response shape')
    return json.map(toCandle)
  } finally {
    clearTimeout(timer)
  }
}

/** Fetches any JSON path from the first price host that answers. Used by order flow. */
export async function fetchMarketJson(path: string, params: Record<string, string>): Promise<unknown> {
  return withSources(async (source) => {
    const url = new URL(path, new URL(source).origin)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  })
}

async function withSources<T>(work: (source: string) => Promise<T>): Promise<T> {
  const failures: string[] = []
  for (const source of dataSources) {
    try {
      return await work(source)
    } catch (err) {
      const host = new URL(source).host
      const why = err instanceof Error ? err.message : String(err)
      failures.push(`${host} (${why})`)
    }
  }
  throw new MarketDataError('Could not download real prices from any source.', failures)
}

/** The most recent `limit` closed candles, paging backwards as needed. */
export async function getCandles(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  return withSources(async (source) => {
    const collected: Candle[] = []
    let endTime: number | undefined
    while (collected.length < limit) {
      const need = Math.min(1000, limit - collected.length)
      const batch = await fetchOnce(source, symbol, interval, need, { endTime })
      if (batch.length === 0) break
      collected.unshift(...batch)
      endTime = batch[0].openTime - 1
      if (batch.length < need) break
    }
    const closed = dropUnclosedCandle(collected)
    if (closed.length === 0) throw new Error('no closed candles returned')
    return closed.slice(-limit)
  })
}

/** Every closed candle from `startMs` to now, paging forwards. */
export async function getCandlesSince(symbol: string, interval: string, startMs: number): Promise<Candle[]> {
  const stepMs = INTERVAL_MS[interval] ?? 300_000
  return withSources(async (source) => {
    const collected: Candle[] = []
    let startTime = startMs
    for (let guard = 0; guard < 200; guard++) {
      const batch = await fetchOnce(source, symbol, interval, 1000, { startTime })
      if (batch.length === 0) break
      collected.push(...batch)
      startTime = batch[batch.length - 1].openTime + stepMs
      if (batch.length < 1000 || startTime > Date.now()) break
    }
    const closed = dropUnclosedCandle(collected)
    if (closed.length === 0) throw new Error('no closed candles returned')
    return closed
  })
}

/** Every closed candle whose open time lies in [startMs, endMs], paging forwards. Used by the candle store to fill gaps. */
export async function getCandlesRange(symbol: string, interval: string, startMs: number, endMs: number): Promise<Candle[]> {
  const stepMs = INTERVAL_MS[interval] ?? 300_000
  return withSources(async (source) => {
    const collected: Candle[] = []
    let startTime = startMs
    for (let guard = 0; guard < 400 && startTime <= endMs; guard++) {
      const batch = await fetchOnce(source, symbol, interval, 1000, { startTime, endTime: endMs })
      if (batch.length === 0) break
      collected.push(...batch)
      startTime = batch[batch.length - 1].openTime + stepMs
      if (batch.length < 1000) break
    }
    return dropUnclosedCandle(collected).filter((c) => c.openTime >= startMs && c.openTime <= endMs)
  })
}

/** Turns a data failure into something a human can act on. */
export function explainMarketDataError(err: MarketDataError): string {
  return [
    'I could not get real market prices, so I stopped.',
    '',
    'I did NOT make up prices to fill the gap. Numbers invented by a',
    'bot would look like a real result and teach you the wrong lesson.',
    '',
    'Sources I tried:',
    ...err.hostsTried.map((h) => `  - ${h}`),
    '',
    'Common causes, most likely first:',
    '  1. No internet connection right now.',
    '  2. Your network or country blocks the exchange (some do).',
    '     A VPN, a phone hotspot, or a different network usually fixes it.',
    '  3. The exchange is briefly down. Wait a few minutes and retry.',
    '',
    'Nothing is broken in the bot itself — it just refuses to guess.',
  ].join('\n')
}
