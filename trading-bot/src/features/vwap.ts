/**
 * VWAP — the volume-weighted average price since an anchor (the start
 * of the trading day, or of the current session). Where most of the
 * money changed hands. Price above it means buyers have paid up on
 * average; far above it means they are stretched.
 *
 * From the tape it is exact: every trade's price times its size. From
 * candles it is an approximation: a candle's volume is assigned to its
 * typical price (high + low + close) / 3 because nothing finer is known.
 * The reading always says which one it is.
 */

import type { Candle } from '../types.ts'
import type { VwapReading } from './types.ts'

/** Running sums that define a VWAP: Σ price·volume, Σ volume, Σ price²·volume. */
export type VwapSums = { pv: number; v: number; p2v: number }

export function emptySums(): VwapSums { return { pv: 0, v: 0, p2v: 0 } }

export function addSums(a: VwapSums, b: VwapSums): VwapSums { return { pv: a.pv + b.pv, v: a.v + b.v, p2v: a.p2v + b.p2v } }

export function typicalPrice(c: Candle): number { return (c.high + c.low + c.close) / 3 }

/** The sums over candles `from`..`to` inclusive, volume at each candle's typical price. */
export function candleSums(candles: Candle[], from: number, to: number): VwapSums {
  const s = emptySums()
  for (let j = Math.max(0, from); j <= to; j++) {
    const c = candles[j]
    const tp = typicalPrice(c)
    s.pv += tp * c.volume
    s.v += c.volume
    s.p2v += tp * tp * c.volume
  }
  return s
}

/** Turns sums into a reading, with bands `sd` standard deviations either side. Null when nothing traded. */
export function vwapFromSums(s: VwapSums, anchoredAt: number, candles: number, sd = 1): VwapReading | null {
  if (s.v <= 0) return null
  const vwap = s.pv / s.v
  const variance = Math.max(0, s.p2v / s.v - vwap * vwap)
  const dev = Math.sqrt(variance)
  return { vwap, upper: vwap + sd * dev, lower: vwap - sd * dev, sd: dev, anchoredAt, candles, volume: s.v }
}

export function vwapFromCandles(candles: Candle[], from: number, to: number, sd = 1): VwapReading | null {
  if (to < from || from < 0 || to >= candles.length) return null
  return vwapFromSums(candleSums(candles, from, to), candles[from].openTime, to - from + 1, sd)
}
