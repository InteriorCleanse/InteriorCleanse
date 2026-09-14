/**
 * Hand-built candle days. These are NOT market data: they are small,
 * exact sequences that make one thing happen, so a test can assert it.
 */
import type { Candle } from '../../src/types.ts'

export const STEP = 300_000

export function mk(openTime: number, o: number, h: number, l: number, c: number): Candle {
  return { openTime, closeTime: openTime + STEP - 1, open: o, high: h, low: l, close: c, volume: 1 }
}

/**
 * Thursday 15 Jan 2026. Asia builds a 100–110 range, the early hours drift
 * inside it, then London sweeps the Asia low, displaces up, inverts the
 * gap it left on the way down, and retests it. Exactly one BUY, at the
 * retest candle. (The same day the self-test uses.)
 */
export function setupDay(): { candles: Candle[]; sweepAt: number; retestAt: number } {
  const cs: Candle[] = []
  let t = Date.UTC(2026, 0, 15, 1, 0) // 20:00 ET Wednesday → Thursday's trading day
  const push = (o: number, h: number, l: number, c: number) => { cs.push(mk(t, o, h, l, c)); t += STEP }
  for (let i = 0; i < 48; i++) { const mid = 105 + Math.sin(i / 4) * 4; push(mid, i === 10 ? 110 : mid + 0.5, i === 30 ? 100 : mid - 0.5, mid) }
  for (let i = 0; i < 24; i++) push(105, 105.5, 104.5, 105)
  push(105, 105.2, 103.8, 104)
  push(104, 104.1, 102.9, 103)
  push(103, 103.1, 101.4, 101.5)
  push(101.5, 101.6, 100.4, 100.5)
  const sweepAt = cs.length
  push(100.5, 100.8, 99.3, 100.4)
  push(100.4, 102.6, 100.3, 102.5)
  push(102.5, 104.2, 102.4, 104.1)
  const retestAt = cs.length
  push(104.1, 104.2, 103.4, 103.9)
  return { candles: cs, sweepAt, retestAt }
}

/** The same start, but London never sweeps anything: a quiet, trendless day. No trade. */
export function noSetupDay(): Candle[] {
  const cs: Candle[] = []
  let t = Date.UTC(2026, 0, 15, 1, 0)
  const push = (o: number, h: number, l: number, c: number) => { cs.push(mk(t, o, h, l, c)); t += STEP }
  for (let i = 0; i < 48; i++) { const mid = 105 + Math.sin(i / 4) * 4; push(mid, i === 10 ? 110 : mid + 0.5, i === 30 ? 100 : mid - 0.5, mid) }
  for (let i = 0; i < 60; i++) push(105, 105.4, 104.6, 105 + (i % 2 ? 0.1 : -0.1))
  return cs
}

/** One candle that touches both the stop (99) and the target (102) of a long from 100. */
export function bothHitCandle(openTime = Date.UTC(2026, 0, 15, 14, 0)): Candle {
  return mk(openTime, 100, 102.5, 98.5, 100)
}

/**
 * The night US clocks fall back: Sunday 1 Nov 2026, 01:59 EDT → 01:00 EST.
 * Candles every 5 minutes across the switch, in UTC.
 */
export function dstFallBackCandles(): Candle[] {
  const cs: Candle[] = []
  const start = Date.UTC(2026, 10, 1, 4, 0) // 00:00 EDT
  for (let i = 0; i < 48; i++) cs.push(mk(start + i * STEP, 100, 100.5, 99.5, 100))
  return cs
}
