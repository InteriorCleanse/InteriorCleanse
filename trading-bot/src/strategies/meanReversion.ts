/**
 * Mean reversion. In a range (no trend to fight), when price stretches past
 * the day VWAP's deviation band, fade it back toward the average. The target
 * is the VWAP itself; the stop sits just beyond the band. Only in a range —
 * fading a trend is how accounts die, so the regime gate is not optional.
 */

import { config } from '../../config.ts'
import { atrPlan, fail, hold, pass } from './plan.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'
import type { EvidenceStep } from '../types.ts'

const ID = 'mean-reversion'

export const meanReversion: Strategy = {
  meta: { id: ID, name: 'Range mean-reversion', family: 'mean-reversion', summary: 'In a range, fade a stretch past the VWAP band back to the average.', needsTape: false },
  evaluate(ctx: StrategyContext): StrategyVote {
    const ev: EvidenceStep[] = []
    const key = (dir: string) => `${config.symbol}|${config.interval}|${ID}|${dir}`
    const f = ctx.features
    const regime = f?.regime.value
    const vwap = f?.vwapDay.value
    if (!f || !vwap) { fail(ev, 'Day VWAP', 'No day VWAP for this candle.'); return hold(ID, key('none'), ev, 'No VWAP to measure the stretch from.') }
    if (!regime || regime.state !== 'ranging') { fail(ev, 'Regime', `Regime is ${regime ? regime.state : 'unknown'}, not a range — mean-reversion only fades ranges.`); return hold(ID, key('none'), ev, 'Only fading ranges; this is not one.') }
    pass(ev, 'Regime', 'Regime is ranging.')

    const cur = ctx.candles[ctx.index]
    const stretchedUp = cur.close > vwap.upper
    const stretchedDown = cur.close < vwap.lower
    if (!stretchedUp && !stretchedDown) { fail(ev, 'Stretch', 'Price is inside the VWAP band, not stretched.'); return hold(ID, key('none'), ev, 'Waiting for a stretch past the band.') }
    const direction = stretchedUp ? 'short' : 'long' // fade the stretch
    pass(ev, 'Stretch', `Price closed ${stretchedUp ? 'above the upper' : 'below the lower'} band ($${(stretchedUp ? vwap.upper : vwap.lower).toFixed(2)}).`)

    const stopPrice = stretchedUp ? cur.high + ctx.atr * 0.3 : cur.low - ctx.atr * 0.3
    const plan = atrPlan(direction, cur.close, ctx.atr, { stopPrice, targetPrice: vwap.vwap })
    return { id: ID, action: direction === 'long' ? 'BUY' : 'SELL', direction, confidence: 55, reason: `${direction === 'long' ? 'BUY' : 'SELL'} — fading a stretch past the VWAP band back to the average at $${vwap.vwap.toFixed(2)}.`, evidence: ev, setupKey: key(direction), plan }
  },
}
