/**
 * Fair value gaps, and what happens to them afterwards.
 *
 * A FAIR VALUE GAP (FVG) is three candles where the first and third
 * don't overlap — price moved so fast that a slice of prices never
 * traded. Markets tend to come back and fill those slices.
 *
 *   Bullish FVG: candle 1's high is below candle 3's low. A gap on the way UP.
 *   Bearish FVG: candle 1's low is above candle 3's high. A gap on the way DOWN.
 *
 * An INVERSION FVG (IFVG) is a gap that failed. Price came back, and
 * instead of respecting the gap it CLOSED straight through it. A gap
 * that fails flips its role: a bullish gap that gets closed below now
 * acts as resistance, a bearish gap that gets closed above now acts as
 * support. The entry you asked for is the retest of that flipped gap.
 *
 * Lifecycle:  fresh → mitigated (touched) → inverted (closed through) → retested
 */

import { config } from '../config.ts'
import { body } from './structure.ts'
import type { Candle, FVG } from './types.ts'

/** Looks at candles i-2, i-1, i and returns a gap if one just formed. */
export function detectFvg(candles: Candle[], i: number, atr: number): FVG | null {
  if (i < 2) return null
  const a = candles[i - 2]
  const b = candles[i - 1]
  const c = candles[i]
  const minSize = atr * config.ict.fvgMinSizeAtr
  const fromDisplacement = body(b) >= atr * config.ict.displacementBodyAtr

  if (c.low > a.high && c.low - a.high >= minSize) {
    return {
      id: `fvg-${i}-up`,
      direction: 'bullish',
      top: c.low,
      bottom: a.high,
      createdIndex: i,
      createdTime: c.openTime,
      sizeAtr: (c.low - a.high) / atr,
      fromDisplacement,
      state: 'fresh',
    }
  }
  if (c.high < a.low && a.low - c.high >= minSize) {
    return {
      id: `fvg-${i}-down`,
      direction: 'bearish',
      top: a.low,
      bottom: c.high,
      createdIndex: i,
      createdTime: c.openTime,
      sizeAtr: (a.low - c.high) / atr,
      fromDisplacement,
      state: 'fresh',
    }
  }
  return null
}

/**
 * After a gap inverts, which way does it now lean?
 *   a bearish gap closed ABOVE becomes support — bullish
 *   a bullish gap closed BELOW becomes resistance — bearish
 */
export function ifvgRole(f: FVG): 'support' | 'resistance' | null {
  if (f.state !== 'inverted') return null
  return f.direction === 'bearish' ? 'support' : 'resistance'
}

export type FvgEvents = {
  created: FVG | null
  mitigated: FVG[]
  inverted: FVG[]
  retested: FVG[]
}

/** Keeps every gap that still matters and moves it through its life, candle by candle. */
export class FvgTracker {
  readonly fvgs: FVG[] = []

  update(candles: Candle[], i: number, atr: number): FvgEvents {
    const c = candles[i]
    const events: FvgEvents = { created: null, mitigated: [], inverted: [], retested: [] }

    for (const f of this.fvgs) {
      if (f.state === 'expired') continue
      if (i - f.createdIndex > config.ict.fvgMaxAgeCandles) {
        f.state = 'expired'
        continue
      }
      // The candle that made the gap can't also trade back into it.
      if (i <= f.createdIndex) continue

      if (f.state === 'fresh' || f.state === 'mitigated') {
        const closedThrough =
          f.direction === 'bullish' ? c.close < f.bottom : c.close > f.top
        if (closedThrough) {
          f.state = 'inverted'
          f.invertedIndex = i
          f.invertedTime = c.openTime
          events.inverted.push(f)
          continue
        }
        const touched = c.low <= f.top && c.high >= f.bottom
        if (touched && f.state === 'fresh') {
          f.state = 'mitigated'
          events.mitigated.push(f)
        }
        continue
      }

      if (f.state === 'inverted' && f.invertedIndex !== undefined && i > f.invertedIndex) {
        // Now support: price dips into the zone and closes at or above its floor.
        // Now resistance: price pokes into the zone and closes at or below its ceiling.
        const retest =
          ifvgRole(f) === 'support'
            ? c.low <= f.top && c.close >= f.bottom
            : c.high >= f.bottom && c.close <= f.top
        if (retest && f.retestIndex === undefined) {
          f.retestIndex = i
          events.retested.push(f)
        }
        // A close through the far side again means the inversion also failed — done with it.
        const failed = ifvgRole(f) === 'support' ? c.close < f.bottom : c.close > f.top
        if (failed) f.state = 'expired'
      }
    }

    const created = detectFvg(candles, i, atr)
    if (created) {
      this.fvgs.push(created)
      events.created = created
    }
    return events
  }

  active(): FVG[] {
    return this.fvgs.filter((f) => f.state !== 'expired')
  }

  /** Inverted gaps that now lean a given way, newest first. */
  inverted(role: 'support' | 'resistance'): FVG[] {
    return this.fvgs.filter((f) => ifvgRole(f) === role).reverse()
  }

  /** Untouched or lightly touched gaps of a direction, newest first. */
  open(direction: 'bullish' | 'bearish'): FVG[] {
    return this.fvgs
      .filter((f) => f.direction === direction && (f.state === 'fresh' || f.state === 'mitigated'))
      .reverse()
  }

  /** Is this candle sitting inside the zone (or trading through it)? */
  static touches(f: FVG, c: Candle): boolean {
    return c.low <= f.top && c.high >= f.bottom
  }
}
