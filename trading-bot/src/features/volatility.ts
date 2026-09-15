/** Is the market moving more or less than it usually does? */

import type { Candle } from '../types.ts'
import { typicalAtr } from './atr.ts'
import type { VolatilityReading } from './types.ts'

export function volatility(candles: Candle[], i: number, atr: number): VolatilityReading {
  const typical = typicalAtr(candles, i, atr)
  const ratio = typical > 0 ? atr / typical : 1
  return { ratio, typicalAtr: typical, label: ratio < 0.7 ? 'quiet' : ratio > 1.5 ? 'wild' : 'normal' }
}
