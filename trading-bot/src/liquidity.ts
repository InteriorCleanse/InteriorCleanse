/**
 * Liquidity: where the stop losses are, and when they get taken.
 *
 * Every obvious high has sell-stops sitting just above it, and every
 * obvious low has buy-stops just below. A SWEEP is when price pokes
 * past one of those levels — triggering the stops — and then closes
 * back on the original side. The poke was the point. After the sweep,
 * price often reverses hard, because the people who were forced out
 * have to get back in.
 *
 * A BREAK is different: price closes clean through the level and keeps
 * going. The bot tells the two apart and only calls the first a sweep.
 */

import { config } from '../config.ts'
import type { Candle, Level, Sweep, Swing } from './types.ts'

const HIGH_KINDS = new Set(['asia-high', 'london-high', 'ny-high', 'pdh', 'eqh'])

export function isHighLevel(l: Level): boolean {
  return HIGH_KINDS.has(l.kind)
}

/**
 * Checks one candle against every unswept level. A level can be swept
 * once; after that it's spent. Mutates `levels` to record what happened.
 */
export function detectSweeps(candle: Candle, i: number, levels: Level[], atr: number): Sweep[] {
  const out: Sweep[] = []
  const minDepth = atr * config.ict.sweepMinDepthAtr

  for (const l of levels) {
    if (l.sweptAt !== undefined || l.brokenAt !== undefined) continue
    // A level formed by this very candle can't be swept by it.
    if (l.time >= candle.openTime) continue

    if (isHighLevel(l)) {
      if (candle.high >= l.price + minDepth) {
        if (candle.close < l.price) {
          l.sweptAt = candle.openTime
          out.push({ level: l, side: 'above', index: i, time: candle.openTime, wick: candle.high, depthAtr: (candle.high - l.price) / atr })
        } else {
          l.brokenAt = candle.openTime
        }
      }
    } else {
      if (candle.low <= l.price - minDepth) {
        if (candle.close > l.price) {
          l.sweptAt = candle.openTime
          out.push({ level: l, side: 'below', index: i, time: candle.openTime, wick: candle.low, depthAtr: (l.price - candle.low) / atr })
        } else {
          l.brokenAt = candle.openTime
        }
      }
    }
  }
  return out
}

/**
 * Equal highs / equal lows: two swing points within a hair of each
 * other. Traders see a "double top" and put stops above it — which is
 * exactly why it gets swept.
 */
export function equalLevels(swings: Swing[], atr: number, tolAtr = 0.1): Level[] {
  const out: Level[] = []
  const tol = atr * tolAtr
  const recent = swings.slice(-12)
  for (let a = 0; a < recent.length; a++) {
    for (let b = a + 1; b < recent.length; b++) {
      const s1 = recent[a]
      const s2 = recent[b]
      if (s1.kind !== s2.kind) continue
      if (Math.abs(s1.price - s2.price) > tol) continue
      const price = s1.kind === 'high' ? Math.max(s1.price, s2.price) : Math.min(s1.price, s2.price)
      const kind = s1.kind === 'high' ? 'eqh' : 'eql'
      if (out.some((l) => l.kind === kind && Math.abs(l.price - price) <= tol)) continue
      out.push({ kind, price, time: s2.time, label: s1.kind === 'high' ? 'Equal highs' : 'Equal lows' })
    }
  }
  return out
}

/** Plain-English description of a sweep. */
export function describeSweep(s: Sweep): string {
  const what = s.side === 'above' ? 'ran the stops above' : 'ran the stops below'
  return `Price ${what} the ${s.level.label} ($${s.level.price.toFixed(2)}) by ${s.depthAtr.toFixed(2)} ATR and closed back ${s.side === 'above' ? 'below' : 'above'} it.`
}
