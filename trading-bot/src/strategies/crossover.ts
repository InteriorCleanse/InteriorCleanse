/**
 * The moving-average crossover, as a strategy — the simple teaching brain,
 * now judged alongside the others. It has no zone of its own, so its stop
 * and target are measured in ATRs like the other feature strategies.
 */

import { config } from '../../config.ts'
import { getCrossoverSignal } from '../strategy.ts'
import { atrPlan } from './plan.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'

export const crossover: Strategy = {
  meta: {
    id: 'crossover',
    name: 'MA crossover',
    family: 'crossover',
    summary: `A buy when the ${config.crossover.fastMA}-candle average crosses above the ${config.crossover.slowMA}-candle average, a sell when it crosses below.`,
    needsTape: false,
  },
  evaluate(ctx: StrategyContext): StrategyVote {
    const sig = getCrossoverSignal(ctx.candles, ctx.index)
    const action = sig.action === 'BUY' || sig.action === 'SELL' ? sig.action : 'HOLD'
    const direction = action === 'BUY' ? 'long' : action === 'SELL' ? 'short' : null
    const setupKey = `${config.symbol}|${config.interval}|crossover|${action}`
    return {
      id: 'crossover', action, direction, confidence: action === 'HOLD' ? 0 : 60,
      reason: sig.reason,
      evidence: [{ step: 'Crossover', passed: action !== 'HOLD', detail: sig.reason }],
      setupKey,
      plan: direction ? atrPlan(direction, ctx.price, ctx.atr) : undefined,
    }
  },
}
