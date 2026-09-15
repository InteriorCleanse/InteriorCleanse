/**
 * Trend pullback. In a trend, wait for price to pull back to the cheap half
 * of its range (discount in an uptrend, premium in a downtrend) and into a
 * fresh order block that leans the trend's way, then join the trend there.
 * Buying strength in the trend's own direction, at a discount.
 */

import { config } from '../../config.ts'
import { atrPlan, fail, hold, pass } from './plan.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'
import type { EvidenceStep } from '../types.ts'

const ID = 'trend-pullback'

export const trendPullback: Strategy = {
  meta: { id: ID, name: 'Trend pullback', family: 'trend', summary: 'In a trend, join it on a pullback into discount (or premium) that lands on an order block.', needsTape: false },
  evaluate(ctx: StrategyContext): StrategyVote {
    const ev: EvidenceStep[] = []
    const key = (dir: string) => `${config.symbol}|${config.interval}|${ID}|${dir}`
    const f = ctx.features
    const regime = f?.regime.value
    const structure = f?.structure.value
    if (!regime || !structure) { fail(ev, 'Regime', 'No regime or structure read for this candle.'); return hold(ID, key('none'), ev, 'Not enough context yet.') }
    if (regime.state !== 'trending-up' && regime.state !== 'trending-down') { fail(ev, 'Regime', `Regime is ${regime.state}, not a trend.`); return hold(ID, key('none'), ev, 'No trend to pull back into.') }
    const direction = regime.state === 'trending-up' ? 'long' : 'short'
    pass(ev, 'Regime', `Trend is ${regime.state}.`)

    const dr = structure.dealingRange
    const wantZone = direction === 'long' ? 'discount' : 'premium'
    if (!dr || dr.zone !== wantZone) { fail(ev, 'Location', `Price is ${dr ? dr.zone : 'unknown'} in its range, not ${wantZone}.`); return hold(ID, key(direction), ev, `Waiting for a pullback into ${wantZone}.`) }
    pass(ev, 'Location', `Price is in ${wantZone} (${Math.round(dr.position)}% of the range).`)

    const zone = direction === 'long' ? structure.orderBlocks.support : structure.orderBlocks.resistance
    if (!zone || zone.distanceAtr > 0.5) { fail(ev, 'Order block', zone ? `The nearest ${direction === 'long' ? 'support' : 'resistance'} block is ${zone.distanceAtr.toFixed(2)} ATR away.` : 'No order block in the trend\'s direction nearby.'); return hold(ID, key(direction), ev, 'No order block at the pullback to lean on.') }
    pass(ev, 'Order block', `A ${zone.kind} at $${zone.bottom.toFixed(2)}–$${zone.top.toFixed(2)} is right here.`)

    const stopPrice = direction === 'long' ? zone.bottom - ctx.atr * 0.2 : zone.top + ctx.atr * 0.2
    const plan = atrPlan(direction, ctx.price, ctx.atr, { stopPrice })
    let confidence = 60
    if (regime.confidence >= 75) confidence += 10
    if (structure.lastShift?.kind === 'BOS' && ((direction === 'long' && structure.lastShift.direction === 'bullish') || (direction === 'short' && structure.lastShift.direction === 'bearish'))) confidence += 10
    return { id: ID, action: direction === 'long' ? 'BUY' : 'SELL', direction, confidence: Math.min(100, confidence), reason: `${direction === 'long' ? 'BUY' : 'SELL'} — joining the ${regime.state} on a pullback into ${wantZone} at an order block.`, evidence: ev, setupKey: key(direction), plan }
  },
}
