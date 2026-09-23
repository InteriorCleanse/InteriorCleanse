/**
 * ICT "Unicorn". The high-probability entry where a breaker block overlaps a
 * fair value gap: two independent reasons for price to react at the same place.
 * A bearish order block that broke flips to support (a long), a bullish one that
 * broke flips to resistance (a short) — and it only counts when a gap of the
 * matching direction sits in the same zone, with price retesting it.
 *
 * Read-only opinion. Structural stop (beyond the breaker), so only RR is tunable.
 */

import { config } from '../../config.ts'
import { atrPlan, fail, hold, pass, RR_PARAMS } from './plan.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'
import type { EvidenceStep, FVG, OrderBlock } from '../types.ts'

const ID = 'unicorn'

function overlaps(a: { top: number; bottom: number }, b: { top: number; bottom: number }): boolean {
  return a.bottom <= b.top && b.bottom <= a.top
}

export const unicorn: Strategy = {
  meta: { id: ID, name: 'Unicorn (breaker + FVG)', family: 'session', summary: 'A breaker block overlapping a fair value gap of the same direction — two reasons to react at one price — taken on the retest.', needsTape: false, parameters: RR_PARAMS },
  evaluate(ctx: StrategyContext): StrategyVote {
    const ev: EvidenceStep[] = []
    const key = (dir: string) => `${config.symbol}|${config.interval}|${ID}|${dir}`
    const a = ctx.analysis
    if (!a) { fail(ev, 'Analysis', 'No session analysis for this candle.'); return hold(ID, key('none'), ev, 'No analysis yet.') }

    // Breakers: an order block that has been broken flips its role.
    const breakers = a.orderBlocks.filter((b) => b.state === 'broken')
    if (!breakers.length) { fail(ev, 'Breaker', 'No breaker block (a broken order block) in play.'); return hold(ID, key('none'), ev, 'No breaker to lean on.') }

    // Pair a breaker with an overlapping fresh/mitigated gap of the flipped direction.
    let found: { breaker: OrderBlock; gap: FVG; direction: 'long' | 'short' } | null = null
    for (const b of breakers) {
      // A broken BEARISH ob flips to support → long, paired with a bullish gap.
      // A broken BULLISH ob flips to resistance → short, paired with a bearish gap.
      const direction: 'long' | 'short' = b.direction === 'bearish' ? 'long' : 'short'
      const want = direction === 'long' ? 'bullish' : 'bearish'
      const gap = a.fvgs.find((g) => g.direction === want && (g.state === 'fresh' || g.state === 'mitigated') && overlaps(g, b))
      if (gap) { found = { breaker: b, gap, direction }; break }
    }
    if (!found) { fail(ev, 'Overlap', 'No breaker overlapping a matching fair value gap.'); return hold(ID, key('none'), ev, 'No unicorn: breaker and gap do not overlap.') }
    pass(ev, 'Unicorn', `A broken ${found.breaker.direction} block overlaps a ${found.gap.direction} gap — looking ${found.direction}.`)

    const zoneTop = Math.min(found.breaker.top, found.gap.top)
    const zoneBottom = Math.max(found.breaker.bottom, found.gap.bottom)
    if (ctx.price < zoneBottom - ctx.atr * 0.15 || ctx.price > zoneTop + ctx.atr * 0.15) {
      fail(ev, 'Retest', `Price $${ctx.price.toFixed(2)} is not at the overlap ($${zoneBottom.toFixed(2)}–$${zoneTop.toFixed(2)}) yet.`)
      return hold(ID, key(found.direction), ev, 'Waiting for the retest of the unicorn zone.')
    }
    pass(ev, 'Retest', `Price is at the overlap zone $${zoneBottom.toFixed(2)}–$${zoneTop.toFixed(2)}.`)

    const stopPrice = found.direction === 'long' ? found.breaker.bottom - ctx.atr * 0.2 : found.breaker.top + ctx.atr * 0.2
    const plan = atrPlan(found.direction, ctx.price, ctx.atr, { stopPrice })
    const confidence = found.breaker.withStructureBreak ? 78 : 68
    return { id: ID, action: found.direction === 'long' ? 'BUY' : 'SELL', direction: found.direction, confidence, reason: `${found.direction === 'long' ? 'BUY' : 'SELL'} — unicorn: a breaker and a fair value gap overlap, taken on the retest.`, evidence: ev, setupKey: key(found.direction), plan }
  },
}
