/**
 * Delta: buyer-initiated volume minus seller-initiated volume in one
 * candle. Who was hitting whom. Positive = buyers crossed the spread
 * more; negative = sellers did.
 */

import type { TapeBucket } from './trades.ts'
import type { DeltaReading } from './types.ts'

export function deltaOf(b: TapeBucket): DeltaReading {
  return {
    buyV: b.buyV,
    sellV: b.sellV,
    delta: b.buyV - b.sellV,
    buyUsd: b.buyPv,
    sellUsd: b.sellPv,
    deltaUsd: b.buyPv - b.sellPv,
    buyShare: b.v > 0 ? b.buyV / b.v : 0.5,
    trades: b.trades,
    volume: b.v,
  }
}
