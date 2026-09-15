/**
 * The liquidity reading: where the nearest intact pools of resting
 * orders sit above and below price, and what has been raided today.
 */

import { isHighLevel } from '../liquidity.ts'
import type { Level, Sweep } from '../types.ts'

export type LiquidityInputs = { levels: Level[]; sweeps: Sweep[]; swingSweeps: Sweep[] }

export type PoolSummary = { kind: Level['kind']; label: string; price: number; distanceAtr: number }

export type LiquidityReading = {
  /** The nearest intact level above price (buy-side liquidity) and below it (sell-side). */
  above: PoolSummary | null
  below: PoolSummary | null
  sweptToday: {
    sessionLevels: number
    swings: number
    /** The most recent raid of either kind. */
    last: { label: string; side: 'above' | 'below'; time: number; depthAtr: number } | null
  }
}

export function liquidityReading(inputs: LiquidityInputs, price: number, atr: number): LiquidityReading {
  const intact = inputs.levels.filter((l) => l.sweptAt === undefined && l.brokenAt === undefined)
  const dist = (l: Level): PoolSummary => ({ kind: l.kind, label: l.label, price: l.price, distanceAtr: atr > 0 ? Math.abs(l.price - price) / atr : 0 })
  const above = intact.filter((l) => isHighLevel(l) && l.price > price).sort((a, b) => a.price - b.price)[0] ?? null
  const below = intact.filter((l) => !isHighLevel(l) && l.price < price).sort((a, b) => b.price - a.price)[0] ?? null
  const all = [...inputs.sweeps, ...inputs.swingSweeps].sort((a, b) => a.index - b.index)
  const last = all[all.length - 1] ?? null
  return {
    above: above ? dist(above) : null,
    below: below ? dist(below) : null,
    sweptToday: {
      sessionLevels: inputs.sweeps.length,
      swings: inputs.swingSweeps.length,
      last: last ? { label: last.level.label, side: last.side, time: last.time, depthAtr: last.depthAtr } : null,
    },
  }
}
