/**
 * MARKET WATCH — the scan. A pure function over closed hourly candles.
 *
 * It reuses the engine's own readers (the market-state vote in regime.ts, the
 * gap detector in fvg.ts, the ATR in structure.ts) and adds only plain
 * bookkeeping: the last price, the move over 24 hours, and whether the last
 * few candles took out the previous day's high or low. It decides nothing and
 * proposes no trade — it is the "Scan" and "Alerts" part of the loop, and the
 * notes it writes are observations, not signals.
 *
 * Every number comes from the candles passed in. With too few candles the
 * field is null and the note says NOT ENOUGH DATA rather than estimating.
 */
import type { Candle } from '../types.ts'
import { assessMarket } from '../regime.ts'
import { detectFvg } from '../fvg.ts'
import { atrAt } from '../structure.ts'
import type { MarketKind } from './sources.ts'

export type ScanNote = {
  /** Stable id, so the same observation raises one alert, not one per scan. */
  key: string
  kind: 'swept-high' | 'swept-low' | 'broke-high' | 'broke-low' | 'gap-up' | 'gap-down' | 'big-candle'
  at: number
  text: string
}

export type MarketScan = {
  price: number | null
  changePct24h: number | null
  high24h: number | null
  low24h: number | null
  prevDay: { high: number; low: number; day: string } | null
  trend: 'uptrend' | 'downtrend' | 'range' | null
  strength: number | null
  volatility: 'quiet' | 'normal' | 'wild' | null
  lastCloseAt: number | null
  status: 'live' | 'stale' | 'closed' | 'no data'
  statusText: string
  notes: ScanNote[]
  /** The last 48 closes, oldest first, for a sparkline. */
  spark: number[]
}

const HOUR = 3_600_000
const tzFor = (kind: MarketKind) => (kind === 'stock' || kind === 'index' ? 'America/New_York' : 'UTC')
const dayKey = (ms: number, tz: string) => new Date(ms).toLocaleDateString('en-CA', { timeZone: tz })

export function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 10) return n.toFixed(2)
  return n.toFixed(4)
}

export function scanMarket(candles: Candle[], kind: MarketKind, symbol: string, now = Date.now()): MarketScan {
  const empty: MarketScan = { price: null, changePct24h: null, high24h: null, low24h: null, prevDay: null, trend: null, strength: null, volatility: null, lastCloseAt: null, status: 'no data', statusText: 'NOT ENOUGH DATA', notes: [], spark: [] }
  const n = candles.length
  if (n === 0) return empty
  const last = candles[n - 1]
  const out: MarketScan = { ...empty, price: last.close, lastCloseAt: last.closeTime, spark: candles.slice(-48).map((c) => c.close) }

  // Freshness: a market that trades round the clock should have closed a candle
  // within the last two hours; a stock or FX market that has not is closed.
  const ageH = (now - last.closeTime) / HOUR
  if (ageH <= 2) { out.status = 'live'; out.statusText = 'updating' }
  else if (kind === 'crypto') { out.status = 'stale'; out.statusText = `STALE: last candle ${Math.round(ageH)}h ago` }
  else { out.status = 'closed'; out.statusText = `no new candle for ${Math.round(ageH)}h — ${kind === 'forex' ? 'the FX market' : 'the US market'} is closed or the feed paused; last close shown` }

  // The last 24 hours of candles.
  const dayAgo = last.closeTime - 24 * HOUR
  const window = candles.filter((c) => c.openTime > dayAgo)
  if (window.length >= 6) {
    const ref = window[0].open
    out.changePct24h = ref ? ((last.close - ref) / ref) * 100 : null
    out.high24h = Math.max(...window.map((c) => c.high))
    out.low24h = Math.min(...window.map((c) => c.low))
  }

  // Market state from the engine's own vote (needs a few days of candles).
  if (n >= 60) {
    try {
      const st = assessMarket(candles, null, null, null, now)
      out.trend = st.trend
      out.strength = st.strength
      out.volatility = st.volatility
    } catch {
      // Too little structure to read; leave it null rather than guess.
    }
  }

  // The previous trading day's high and low, in the market's own calendar.
  const tz = tzFor(kind)
  const today = dayKey(last.openTime, tz)
  const days = [...new Set(candles.map((c) => dayKey(c.openTime, tz)))].filter((d) => d < today).sort()
  const prev = days[days.length - 1]
  if (prev) {
    const pc = candles.filter((c) => dayKey(c.openTime, tz) === prev)
    if (pc.length >= (kind === 'crypto' || kind === 'forex' ? 12 : 3)) {
      out.prevDay = { high: Math.max(...pc.map((c) => c.high)), low: Math.min(...pc.map((c) => c.low)), day: prev }
    }
  }

  // Observations on the last few closed candles of today.
  const recent = candles.slice(-6).filter((c) => dayKey(c.openTime, tz) === today)
  if (out.prevDay) {
    const { high, low } = out.prevDay
    for (const c of recent) {
      if (c.high > high && c.close < high) out.notes.push({ key: `${symbol}:swept-high:${out.prevDay.day}`, kind: 'swept-high', at: c.closeTime, text: `Ran above yesterday's high (${fmtPrice(high)}) and closed back under it — a raid on the stops there.` })
      else if (c.close > high) out.notes.push({ key: `${symbol}:broke-high:${out.prevDay.day}`, kind: 'broke-high', at: c.closeTime, text: `Closed above yesterday's high (${fmtPrice(high)}).` })
      if (c.low < low && c.close > low) out.notes.push({ key: `${symbol}:swept-low:${out.prevDay.day}`, kind: 'swept-low', at: c.closeTime, text: `Ran below yesterday's low (${fmtPrice(low)}) and closed back above it — a raid on the stops there.` })
      else if (c.close < low) out.notes.push({ key: `${symbol}:broke-low:${out.prevDay.day}`, kind: 'broke-low', at: c.closeTime, text: `Closed below yesterday's low (${fmtPrice(low)}).` })
    }
  }
  if (n >= 20) {
    for (let i = Math.max(2, n - 3); i < n; i++) {
      const atr = atrAt(candles, i)
      const g = detectFvg(candles, i, atr)
      if (g) out.notes.push({ key: `${symbol}:gap:${g.createdTime}`, kind: g.direction === 'bullish' ? 'gap-up' : 'gap-down', at: candles[i].closeTime, text: `Left a ${g.direction === 'bullish' ? 'bullish' : 'bearish'} gap between ${fmtPrice(g.bottom)} and ${fmtPrice(g.top)} (${g.sizeAtr.toFixed(1)} ATR).` })
      const body = Math.abs(candles[i].close - candles[i].open)
      if (atr > 0 && body >= 2.5 * atr) out.notes.push({ key: `${symbol}:big:${candles[i].openTime}`, kind: 'big-candle', at: candles[i].closeTime, text: `One-hour candle moved ${(body / atr).toFixed(1)}× its usual range, ${candles[i].close > candles[i].open ? 'up' : 'down'}.` })
    }
  }
  // One note per key, newest kept.
  const byKey = new Map<string, ScanNote>()
  for (const x of out.notes) byKey.set(x.key, x)
  out.notes = [...byKey.values()].sort((a, b) => b.at - a.at)
  return out
}
