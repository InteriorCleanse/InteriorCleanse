/**
 * Order blocks, and what happens to them afterwards.
 *
 * When price moves with force (a DISPLACEMENT candle), the last candle
 * that went the OTHER way just before it is called an ORDER BLOCK. The
 * idea: that was where the big players filled their orders before they
 * pushed price. When price comes back to that candle's range later, the
 * same players often defend it — so it acts as support (bullish OB) or
 * resistance (bearish OB).
 *
 *   Bullish OB: the last red candle before a big green candle.
 *   Bearish OB: the last green candle before a big red candle.
 *
 * THE ZONE DECISION: the block is the whole candle, wick to wick. Some
 * traders use only the body, or the open to the wick; wick to wick is
 * the widest and therefore the most honest about how far price may
 * come back before the level "held". Change it here, in one place.
 *
 * Quality marks the bot records for each block:
 *   - did the displacement also break structure (BOS / CHoCH)?
 *   - did the displacement leave a fair value gap?
 * Both together is the textbook version.
 *
 * Lifecycle:  fresh → mitigated (touched) → broken (closed through).
 * A broken order block flips its role: it becomes a BREAKER block. A
 * bullish OB that price closed below is now resistance, and vice versa.
 */

import { config } from '../config.ts'
import { body, isBullish, isDisplacement } from './structure.ts'
import type { Candle, OrderBlock } from './types.ts'

export type ObContext = { brokeStructure: boolean; leftFvg: boolean }

/**
 * Looks at candle `i`. If it is a displacement candle, finds the last
 * opposite-coloured candle within the previous `lookback` candles and
 * returns it as an order block.
 */
export function detectOrderBlock(candles: Candle[], i: number, atr: number, ctx: ObContext, lookback = config.structure.orderBlockLookback): OrderBlock | null {
  if (i < 1) return null
  const c = candles[i]
  if (!isDisplacement(c, atr)) return null
  const up = isBullish(c)
  for (let j = i - 1; j >= Math.max(0, i - lookback); j--) {
    const p = candles[j]
    if (body(p) === 0) continue
    if (isBullish(p) === up) continue // same colour — keep looking back
    const top = p.high
    const bottom = p.low
    if (top - bottom < atr * 0.05) continue // a doji-sized range is not a zone
    return {
      id: `ob-${j}-${up ? 'up' : 'down'}`,
      direction: up ? 'bullish' : 'bearish',
      top,
      bottom,
      index: j,
      time: p.openTime,
      displacementIndex: i,
      sizeAtr: (top - bottom) / atr,
      withStructureBreak: ctx.brokeStructure,
      withFvg: ctx.leftFvg,
      state: 'fresh',
    }
  }
  return null
}

/** After a block breaks, which way does it now lean? */
export function breakerRole(ob: OrderBlock): 'support' | 'resistance' | null {
  if (ob.state !== 'broken') return null
  return ob.direction === 'bullish' ? 'resistance' : 'support'
}

export type ObEvents = { created: OrderBlock | null; mitigated: OrderBlock[]; broken: OrderBlock[] }

/** Keeps every block that still matters and moves it through its life, candle by candle. */
export class OrderBlockTracker {
  readonly blocks: OrderBlock[] = []

  update(candles: Candle[], i: number, atr: number, ctx: ObContext): ObEvents {
    const c = candles[i]
    const events: ObEvents = { created: null, mitigated: [], broken: [] }

    for (const ob of this.blocks) {
      if (ob.state === 'expired') continue
      if (i - ob.index > config.structure.orderBlockMaxAgeCandles) {
        ob.state = 'expired'
        continue
      }
      // The displacement candle itself, and anything before it, cannot test the block.
      if (i <= ob.displacementIndex) continue

      if (ob.state === 'fresh' || ob.state === 'mitigated') {
        const closedThrough = ob.direction === 'bullish' ? c.close < ob.bottom : c.close > ob.top
        if (closedThrough) {
          ob.state = 'broken'
          ob.brokenIndex = i
          ob.brokenTime = c.openTime
          events.broken.push(ob)
          continue
        }
        const touched = c.low <= ob.top && c.high >= ob.bottom
        if (touched && ob.state === 'fresh') {
          ob.state = 'mitigated'
          ob.mitigatedIndex = i
          events.mitigated.push(ob)
        }
        continue
      }

      if (ob.state === 'broken' && ob.brokenIndex !== undefined && i > ob.brokenIndex) {
        // A breaker that gets closed through again is finished.
        const failed = breakerRole(ob) === 'support' ? c.close < ob.bottom : c.close > ob.top
        if (failed) ob.state = 'expired'
      }
    }

    const created = detectOrderBlock(candles, i, atr, ctx)
    if (created && !this.blocks.some((b) => b.index === created.index && b.direction === created.direction)) {
      this.blocks.push(created)
      events.created = created
    }
    return events
  }

  active(): OrderBlock[] {
    return this.blocks.filter((b) => b.state !== 'expired')
  }

  /** Unbroken blocks of a direction, newest first. */
  open(direction: 'bullish' | 'bearish'): OrderBlock[] {
    return this.blocks.filter((b) => b.direction === direction && (b.state === 'fresh' || b.state === 'mitigated')).reverse()
  }

  /** Breakers that now lean a given way, newest first. */
  breakers(role: 'support' | 'resistance'): OrderBlock[] {
    return this.blocks.filter((b) => breakerRole(b) === role).reverse()
  }

  static touches(ob: OrderBlock, c: Candle): boolean {
    return c.low <= ob.top && c.high >= ob.bottom
  }
}

/** Plain-English description, for the story and the chart tooltip. */
export function describeOrderBlock(ob: OrderBlock): string {
  const kind = ob.direction === 'bullish' ? 'Bullish order block (last red candle before the push up)' : 'Bearish order block (last green candle before the push down)'
  const marks = [ob.withStructureBreak ? 'broke structure' : null, ob.withFvg ? 'left a gap' : null].filter(Boolean).join(' and ')
  const state = ob.state === 'broken' ? ` It has been broken and now acts as a breaker (${breakerRole(ob)}).` : ob.state === 'mitigated' ? ' Price has already come back into it once.' : ' Untouched so far.'
  return `${kind} at $${ob.bottom.toFixed(2)}–$${ob.top.toFixed(2)}${marks ? ` — the move that made it ${marks}.` : '.'}${state}`
}
