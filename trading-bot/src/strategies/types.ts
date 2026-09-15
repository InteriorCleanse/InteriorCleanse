/**
 * One interface, many strategies.
 *
 * A strategy reads the shared feature snapshot (and, for the session model,
 * the full ICT analysis) and returns ONE vote: buy, sell or hold, with a
 * confidence, the evidence behind it, and — when it wants a trade — a plan.
 * Nothing here combines the votes (that is fusion, Phase 11) and nothing
 * here places a trade (only the ICT session model does, through the old
 * path, until the risk engine takes over in Phase 12). Each strategy is
 * judged entirely on its own.
 *
 * The evidence contract is the same one the session model has always used:
 * an ordered list of steps, each passed or not, so "why?" and "why not?"
 * both have an answer.
 */

import type { Candle, EvidenceStep, IctAnalysis, TradePlan } from '../types.ts'
import type { FeatureSnapshot } from '../features/types.ts'

export type StrategyFamily = 'session' | 'vwap' | 'breakout' | 'trend' | 'mean-reversion' | 'order-flow' | 'crossover'

/** Everything a strategy is allowed to look at for one candle. */
export type StrategyContext = {
  candles: Candle[]
  index: number
  price: number
  atr: number
  /** The full ICT analysis for this candle, when the session engine ran (always in the app and replay). */
  analysis: IctAnalysis | null
  /** The shared feature snapshot for this candle. */
  features: FeatureSnapshot | null
}

export type StrategyVote = {
  id: string
  action: 'BUY' | 'SELL' | 'HOLD'
  direction: 'long' | 'short' | null
  /** 0–100. How strongly this strategy likes what it sees. */
  confidence: number
  reason: string
  evidence: EvidenceStep[]
  /** The memory key for this vote, including the strategy id. */
  setupKey: string
  /** Present only on a BUY/SELL: where to get in, out, and the target. */
  plan?: TradePlan
}

export type StrategyMeta = {
  id: string
  name: string
  family: StrategyFamily
  /** One plain-English sentence: what this strategy looks for. */
  summary: string
  /** True when the strategy can only vote with the live trade tape (order-flow strategies). */
  needsTape: boolean
}

export interface Strategy {
  readonly meta: StrategyMeta
  evaluate(ctx: StrategyContext): StrategyVote
}
