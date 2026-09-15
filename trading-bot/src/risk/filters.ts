/**
 * Exchange filters: real venues only accept a size that is a whole number
 * of "steps", a price that is a whole number of "ticks", and an order worth
 * at least a minimum notional. Even on paper, sizing that ignores these is a
 * lie about what could actually be filled. With every filter left at 0 (the
 * default) these are no-ops, so today's sizes are unchanged; Phase 20 sets
 * the real venue values before anything goes near a live order.
 */

export type Filters = { tickSize: number; stepSize: number; minNotionalUsd: number }

/** Round a quantity DOWN to a whole number of steps (never round up — you cannot buy more than you sized). */
export function roundToStep(qty: number, step: number): number {
  if (!(step > 0)) return qty
  // Guard against binary-floating-point dust just under a step boundary.
  return Math.floor(qty / step + 1e-9) * step
}

/** Round a price to the nearest tick. */
export function roundToTick(price: number, tick: number): number {
  if (!(tick > 0)) return price
  return Math.round(price / tick) * tick
}

export function meetsMinNotional(qty: number, price: number, minNotionalUsd: number): boolean {
  return minNotionalUsd <= 0 || qty * price >= minNotionalUsd
}

export type FilterResult = { quantity: number; ok: boolean; reason: string }

/** Apply the size filters to a candidate quantity at a price. */
export function applyFilters(qty: number, price: number, f: Filters): FilterResult {
  const quantity = roundToStep(qty, f.stepSize)
  if (!(quantity > 0)) return { quantity, ok: false, reason: `Rounded to the exchange step size (${f.stepSize}) the order is zero — too small to place.` }
  if (!meetsMinNotional(quantity, price, f.minNotionalUsd)) {
    return { quantity, ok: false, reason: `The order would be worth $${(quantity * price).toFixed(2)}, under the exchange minimum of $${f.minNotionalUsd.toFixed(2)}.` }
  }
  return { quantity, ok: true, reason: 'Within the exchange filters.' }
}
