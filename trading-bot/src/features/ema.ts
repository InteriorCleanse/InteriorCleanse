/**
 * Exponential moving averages on an hourly resample of the candles.
 * These are the same readings the market-state vote has always used;
 * they now live here so anything else can read them without
 * recomputing them differently.
 */

import { config } from '../../config.ts'
import type { Candle } from '../types.ts'
import type { HourlyAverages } from './types.ts'

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  for (let i = 0; i < values.length; i++) out.push(i === 0 ? values[0] : values[i] * k + out[i - 1] * (1 - k))
  return out
}

/** How many candles make one hour, judged from the spacing of the first two. */
export function barsPerHour(candles: Candle[]): number {
  const stepMs = candles.length > 1 ? candles[1].openTime - candles[0].openTime : 300_000
  return Math.max(1, Math.round(3_600_000 / stepMs))
}

/** The close of every `perBar`-th candle, aligned so the last sample is candle `endIndex`. */
export function resampleCloses(candles: Candle[], perBar: number, endIndex = candles.length - 1): number[] {
  const out: number[] = []
  for (let end = endIndex; end >= perBar - 1; end -= perBar) out.unshift(candles[end].close)
  return out
}

/** The 20- and 50-hour averages as of candle `i`, or null when there is not enough history. */
export function hourlyAverages(candles: Candle[], i: number): HourlyAverages | null {
  const perBar = barsPerHour(candles)
  const hourly = resampleCloses(candles, perBar, i)
  if (hourly.length < config.features.hourlyAveragesMinHours) return null
  const e20 = ema(hourly, 20)
  const e50 = ema(hourly, 50)
  return { ema20: e20[e20.length - 1], ema50: e50[e50.length - 1], ema20Prev: e20[Math.max(0, e20.length - 7)], hours: hourly.length }
}
