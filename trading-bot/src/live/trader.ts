/**
 * The live trader — the one place that turns a decision into real orders. It
 * does nothing unless EVERY gate in gates.ts is open, and the chain ships closed
 * (LIVE_TRADING_ENABLED is false), so in this tree it never runs. When (if ever)
 * armed by a human through the full gate chain, it: opens with a market BUY,
 * brackets the exit with an OCO SELL, drives the order state machine from the
 * fills, and enforces the hard caps on top of the risk engine.
 *
 * The exchange adapter is injected, so this is exercised end-to-end against a
 * mock exchange (fills, partial fills, OCO leg fill, rejects, disconnects) with
 * no network and no keys.
 */

import { config } from '../../config.ts'
import { liveArmed } from './gates.ts'
import type { GateInput } from './gates.ts'
import { applyEvent, exposureQty, newOrder } from './orders.ts'
import type { LiveOrder } from './orders.ts'
import type { PlacedOrder, TradeExchange } from '../exchange/binanceTrade.ts'

export type LivePlan = { symbol: string; quoteOrderQty: number; takeProfit: number; stop: number; stopLimit: number }

export class LiveTradingRefused extends Error {}

function assertArmed(gate: GateInput): void {
  if (!liveArmed(gate)) throw new LiveTradingRefused('Live trading is not armed — a gate is closed. No order was placed.')
}

/** Enforce the hard caps on top of the risk engine before anything is sent. */
export function withinLiveCaps(plan: LivePlan, todaysLiveTrades: number, openPositions: number): { ok: boolean; reason: string } {
  if (plan.quoteOrderQty > config.live.maxNotionalUsd) return { ok: false, reason: `Notional $${plan.quoteOrderQty} exceeds the live cap $${config.live.maxNotionalUsd}.` }
  if (todaysLiveTrades >= config.live.maxTradesPerDay) return { ok: false, reason: `Already ${todaysLiveTrades} live trades today (cap ${config.live.maxTradesPerDay}).` }
  if (openPositions >= config.live.maxOpenPositions) return { ok: false, reason: `Already ${openPositions} open live position(s) (cap ${config.live.maxOpenPositions}).` }
  return { ok: true, reason: 'Within live caps.' }
}

export type OpenResult = { order: LiveOrder; placed: PlacedOrder }

/**
 * Open a long: market BUY, then bracket with an OCO SELL. Refuses unless armed
 * and within caps. Returns the order after applying the fill events; a rejected
 * or unfilled order leaves zero exposure (no phantom position).
 */
export async function openLive(ex: TradeExchange, plan: LivePlan, gate: GateInput, ctx: { todaysLiveTrades: number; openPositions: number; now?: number }): Promise<OpenResult> {
  assertArmed(gate)
  const caps = withinLiveCaps(plan, ctx.todaysLiveTrades, ctx.openPositions)
  if (!caps.ok) throw new LiveTradingRefused(caps.reason)
  const now = ctx.now ?? Date.now()
  const cid = `mrcash-${now.toString(36)}`
  let order = newOrder({ id: cid, clientOrderId: cid, symbol: plan.symbol, side: 'BUY', requestedQty: plan.quoteOrderQty })
  order = applyEvent(order, { to: 'submitted', at: now, detail: 'market BUY submitted' })

  let placed: PlacedOrder
  try {
    placed = await ex.marketBuy(plan.symbol, plan.quoteOrderQty, cid)
  } catch (err) {
    order = applyEvent(order, { to: 'rejected', at: Date.now(), detail: err instanceof Error ? err.message : 'submit failed' })
    return { order, placed: { orderId: -1, status: 'REJECTED', executedQty: '0' } }
  }

  if (placed.status === 'REJECTED') {
    order = applyEvent(order, { to: 'rejected', at: Date.now(), detail: 'venue rejected' })
    return { order, placed }
  }

  const executed = Number(placed.executedQty || '0')
  const fills = placed.fills ?? []
  const avg = fills.length ? fills.reduce((s, f) => s + Number(f.price) * Number(f.qty), 0) / fills.reduce((s, f) => s + Number(f.qty), 0) : 0
  const to = executed >= Number(placed.cummulativeQuoteQty ?? executed) && placed.status === 'FILLED' ? 'filled' : executed > 0 ? 'partially_filled' : 'open'
  order = applyEvent(order, { to, at: Date.now(), fillQty: executed, fillPrice: avg, detail: `entry ${placed.status}` })

  // Bracket the filled quantity with an OCO exit (best-effort; a failure here is
  // surfaced, never swallowed — an un-bracketed position must be visible).
  if (exposureQty(order) > 0) {
    try {
      await ex.ocoSell(plan.symbol, exposureQty(order), plan.takeProfit, plan.stop, plan.stopLimit, `${cid}-oco`)
    } catch (err) {
      order = { ...order, events: [...order.events, { at: Date.now(), from: order.state, to: order.state, detail: `OCO bracket FAILED: ${err instanceof Error ? err.message : 'unknown'} — position is unprotected` }] }
    }
  }
  return { order, placed }
}

/** The kill switch's live action: cancel every open order on the symbol. Safe to call unarmed (it only cancels). */
export async function killAll(ex: TradeExchange, symbol: string): Promise<void> {
  await ex.cancelAll(symbol)
}
