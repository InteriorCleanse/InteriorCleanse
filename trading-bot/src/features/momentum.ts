/** How far price moved over the last few hours, measured in ATRs. */

import type { Candle } from '../types.ts'
import { barsPerHour } from './ema.ts'
import type { MomentumReading } from './types.ts'

export function momentum(candles: Candle[], i: number, atr: number, hours = 3): MomentumReading {
  const perBar = barsPerHour(candles)
  const back = candles[Math.max(0, i - Math.round(hours * perBar))]
  return { moveAtr: atr > 0 ? (candles[i].close - back.close) / atr : 0, hours }
}
