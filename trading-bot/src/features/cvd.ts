/**
 * Cumulative volume delta: the running sum of each candle's delta from an
 * anchor (the start of the trading day or of the session). Price rising
 * while CVD falls means buyers are lifting price on thin aggression —
 * the classic divergence. It only means anything when every trade since
 * the anchor was seen, so the reading carries that guarantee explicitly.
 */

import type { TradeAccumulator } from './trades.ts'
import type { CvdReading } from './types.ts'

/**
 * CVD over the buckets `fromOpenTime`..`toOpenTime`. Returns null when no
 * bucket in the range has trades. `complete` is true only when the tape
 * was trusted before the first bucket opened and every bucket is present.
 */
export function cvdBetween(tape: TradeAccumulator, fromOpenTime: number, toOpenTime: number): CvdReading | null {
  const s = tape.sums(fromOpenTime, toOpenTime)
  if (!s) return null
  return { value: s.buyV - s.sellV, valueUsd: s.buyPv - s.sellPv, anchoredAt: fromOpenTime, candles: s.buckets, complete: s.exact, restartedAt: null }
}

/**
 * When the anchored CVD is not complete but the stream has been trusted
 * since some later point, a CVD restarted from that point — with the
 * restart marked — is still honest. `restartedAt` is that moment.
 */
export function cvdSinceTrusted(tape: TradeAccumulator, toOpenTime: number): CvdReading | null {
  const since = tape.trustedSince()
  if (since === null) return null
  const first = Math.ceil(since / tape.intervalMs) * tape.intervalMs // the first bucket that opened after trust began
  if (first > toOpenTime) return null
  const r = cvdBetween(tape, first, toOpenTime)
  return r ? { ...r, restartedAt: since } : null
}
