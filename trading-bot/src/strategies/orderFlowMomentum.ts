/**
 * Order-flow momentum. When the live tape shows cumulative delta pushing
 * hard one way, the tape accelerating, and this candle's delta agreeing,
 * ride that push — as long as the regime is not leaning against it. This is
 * the one strategy that CANNOT vote from candles: with the stream down or
 * gapped it holds and says so, never guessing flow from a candle.
 */

import { config } from '../../config.ts'
import { atrPlan, fail, hold, pass } from './plan.ts'
import type { Strategy, StrategyContext, StrategyVote } from './types.ts'
import type { EvidenceStep } from '../types.ts'

const ID = 'orderflow-momentum'

export const orderFlowMomentum: Strategy = {
  meta: { id: ID, name: 'Order-flow momentum', family: 'order-flow', summary: 'Ride a hard push on the tape: cumulative delta, tape speed and this candle\'s delta all agreeing. Live tape only.', needsTape: true },
  evaluate(ctx: StrategyContext): StrategyVote {
    const ev: EvidenceStep[] = []
    const key = (dir: string) => `${config.symbol}|${config.interval}|${ID}|${dir}`
    const flow = ctx.features?.flow
    if (!flow) { fail(ev, 'Tape', 'No order-flow block for this candle.'); return hold(ID, key('none'), ev, 'No tape.') }
    const delta = flow.delta.value
    const cvd = flow.cvd.value ?? flow.cvdSinceGap.value
    if (!flow.stream.trusted || !delta || !cvd) { fail(ev, 'Tape', 'The live tape is not trusted for this candle (stream off or gapped), so flow cannot be read.'); return hold(ID, key('none'), ev, 'The stream is not delivering a trusted tape; order flow holds rather than guess.') }
    pass(ev, 'Tape', 'The live tape covered this candle.')

    const dir = delta.delta > 0 && cvd.value > 0 ? 'long' : delta.delta < 0 && cvd.value < 0 ? 'short' : null
    if (!dir) { fail(ev, 'Agreement', 'This candle\'s delta and cumulative delta do not agree on a direction.'); return hold(ID, key('none'), ev, 'Delta and CVD disagree — no clean push.') }
    pass(ev, 'Agreement', `Delta ${delta.delta > 0 ? '+' : ''}${delta.delta.toFixed(3)} and CVD ${cvd.value > 0 ? '+' : ''}${cvd.value.toFixed(3)} both point ${dir}.`)

    const speed = flow.tapeSpeed.value
    if (!speed || speed.label !== 'accelerating') { fail(ev, 'Speed', `The tape is ${speed ? speed.label : 'unknown'}, not accelerating.`); return hold(ID, key(dir), ev, 'The push is not accelerating — no momentum to ride.') }
    pass(ev, 'Speed', `The tape is accelerating (${speed.tradesPerMinute.toFixed(0)}/min).`)

    const regime = ctx.features?.regime.value
    const against = regime && ((dir === 'long' && regime.state === 'trending-down') || (dir === 'short' && regime.state === 'trending-up'))
    if (against) { fail(ev, 'Regime', `The regime is ${regime!.state}, against the push.`); return hold(ID, key(dir), ev, 'The trend is against the push — standing aside.') }
    pass(ev, 'Regime', regime ? `Regime is ${regime.state}, not against the push.` : 'No regime read; not blocking.')

    const plan = atrPlan(dir, ctx.price, ctx.atr)
    return { id: ID, action: dir === 'long' ? 'BUY' : 'SELL', direction: dir, confidence: 60, reason: `${dir === 'long' ? 'BUY' : 'SELL'} — the tape is pushing ${dir} with agreeing delta and CVD, and accelerating.`, evidence: ev, setupKey: key(dir), plan }
  },
}
