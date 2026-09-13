/**
 * Market structure: how big candles are, where the swing points sit,
 * and when a swing gets broken.
 *
 *   ATR           — "average true range": how far price typically moves
 *                   in one candle. Every other threshold in the bot is
 *                   measured in ATRs so it works on any symbol.
 *   Swing high    — a candle whose high is above its neighbours on both
 *                   sides. Swing low is the mirror. These are only
 *                   confirmed a few candles AFTER they happen, and the
 *                   bot never pretends to know one early.
 *   Displacement  — an unusually big-bodied candle. Institutions moving
 *                   price leave these behind.
 *   Structure shift — price closing beyond the most recent swing point
 *                   in the opposite direction. A change of character.
 */

import { config } from '../config.ts'
import type { Candle, StructureShift, Swing } from './types.ts'

export function trueRange(c: Candle, prev: Candle | undefined): number {
  if (!prev) return c.high - c.low
  return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
}

/** Average true range over the `period` candles ending at `i`. Uses what it has if history is short. */
export function atrAt(candles: Candle[], i: number, period = config.ict.atrPeriod): number {
  const from = Math.max(1, i - period + 1)
  let sum = 0
  let n = 0
  for (let j = from; j <= i; j++) {
    sum += trueRange(candles[j], candles[j - 1])
    n++
  }
  if (n === 0) return candles[i].high - candles[i].low || candles[i].close * 0.001
  return sum / n
}

export function body(c: Candle): number {
  return Math.abs(c.close - c.open)
}

export function isBullish(c: Candle): boolean {
  return c.close > c.open
}

/** A candle whose body is at least `mult` ATRs — the footprint of real buying or selling. */
export function isDisplacement(c: Candle, atr: number, mult = config.ict.displacementBodyAtr): boolean {
  return body(c) >= atr * mult
}

/**
 * Confirms swing points as candles arrive. A swing at index j is only
 * known once `lookback` candles have closed after it — so a swing is
 * announced at index j + lookback, never earlier.
 */
export class SwingTracker {
  readonly swings: Swing[] = []
  private readonly k = config.ict.swingLookback

  /** Call with every candle index in order. Returns the swing confirmed on this candle, if any. */
  add(candles: Candle[], i: number): Swing | null {
    const j = i - this.k
    if (j < this.k) return null
    const c = candles[j]
    let isHigh = true
    let isLow = true
    for (let d = 1; d <= this.k; d++) {
      if (candles[j - d].high >= c.high || candles[j + d].high >= c.high) isHigh = false
      if (candles[j - d].low <= c.low || candles[j + d].low <= c.low) isLow = false
    }
    if (isHigh) {
      const s: Swing = { index: j, time: c.openTime, price: c.high, kind: 'high' }
      this.swings.push(s)
      return s
    }
    if (isLow) {
      const s: Swing = { index: j, time: c.openTime, price: c.low, kind: 'low' }
      this.swings.push(s)
      return s
    }
    return null
  }

  /** The most recent confirmed swing of a kind, optionally formed after a given index. */
  latest(kind: 'high' | 'low', afterIndex = -1): Swing | null {
    for (let n = this.swings.length - 1; n >= 0; n--) {
      const s = this.swings[n]
      if (s.kind === kind && s.index > afterIndex) return s
    }
    return null
  }

  recent(count: number): Swing[] {
    return this.swings.slice(-count)
  }
}

/**
 * Watches for structure shifts. Bullish: a close above the latest
 * confirmed swing high. Bearish: a close below the latest swing low.
 * Each swing can only be broken once.
 */
export class StructureTracker {
  readonly shifts: StructureShift[] = []
  private readonly broken = new Set<number>()

  check(candles: Candle[], i: number, swings: SwingTracker): StructureShift | null {
    const c = candles[i]
    const sh = swings.latest('high')
    if (sh && !this.broken.has(sh.index) && sh.index < i && c.close > sh.price) {
      this.broken.add(sh.index)
      const shift: StructureShift = { direction: 'bullish', index: i, time: c.openTime, brokeSwing: sh }
      this.shifts.push(shift)
      return shift
    }
    const sl = swings.latest('low')
    if (sl && !this.broken.has(sl.index) && sl.index < i && c.close < sl.price) {
      this.broken.add(sl.index)
      const shift: StructureShift = { direction: 'bearish', index: i, time: c.openTime, brokeSwing: sl }
      this.shifts.push(shift)
      return shift
    }
    return null
  }

  /** The latest shift in a direction that happened at or after an index. */
  latest(direction: 'bullish' | 'bearish', sinceIndex: number): StructureShift | null {
    for (let n = this.shifts.length - 1; n >= 0; n--) {
      const s = this.shifts[n]
      if (s.index < sinceIndex) break
      if (s.direction === direction) return s
    }
    return null
  }
}
