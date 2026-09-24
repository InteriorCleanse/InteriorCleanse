/**
 * MARKET WATCH — where the prices come from. READ-ONLY.
 *
 * Three public or read-only data feeds, one per kind of market:
 *
 *   crypto   Binance public candles, through the same source list the engine
 *            uses (src/market.ts). No key.
 *   forex    Kraken's public OHLC. Kraken is a crypto venue that also lists
 *            currency pairs, so this is Kraken's own FX book, not the interbank
 *            rate. No key.
 *   stocks,  Alpaca's market-data API with your existing read-only Alpaca keys
 *   indexes  (MRCASH_ALPACA_KEY / _SECRET). The free feed is IEX: one exchange's
 *            prints, a small slice of the day's volume. Indexes are watched
 *            through the ETFs that track them (SPY, QQQ, DIA) and are labelled
 *            as such — an ETF is not the index.
 *
 * Nothing in this file can place, change or cancel an order: every call is a
 * GET to a market-data path. Keys travel only in request headers to Alpaca and
 * are redacted from any error that reaches the page.
 */
import type { Candle } from '../types.ts'
import { getCandles } from '../market.ts'
import { alpacaConfig } from '../broker/alpaca.ts'

export type MarketKind = 'crypto' | 'forex' | 'stock' | 'index'
export type SourceId = 'binance' | 'kraken' | 'alpaca'

export type WatchItem = {
  kind: MarketKind
  /** The symbol as the source knows it: BTCUSDT, EURUSD, AAPL, SPY. */
  symbol: string
  /** What a person calls it: BTC/USDT, EUR/USD, Apple, S&P 500 (via SPY). */
  label: string
  source: SourceId
}

export type FetchResult = { ok: true; candles: Candle[] } | { ok: false; reason: string }
export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const HOUR = 3_600_000

/** Well-known names, so the watchlist reads as markets rather than tickers. */
const NAMES: Record<string, string> = {
  BTCUSDT: 'BTC/USDT', ETHUSDT: 'ETH/USDT', SOLUSDT: 'SOL/USDT', BNBUSDT: 'BNB/USDT', XRPUSDT: 'XRP/USDT',
  EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF',
  AAPL: 'Apple', NVDA: 'Nvidia', TSLA: 'Tesla', MSFT: 'Microsoft', AMZN: 'Amazon', META: 'Meta', GOOGL: 'Alphabet',
  SPY: 'S&P 500 (via SPY)', QQQ: 'Nasdaq 100 (via QQQ)', DIA: 'Dow 30 (via DIA)', IWM: 'Russell 2000 (via IWM)',
}
const SOURCE_FOR: Record<MarketKind, SourceId> = { crypto: 'binance', forex: 'kraken', stock: 'alpaca', index: 'alpaca' }

export const DEFAULT_WATCHLIST = 'crypto:BTCUSDT,crypto:ETHUSDT,crypto:SOLUSDT,forex:EURUSD,forex:GBPUSD,forex:USDJPY,stock:AAPL,stock:NVDA,stock:TSLA,index:SPY,index:QQQ,index:DIA'

/**
 * The watchlist, from MRCASH_WATCHLIST ("crypto:BTCUSDT,forex:EURUSD,…") or
 * the default. Anything malformed is skipped rather than guessed at.
 */
export function parseWatchlist(spec = process.env.MRCASH_WATCHLIST || DEFAULT_WATCHLIST): WatchItem[] {
  const out: WatchItem[] = []
  const seen = new Set<string>()
  for (const raw of spec.split(',')) {
    const m = /^\s*(crypto|forex|stock|index)\s*:\s*([A-Za-z0-9.]{1,15})\s*$/.exec(raw)
    if (!m) continue
    const kind = m[1] as MarketKind
    const symbol = m[2].toUpperCase()
    const key = `${kind}:${symbol}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, symbol, label: NAMES[symbol] || symbol, source: SOURCE_FOR[kind] })
  }
  return out.slice(0, 40)
}

/** Redact anything that could carry a key out of an error message. */
export function safeReason(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/[A-Za-z0-9+/=_-]{20,}/g, '[redacted]').slice(0, 160)
}

/* ---------------- crypto: Binance public candles ---------------- */

export async function fetchCrypto(symbol: string, limit = 200): Promise<FetchResult> {
  try {
    return { ok: true, candles: await getCandles(symbol, '1h', limit) }
  } catch (e) {
    return { ok: false, reason: safeReason(e) }
  }
}

/* ---------------- forex: Kraken public OHLC ---------------- */

export function krakenBase(): string {
  return (process.env.MRCASH_KRAKEN_PUBLIC_URL || 'https://api.kraken.com').replace(/\/$/, '')
}

/**
 * Kraken's OHLC rows are [time(s), open, high, low, close, vwap, volume, count]
 * as strings, keyed by Kraken's own pair name (EURUSD comes back as ZEURZUSD).
 * The last row is the candle still forming, so it is dropped.
 */
export function parseKrakenOhlc(body: unknown, intervalMs = HOUR): Candle[] {
  const b = body as { error?: unknown[]; result?: Record<string, unknown> }
  if (!b || !Array.isArray(b.error)) throw new Error('unexpected Kraken response')
  if (b.error.length) throw new Error(`Kraken: ${String(b.error[0]).slice(0, 80)}`)
  const key = Object.keys(b.result || {}).find((k) => k !== 'last')
  const rows = key ? (b.result![key] as unknown[]) : []
  if (!Array.isArray(rows)) throw new Error('unexpected Kraken rows')
  const candles: Candle[] = []
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 7) continue
    const openTime = Number(r[0]) * 1000
    const [open, high, low, close, volume] = [r[1], r[2], r[3], r[4], r[6]].map(Number)
    if (![openTime, open, high, low, close].every(Number.isFinite)) continue
    candles.push({ openTime, closeTime: openTime + intervalMs - 1, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 })
  }
  return candles.slice(0, -1)
}

export async function fetchForex(symbol: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<FetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetchImpl(`${krakenBase()}/0/public/OHLC?pair=${encodeURIComponent(symbol)}&interval=60`, { signal: controller.signal })
    if (!res.ok) throw new Error(`Kraken returned HTTP ${res.status}`)
    const candles = parseKrakenOhlc(await res.json())
    if (!candles.length) throw new Error('Kraken returned no closed candles')
    return { ok: true, candles }
  } catch (e) {
    return { ok: false, reason: safeReason(e) }
  } finally {
    clearTimeout(timer)
  }
}

/* ---------------- stocks and index ETFs: Alpaca market data ---------------- */

export function alpacaDataBase(): string {
  return (process.env.MRCASH_ALPACA_DATA_URL || 'https://data.alpaca.markets').replace(/\/$/, '')
}

/** Alpaca bars: { bars: { SYM: [{ t, o, h, l, c, v }] } }. Returns closed hourly candles per symbol. */
export function parseAlpacaBars(body: unknown, now: number, intervalMs = HOUR): Record<string, Candle[]> {
  const b = body as { bars?: Record<string, unknown> }
  if (!b || typeof b !== 'object' || !b.bars || typeof b.bars !== 'object') throw new Error('unexpected Alpaca response')
  const out: Record<string, Candle[]> = {}
  for (const [sym, list] of Object.entries(b.bars)) {
    if (!Array.isArray(list)) continue
    const candles: Candle[] = []
    for (const x of list as Array<Record<string, unknown>>) {
      const openTime = Date.parse(String(x.t))
      const [open, high, low, close, volume] = [x.o, x.h, x.l, x.c, x.v].map(Number)
      if (![openTime, open, high, low, close].every(Number.isFinite)) continue
      if (openTime + intervalMs > now) continue // still forming
      candles.push({ openTime, closeTime: openTime + intervalMs - 1, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 })
    }
    candles.sort((a, c) => a.openTime - c.openTime)
    out[sym] = candles
  }
  return out
}

/** One call for every stock and ETF on the list. Without keys, says so rather than guessing. */
export async function fetchStocks(symbols: string[], now = Date.now(), fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Record<string, FetchResult>> {
  const out: Record<string, FetchResult> = {}
  if (!symbols.length) return out
  const cfg = alpacaConfig()
  if (!cfg) {
    for (const s of symbols) out[s] = { ok: false, reason: 'not connected: add read-only Alpaca keys (MRCASH_ALPACA_KEY / _SECRET) to watch stocks and indexes' }
    return out
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const start = new Date(now - 21 * 24 * HOUR).toISOString()
    const url = `${alpacaDataBase()}/v2/stocks/bars?symbols=${encodeURIComponent(symbols.join(','))}&timeframe=1Hour&start=${encodeURIComponent(start)}&limit=10000&feed=iex&adjustment=raw`
    const res = await fetchImpl(url, { headers: { 'APCA-API-KEY-ID': cfg.key, 'APCA-API-SECRET-KEY': cfg.secret, accept: 'application/json' }, signal: controller.signal })
    if (res.status === 401 || res.status === 403) throw new Error('Alpaca rejected the keys for market data')
    if (!res.ok) throw new Error(`Alpaca returned HTTP ${res.status}`)
    const bars = parseAlpacaBars(await res.json(), now)
    for (const s of symbols) {
      const c = (bars[s] || []).slice(-200)
      out[s] = c.length ? { ok: true, candles: c } : { ok: false, reason: 'Alpaca returned no bars for this symbol' }
    }
  } catch (e) {
    const reason = safeReason(e)
    for (const s of symbols) out[s] = { ok: false, reason }
  } finally {
    clearTimeout(timer)
  }
  return out
}

/** Which feeds are pointed somewhere other than the real venue (a mock or a proxy). */
export function sourceOverrides(): Record<SourceId, boolean> {
  return {
    binance: !!process.env.MRCASH_MARKET_URL,
    kraken: !!process.env.MRCASH_KRAKEN_PUBLIC_URL,
    alpaca: !!process.env.MRCASH_ALPACA_DATA_URL,
  }
}
