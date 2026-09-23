/**
 * Average true range, and what "typical" ATR looked like over the last
 * day. The per-candle ATR itself is defined in structure.ts — every
 * threshold in the bot is measured in it — and this file only wraps it.
 */

import { atrAt } from '../structure.ts'
import type { Candle } from '../types.ts'

export { atrAt }

/**
 * The median of ATR samples taken every 12 candles across the last 288
 * (one day of 5-minute candles), ending at `i`. Falls back to the
 * current ATR when there is no history to sample.
 */
export function typicalAtr(candles: Candle[], i: number, atr = atrAt(candles, i)): number {
  const samples: number[] = []
  for (let j = Math.max(14, i + 1 - 288); j <= i; j += 12) samples.push(atrAt(candles, j))
  samples.sort((x, y) => x - y)
  return samples[Math.floor(samples.length / 2)] || atr
}
