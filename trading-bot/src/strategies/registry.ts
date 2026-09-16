/**
 * The playbook: every strategy Mr. Cash knows, and how to run them all over
 * one candle. The session model is first because it is the one that trades;
 * the rest are read-only opinions for now.
 */

import { config } from '../../config.ts'
import { getSettings } from '../settings.ts'
import type { Candle, IctAnalysis } from '../types.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'
import { sessionIfvg } from './sessionIfvg.ts'
import { vwapReclaim } from './vwapReclaim.ts'
import { breakout } from './breakout.ts'
import { trendPullback } from './trendPullback.ts'
import { meanReversion } from './meanReversion.ts'
import { orderFlowMomentum } from './orderFlowMomentum.ts'
import { crossover } from './crossover.ts'
import { silverBullet } from './silverBullet.ts'
import { unicorn } from './unicorn.ts'
import { turtleSoup } from './turtleSoup.ts'

/** In display order. The three ICT stories sit with the session model they share a lineage with. */
export const STRATEGIES: Strategy[] = [sessionIfvg, silverBullet, unicorn, turtleSoup, vwapReclaim, breakout, trendPullback, meanReversion, orderFlowMomentum, crossover]

const BY_ID = new Map(STRATEGIES.map((s) => [s.meta.id, s]))

export function getStrategy(id: string): Strategy | undefined { return BY_ID.get(id) }
export function strategyIds(): string[] { return STRATEGIES.map((s) => s.meta.id) }

/** Every strategy's meta, keyed by id — for fusion's weighting. */
export function metaById(): Map<string, Strategy['meta']> { return new Map(STRATEGIES.map((s) => [s.meta.id, s.meta])) }

/** Which strategies are on. config.strategies.enabled = [] means all of them; a runtime setting can narrow it. */
export function enabledStrategyIds(): string[] {
  const fromConfig = config.strategies.enabled.length ? config.strategies.enabled : strategyIds()
  const setting = getSettings().enabledStrategies
  const runtime = setting ? setting.split(',').map((s) => s.trim()).filter(Boolean) : null
  const chosen = runtime ?? fromConfig
  return strategyIds().filter((id) => chosen.includes(id))
}

export function enabledStrategies(): Strategy[] {
  const on = new Set(enabledStrategyIds())
  return STRATEGIES.filter((s) => on.has(s.meta.id))
}

/** Build the per-candle context every strategy reads. `candles` is the full array the analysis was produced from. */
export function contextFor(analysis: IctAnalysis, candles: Candle[]): StrategyContext {
  return { candles, index: analysis.index, price: analysis.price, atr: analysis.atr, analysis, features: analysis.features }
}

/** Every enabled strategy's vote for one candle. */
export function voteAll(ctx: StrategyContext): StrategyVote[] {
  return enabledStrategies().map((s) => s.evaluate(ctx))
}
