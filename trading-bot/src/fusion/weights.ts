/**
 * How much each family of strategy is worth in each regime. A trend-follower
 * is worth little in a range; a range-fade is worth nothing in a trend. The
 * weights are the one place the bot says "trust this kind of read more right
 * now", and they are logged with every decision so they are never a hidden
 * knob. Zero means the strategy is disallowed in that regime and its vote is
 * ignored entirely.
 */

import { config } from '../../config.ts'
import type { StrategyFamily } from '../strategies/types.ts'
import type { RegimeState } from '../features/regime.ts'

/** Regime-neutral base weight per family (config-overridable). */
export function baseWeight(family: StrategyFamily): number {
  const w = config.fusion.weights as Record<string, number>
  return w[family] ?? 0.5
}

/** How much a family counts in a regime: 1 = full, 0 = disallowed. */
const REGIME_MULTIPLIER: Record<RegimeState, Partial<Record<StrategyFamily, number>>> = {
  'trending-up': { session: 1, trend: 1, breakout: 1, 'order-flow': 1, vwap: 0.7, crossover: 0.6, 'mean-reversion': 0 },
  'trending-down': { session: 1, trend: 1, breakout: 1, 'order-flow': 1, vwap: 0.7, crossover: 0.6, 'mean-reversion': 0 },
  ranging: { session: 1, 'mean-reversion': 1, vwap: 1, 'order-flow': 0.6, crossover: 0.4, trend: 0, breakout: 0 },
  breakout: { session: 1, breakout: 1, 'order-flow': 1, trend: 0.6, vwap: 0.6, crossover: 0.4, 'mean-reversion': 0 },
  transition: { session: 1, 'order-flow': 0.6, vwap: 0.6, breakout: 0.5, crossover: 0.3, trend: 0, 'mean-reversion': 0 },
}

/** The effective weight of a family in a regime: base × the regime multiplier (1 when the regime is unknown). */
export function regimeWeight(family: StrategyFamily, regime: RegimeState | null): number {
  const mult = regime ? REGIME_MULTIPLIER[regime]?.[family] ?? 1 : 1
  return baseWeight(family) * mult
}
