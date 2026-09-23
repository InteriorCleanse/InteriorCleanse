/**
 * The shadow scorer asks, after the fact: what would this order have done? It
 * fills the market entry by crossing the real spread, then walks the actual
 * trades that printed after it to see which OCO leg would have been hit first —
 * the take-profit or the stop — and turns that into an R-multiple NET of fees,
 * through the same `tradeMetrics` paper and the backtest use, so a shadow R and
 * a paper R mean the same thing and can be put side by side. It also puts
 * the slippage the fill model ASSUMED next to the spread the book actually
 * showed, which is the number Phase 4's assumptions get to be updated from.
 */

import { config } from '../../config.ts'
import { tradeMetrics } from '../sim/trades.ts'
import { defaultAssumptions } from '../sim/fills.ts'
import type { ShadowOrder, ShadowScore } from '../exchange/types.ts'

export type Print = { price: number; time: number }

/** Score one shadow order against the trades that printed after it. Pure. */
export function scoreShadowOrder(order: ShadowOrder, prints: Print[]): ShadowScore {
  const assumedSlippageBps = config.execution.slippageBps
  const mid = order.bid && order.ask ? (order.bid + order.ask) / 2 : order.intendedPrice
  const observedSpreadBps = order.bid && order.ask && mid > 0 ? ((order.ask - order.bid) / mid) * 10000 : null

  if (!order.placeable) {
    return { id: order.id, entryFilled: false, entryFillPrice: null, exitLeg: null, exitPrice: null, rMultiple: null, assumedSlippageBps, observedSpreadBps, note: `Not placeable, not scored: ${order.note}` }
  }

  const long = order.side === 'BUY'
  // A market entry crosses the spread: a BUY lifts the ask, a SELL hits the bid.
  const entryFillPrice = long ? order.ask ?? order.intendedPrice : order.bid ?? order.intendedPrice
  if (!order.oco) {
    return { id: order.id, entryFilled: true, entryFillPrice, exitLeg: 'open', exitPrice: null, rMultiple: null, assumedSlippageBps, observedSpreadBps, note: 'Entry only, no exit legs to score.' }
  }

  const tp = order.oco.takeProfit
  const stop = order.oco.stop
  const after = prints.filter((p) => p.time > order.at).sort((a, b) => a.time - b.time)
  let exitLeg: ShadowScore['exitLeg'] = 'open'
  let exitPrice: number | null = null
  for (const p of after) {
    const hitTp = long ? p.price >= tp : p.price <= tp
    const hitStop = long ? p.price <= stop : p.price >= stop
    if (hitTp) { exitLeg = 'takeProfit'; exitPrice = tp; break }
    if (hitStop) { exitLeg = 'stop'; exitPrice = stop; break }
  }

  const risk = Math.abs(entryFillPrice - stop)
  // NET of fees, through the same maths paper uses. This used to be the bare
  // price ratio, which made shadow a GROSS number sitting next to paper's NET
  // one under the same name and the same "R" unit. At the configured 0.1% taker
  // / 0.1% maker that is not a rounding difference: it overstates every score,
  // win or lose, by 0.2R on a 1% stop and 0.8R on a 0.25% stop. A 40%-win, 2R
  // strategy reads +0.20R gross and −0.20R net — shadow would have called a
  // losing system profitable at the last checkpoint before real capital.
  // The market entry crosses the spread (taker), the take-profit rests as a
  // limit (maker) and the stop goes to market (taker), which is exactly the
  // split `exitFeePercent` already encodes.
  const rMultiple = exitPrice === null || risk <= 0
    ? null
    : tradeMetrics({
      direction: long ? 'long' : 'short',
      fill: entryFillPrice,
      stop,
      exit: exitPrice,
      exitReason: exitLeg === 'takeProfit' ? 'target' : 'stop',
      quantity: order.quantity,
    }, defaultAssumptions()).rMultiple

  const note = exitLeg === 'open'
    ? 'Would still be open at the end of the window.'
    : `Would have exited at the ${exitLeg} for ${rMultiple?.toFixed(2)}R.`
  return { id: order.id, entryFilled: true, entryFillPrice, exitLeg, exitPrice, rMultiple, assumedSlippageBps, observedSpreadBps, note }
}

export type SlippageComparison = { orders: number; scored: number; avgObservedSpreadBps: number | null; assumedSlippageBps: number; suggestion: string }

/** Roll up the observed spread across scored orders vs the assumed slippage — the Phase 4 feedback. */
export function slippageComparison(scores: ShadowScore[]): SlippageComparison {
  const spreads = scores.map((s) => s.observedSpreadBps).filter((x): x is number => typeof x === 'number')
  const scored = scores.filter((s) => s.entryFilled).length
  const avg = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : null
  const assumed = config.execution.slippageBps
  let suggestion = 'Not enough scored orders yet to update the slippage assumption.'
  if (avg !== null && spreads.length >= config.replay.minSetupsForConfidence) {
    const halfSpread = avg / 2
    suggestion = halfSpread > assumed
      ? `Observed half-spread ~${halfSpread.toFixed(1)} bps is above the assumed ${assumed} bps slippage — consider raising execution.slippageBps.`
      : `Observed half-spread ~${halfSpread.toFixed(1)} bps is within the assumed ${assumed} bps — the assumption looks safe.`
  }
  return { orders: scores.length, scored, avgObservedSpreadBps: avg, assumedSlippageBps: assumed, suggestion }
}
