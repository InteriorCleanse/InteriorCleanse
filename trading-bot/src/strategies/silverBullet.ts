/**
 * ICT "Silver Bullet". Three one-hour windows in New York time — 03:00–04:00
 * (London), 10:00–11:00 (NY AM) and 14:00–15:00 (NY PM) — are when the classic
 * setup tends to appear: price leaves a fair value gap in the direction of the
 * structure, then retraces into it. This strategy only looks during those
 * windows, and only takes a fresh gap in the structure's direction that price
 * is retesting right now.
 *
 * Read-only opinion, like every non-session strategy. Its stop is structural
 * (the far edge of the gap), so only the target multiple (RR) is tunable.
 */

import { config } from '../../config.ts'
import { atrPlan, fail, hold, pass, RR_PARAMS } from './plan.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'
import type { EvidenceStep } from '../types.ts'

const ID = 'silver-bullet'
/** The silver-bullet hours in New York time. */
export const SILVER_BULLET_HOURS = [3, 10, 14]

export const silverBullet: Strategy = {
  meta: { id: ID, name: 'Silver bullet', family: 'session', summary: 'In a silver-bullet hour (3am, 10am or 2pm ET), take a fresh fair value gap in the direction of the structure as price retests it.', needsTape: false, parameters: RR_PARAMS },
  evaluate(ctx: StrategyContext): StrategyVote {
    const ev: EvidenceStep[] = []
    const key = (dir: string) => `${config.symbol}|${config.interval}|${ID}|${dir}`
    const a = ctx.analysis
    if (!a) { fail(ev, 'Analysis', 'No session analysis for this candle.'); return hold(ID, key('none'), ev, 'No analysis yet.') }

    const hour = Number(a.etClock.split(':')[0])
    if (!SILVER_BULLET_HOURS.includes(hour)) { fail(ev, 'Window', `It is ${a.etClock} ET — not a silver-bullet hour (03, 10 or 14).`); return hold(ID, key('none'), ev, 'Outside the silver-bullet windows.') }
    pass(ev, 'Window', `Inside the ${a.etClock} ET silver-bullet window.`)

    if (!a.structureTrend) { fail(ev, 'Direction', 'No structural trend to take a gap with.'); return hold(ID, key('none'), ev, 'No structure to trade with.') }
    const direction = a.structureTrend === 'bullish' ? 'long' : 'short'
    pass(ev, 'Direction', `Structure is ${a.structureTrend} — looking ${direction}.`)

    // A fresh gap in the trend's direction that price is retesting now.
    const want = direction === 'long' ? 'bullish' : 'bearish'
    const gap = a.fvgs
      .filter((g) => g.direction === want && g.state === 'fresh' && ctx.index - g.createdIndex <= 60 && g.fromDisplacement)
      .filter((g) => ctx.price >= g.bottom - ctx.atr * 0.1 && ctx.price <= g.top + ctx.atr * 0.1)
      .sort((x, y) => y.createdIndex - x.createdIndex)[0]
    if (!gap) { fail(ev, 'Gap', `No fresh ${want} displacement gap that price is retesting.`); return hold(ID, key(direction), ev, 'Waiting for a gap to retest in the window.') }
    pass(ev, 'Gap', `Retesting a fresh ${want} gap at $${gap.bottom.toFixed(2)}–$${gap.top.toFixed(2)} (${gap.sizeAtr.toFixed(1)} ATR).`)

    const stopPrice = direction === 'long' ? gap.bottom - ctx.atr * 0.2 : gap.top + ctx.atr * 0.2
    const plan = atrPlan(direction, ctx.price, ctx.atr, { stopPrice })
    const confidence = Math.min(85, 60 + Math.round(gap.sizeAtr * 10))
    return { id: ID, action: direction === 'long' ? 'BUY' : 'SELL', direction, confidence, reason: `${direction === 'long' ? 'BUY' : 'SELL'} — silver-bullet gap retest in the ${a.etClock} window, with the ${a.structureTrend} structure.`, evidence: ev, setupKey: key(direction), plan }
  },
}
