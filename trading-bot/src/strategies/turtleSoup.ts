/**
 * ICT "Turtle Soup" — the false breakout fade. Price runs the stops above a
 * prior high (or below a prior low), fails to hold, and closes back inside the
 * range. The raid was liquidity, not a real breakout, so the trade is to fade
 * it: short a failed high raid, long a failed low raid, with the stop just
 * beyond the wick that did the raiding.
 *
 * Read-only opinion. Structural stop (beyond the sweep wick), so only RR tunes.
 */

import { config } from '../../config.ts'
import { atrPlan, fail, hold, pass, RR_PARAMS } from './plan.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'
import type { EvidenceStep } from '../types.ts'

const ID = 'turtle-soup'

export const turtleSoup: Strategy = {
  meta: { id: ID, name: 'Turtle soup (failed sweep)', family: 'session', summary: 'A liquidity raid of a prior high or low that fails and closes back inside — fade it back into the range.', needsTape: false, parameters: RR_PARAMS },
  evaluate(ctx: StrategyContext): StrategyVote {
    const ev: EvidenceStep[] = []
    const key = (dir: string) => `${config.symbol}|${config.interval}|${ID}|${dir}`
    const a = ctx.analysis
    if (!a) { fail(ev, 'Analysis', 'No session analysis for this candle.'); return hold(ID, key('none'), ev, 'No analysis yet.') }

    // The most recent swing raid today (prior swing highs/lows), if any.
    const sweeps = [...(a.swingSweepsToday ?? []), ...(a.sweepsToday ?? [])].sort((x, y) => y.index - x.index)
    const recent = sweeps.find((s) => ctx.index - s.index <= 10)
    if (!recent) { fail(ev, 'Raid', 'No recent liquidity raid of a prior high or low.'); return hold(ID, key('none'), ev, 'Nothing has been swept to fade.') }

    // Fade the raid: a high raided → short; a low raided → long.
    const direction: 'long' | 'short' = recent.side === 'above' ? 'short' : 'long'
    const level = recent.level.price

    // The raid must have FAILED: price closed back inside past the level.
    const reclaimed = recent.side === 'above' ? ctx.price < level : ctx.price > level
    if (!reclaimed) { fail(ev, 'Failure', `The raid of $${level.toFixed(2)} has not failed yet — price has not closed back inside.`); return hold(ID, key(direction), ev, 'Waiting for the raid to fail (a close back inside).') }
    pass(ev, 'Raid', `${recent.side === 'above' ? 'A high' : 'A low'} at $${level.toFixed(2)} was raided (${recent.depthAtr.toFixed(1)} ATR wick) and price closed back inside.`)

    const stopPrice = recent.side === 'above' ? recent.wick + ctx.atr * 0.1 : recent.wick - ctx.atr * 0.1
    const plan = atrPlan(direction, ctx.price, ctx.atr, { stopPrice })
    const confidence = Math.min(80, 60 + Math.round(recent.depthAtr * 10))
    return { id: ID, action: direction === 'long' ? 'BUY' : 'SELL', direction, confidence, reason: `${direction === 'long' ? 'BUY' : 'SELL'} — turtle soup: a failed raid of $${level.toFixed(2)}, faded back into the range.`, evidence: ev, setupKey: key(direction), plan }
  },
}
