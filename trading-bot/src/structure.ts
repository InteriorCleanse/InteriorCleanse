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
 *   HH / HL / LH / LL — each swing compared with the previous swing of
 *                   the same kind. Higher highs and higher lows = an
 *                   uptrend. Lower highs and lower lows = a downtrend.
 *   Displacement  — an unusually big-bodied candle. Institutions moving
 *                   price leave these behind.
 *   BOS           — break of structure: a close beyond a swing point IN
 *                   the direction of the trend. Continuation.
 *   CHoCH         — change of character: the first close beyond a swing
 *                   point AGAINST the trend. The first hint of a turn.
 */

import { config } from '../config.ts'
import type { Candle, LabelledSwing, StructureShift, Swing } from './types.ts'

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
 *
 * Every swing is labelled against the previous swing of its kind:
 * HH (higher high), LH (lower high), HL (higher low), LL (lower low).
 * The first high is just H and the first low just L.
 */
export class SwingTracker {
  readonly swings: LabelledSwing[] = []
  private readonly k = config.ict.swingLookback

  /** Call with every candle index in order. Returns the swing confirmed on this candle, if any. */
  add(candles: Candle[], i: number): LabelledSwing | null {
    const j = i - this.k
    if (j < this.k) return null
    const c = candles[j]
    let isHigh = true
    let isLow = true
    for (let d = 1; d <= this.k; d++) {
      if (candles[j - d].high >= c.high || candles[j + d].high >= c.high) isHigh = false
      if (candles[j - d].low <= c.low || candles[j + d].low <= c.low) isLow = false
    }
    if (isHigh) return this.push({ index: j, time: c.openTime, price: c.high, kind: 'high' })
    if (isLow) return this.push({ index: j, time: c.openTime, price: c.low, kind: 'low' })
    return null
  }

  private push(s: Swing): LabelledSwing {
    const prev = this.latest(s.kind)
    let label: LabelledSwing['label'] = s.kind === 'high' ? 'H' : 'L'
    if (prev) {
      if (s.kind === 'high') label = s.price > prev.price ? 'HH' : 'LH'
      else label = s.price > prev.price ? 'HL' : 'LL'
    }
    const ls: LabelledSwing = { ...s, label }
    this.swings.push(ls)
    return ls
  }

  /** The most recent confirmed swing of a kind, optionally formed after a given index. */
  latest(kind: 'high' | 'low', afterIndex = -1): LabelledSwing | null {
    for (let n = this.swings.length - 1; n >= 0; n--) {
      const s = this.swings[n]
      if (s.kind === kind && s.index > afterIndex) return s
    }
    return null
  }

  recent(count: number): LabelledSwing[] {
    return this.swings.slice(-count)
  }

  /**
   * The trend the swings describe: higher high AND higher low = bullish,
   * lower high AND lower low = bearish, anything else = no clear trend.
   */
  trend(): 'bullish' | 'bearish' | null {
    const h = this.latest('high')
    const l = this.latest('low')
    if (!h || !l) return null
    if (h.label === 'HH' && l.label === 'HL') return 'bullish'
    if (h.label === 'LH' && l.label === 'LL') return 'bearish'
    return null
  }
}

/**
 * Watches for structure breaks. Bullish: a close above the latest
 * confirmed swing high. Bearish: a close below the latest swing low.
 * Each swing can only be broken once.
 *
 * Every break is labelled BOS or CHoCH by comparing it with the trend the
 * previous breaks established. The very first break, with no trend yet,
 * is called a BOS.
 */
export class StructureTracker {
  readonly shifts: StructureShift[] = []
  private readonly broken = new Set<number>()
  /** The trend as the breaks define it: the direction of the last break. */
  trend: 'bullish' | 'bearish' | null = null

  check(candles: Candle[], i: number, swings: SwingTracker): StructureShift | null {
    const c = candles[i]
    const sh = swings.latest('high')
    if (sh && !this.broken.has(sh.index) && sh.index < i && c.close > sh.price) {
      this.broken.add(sh.index)
      return this.record('bullish', i, c, sh)
    }
    const sl = swings.latest('low')
    if (sl && !this.broken.has(sl.index) && sl.index < i && c.close < sl.price) {
      this.broken.add(sl.index)
      return this.record('bearish', i, c, sl)
    }
    return null
  }

  private record(direction: 'bullish' | 'bearish', i: number, c: Candle, swing: Swing): StructureShift {
    const kind: StructureShift['kind'] = this.trend === null || this.trend === direction ? 'BOS' : 'CHoCH'
    this.trend = direction
    const shift: StructureShift = { direction, kind, index: i, time: c.openTime, brokeSwing: swing, price: c.close }
    this.shifts.push(shift)
    return shift
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

  /** The latest CHoCH (a break against the trend) at or after an index. */
  latestChoch(sinceIndex: number): StructureShift | null {
    for (let n = this.shifts.length - 1; n >= 0; n--) {
      const s = this.shifts[n]
      if (s.index < sinceIndex) break
      if (s.kind === 'CHoCH') return s
    }
    return null
  }
}

/** Plain-English description of a break, for the chart and the story. */
export function describeShift(s: StructureShift): string {
  const what = s.direction === 'bullish' ? `closed above the swing high at $${s.brokeSwing.price.toFixed(2)}` : `closed below the swing low at $${s.brokeSwing.price.toFixed(2)}`
  return s.kind === 'BOS'
    ? `Break of structure (BOS): price ${what}, continuing the ${s.direction} trend.`
    : `Change of character (CHoCH): price ${what} — the first break against the previous trend, so the trend may be turning ${s.direction}.`
}

/** Plain-English description of a labelled swing. */
export function describeSwing(s: LabelledSwing): string {
  const names: Record<LabelledSwing['label'], string> = {
    HH: 'a higher high — buyers pushed further than last time',
    HL: 'a higher low — the dip held above the previous one',
    LH: 'a lower high — the bounce fell short of the previous peak',
    LL: 'a lower low — sellers pushed further than last time',
    H: 'the first confirmed swing high',
    L: 'the first confirmed swing low',
  }
  return `Swing ${s.kind} $${s.price.toFixed(2)} (${s.label}): ${names[s.label]}.`
}
