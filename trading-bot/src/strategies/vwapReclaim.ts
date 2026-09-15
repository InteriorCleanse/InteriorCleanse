/**
 * VWAP reclaim. In a market that is not clearly trending against it, price
 * dips below the day's volume-weighted average price and then closes back
 * above it — buyers reclaiming the average, and vice versa for a sell.
 * The average is where the day's money changed hands, so reclaiming it is a
 * small statement of control.
 */

import { config } from '../../config.ts'
import { atrPlan, fail, hold, pass } from './plan.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'
import type { EvidenceStep } from '../types.ts'

const ID = 'vwap-reclaim'

export const vwapReclaim: Strategy = {
  meta: { id: ID, name: 'VWAP reclaim', family: 'vwap', summary: 'Price dips through the day VWAP and closes back on the other side, reclaiming the average.', needsTape: false },
  evaluate(ctx: StrategyContext): StrategyVote {
    const ev: EvidenceStep[] = []
    const key = (dir: string) => `${config.symbol}|${config.interval}|${ID}|${dir}`
    const f = ctx.features
    const vwap = f?.vwapDay.value
    if (!f || !vwap) { fail(ev, 'Day VWAP', 'The day VWAP is not available for this candle.'); return hold(ID, key('none'), ev, 'No day VWAP to reclaim yet.') }
    pass(ev, 'Day VWAP', `Day VWAP is $${vwap.vwap.toFixed(2)} (${f.vwapDay.source === 'trades' ? 'from the tape' : 'from candles'}).`)

    const cur = ctx.candles[ctx.index]
    const prev = ctx.candles[ctx.index - 1]
    if (!prev) { fail(ev, 'Reclaim', 'No previous candle.'); return hold(ID, key('none'), ev, 'Not enough history.') }
    const reclaimUp = prev.close < vwap.vwap && cur.close > vwap.vwap && cur.low <= vwap.vwap
    const reclaimDown = prev.close > vwap.vwap && cur.close < vwap.vwap && cur.high >= vwap.vwap
    if (!reclaimUp && !reclaimDown) { fail(ev, 'Reclaim', 'Price did not cross back through the VWAP on this candle.'); return hold(ID, key('none'), ev, 'Waiting for a candle to reclaim the day VWAP.') }
    const direction = reclaimUp ? 'long' : 'short'
    pass(ev, 'Reclaim', `Price dipped ${reclaimUp ? 'below' : 'above'} the VWAP and closed back ${reclaimUp ? 'above' : 'below'} it.`)

    // The regime must not be trending hard the other way.
    const regime = f.regime.value
    const against = regime && ((direction === 'long' && regime.state === 'trending-down') || (direction === 'short' && regime.state === 'trending-up'))
    if (against) { fail(ev, 'Regime', `The regime is ${regime!.state}, against a ${direction}.`); return hold(ID, key(direction), ev, `A ${direction} reclaim, but the trend is against it — standing aside.`) }
    pass(ev, 'Regime', regime ? `Regime is ${regime.state}, not against the reclaim.` : 'No regime read; not blocking.')

    const plan = atrPlan(direction, cur.close, ctx.atr, { stopPrice: reclaimUp ? Math.min(cur.low, vwap.lower) - ctx.atr * 0.1 : Math.max(cur.high, vwap.upper) + ctx.atr * 0.1 })
    let confidence = 55
    if (regime && ((direction === 'long' && regime.direction === 'up') || (direction === 'short' && regime.direction === 'down'))) confidence += 15
    if (f.vwapDay.source === 'trades') confidence += 10
    return { id: ID, action: reclaimUp ? 'BUY' : 'SELL', direction, confidence: Math.min(100, confidence), reason: `${reclaimUp ? 'BUY' : 'SELL'} — price reclaimed the day VWAP at $${vwap.vwap.toFixed(2)}.`, evidence: ev, setupKey: key(direction), plan }
  },
}
