/**
 * The shadow recorder builds the exact order the system WOULD send — symbol,
 * side, quantity rounded to the venue's filters, the intended price, and the
 * OCO exit legs — against the live book, and logs it. It never sends anything;
 * there is no code path from here to the exchange. Spot is long-only, so a short
 * signal is built and logged but marked un-placeable, and the note says why.
 */

import { config } from '../../config.ts'
import { store } from '../store.ts'
import { applyFilters, roundToTick } from '../risk/filters.ts'
import type { Filters } from '../risk/filters.ts'
import type { ShadowOrder } from '../exchange/types.ts'
import type { Signal } from '../types.ts'

export type BuildInput = {
  signal: Signal
  quantity: number
  filters: Filters
  bid?: number | null
  ask?: number | null
  strategyId: string
  now?: number
}

/** Build (do not send) the order for a signal. Pure. */
export function buildShadowOrder(input: BuildInput): ShadowOrder {
  const plan = input.signal.plan
  const at = input.now ?? Date.now()
  const id = `s${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const long = plan?.direction === 'long'
  const side: 'BUY' | 'SELL' = long ? 'BUY' : 'SELL'
  const price = plan?.entry ?? input.signal.price
  const f = input.filters
  const sized = applyFilters(input.quantity, price, f)
  const bid = input.bid ?? null
  const ask = input.ask ?? null

  // Spot is long-only: a short is logged for the record but cannot be placed.
  const shortOnSpot = !long
  const oco = plan
    ? { takeProfit: roundToTick(plan.takeProfit, f.tickSize), stop: roundToTick(plan.stop, f.tickSize), stopLimit: roundToTick(plan.stop, f.tickSize) }
    : null
  const placeable = sized.ok && !shortOnSpot
  const note = shortOnSpot
    ? 'Short signal — logged only. Spot is long-only, so this order would not be placed on a spot venue.'
    : sized.ok
      ? 'Would be placed: a market entry with an OCO exit (take-profit and stop).'
      : sized.reason

  return { id, at, symbol: config.symbol, strategyId: input.strategyId, side, intendedPrice: price, quantity: sized.quantity, oco, bid, ask, placeable, note }
}

const KEY = 'shadow:orders'

/** Persist a shadow order (append). Kept as a bounded JSON list. */
export function recordShadowOrder(order: ShadowOrder): void {
  try {
    const list = store().getJson<ShadowOrder[]>(KEY) ?? []
    store().setJson(KEY, [...list, order].slice(-2000))
  } catch { /* best-effort: the order is still returned to the caller */ }
}

export function listShadowOrders(): ShadowOrder[] {
  try { return store().getJson<ShadowOrder[]>(KEY) ?? [] } catch { return [] }
}
