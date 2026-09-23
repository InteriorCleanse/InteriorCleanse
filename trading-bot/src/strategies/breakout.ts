/**
 * Breakout. The regime feature already decides when volatility was
 * compressed and has just expanded on a fresh break of structure; this
 * strategy simply takes that break in its direction, with a stop back
 * inside the range it left.
 */

import { config } from '../../config.ts'
import { atrPlan, fail, hold, pass, RR_PARAMS } from './plan.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'
import type { EvidenceStep } from '../types.ts'

const ID = 'breakout'

export const breakout: Strategy = {
  meta: { id: ID, name: 'Volatility breakout', family: 'breakout', summary: 'A range that compressed and then broke: take the fresh break of structure as volatility expands.', needsTape: false, parameters: RR_PARAMS },
  evaluate(ctx: StrategyContext): StrategyVote {
    const ev: EvidenceStep[] = []
    const key = (dir: string) => `${config.symbol}|${config.interval}|${ID}|${dir}`
    const regime = ctx.features?.regime.value
    if (!regime) { fail(ev, 'Regime', 'No regime read for this candle.'); return hold(ID, key('none'), ev, 'No regime to read.') }
    if (regime.state !== 'breakout' || !regime.direction) { fail(ev, 'Regime', `Regime is ${regime.state}, not a breakout.`); return hold(ID, key('none'), ev, 'No breakout right now.') }
    pass(ev, 'Regime', regime.reasons[0] ?? 'Breakout.')
    const direction = regime.direction === 'up' ? 'long' : 'short'
    const cur = ctx.candles[ctx.index]
    // Stop back inside the broken range: the far side of this candle plus a buffer.
    const stopPrice = direction === 'long' ? cur.low - ctx.atr * 0.2 : cur.high + ctx.atr * 0.2
    const plan = atrPlan(direction, cur.close, ctx.atr, { stopPrice })
    pass(ev, 'Break', `Taking the ${direction} break; stop back inside the range at $${stopPrice.toFixed(2)}.`)
    return { id: ID, action: direction === 'long' ? 'BUY' : 'SELL', direction, confidence: Math.max(50, regime.confidence), reason: `${direction === 'long' ? 'BUY' : 'SELL'} — volatility expanded on a fresh break ${regime.direction}.`, evidence: ev, setupKey: key(direction), plan }
  },
}
