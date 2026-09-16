/**
 * Reconciliation: after a restart (or any doubt), the truth is the exchange, not
 * our local memory. From the venue's own `myTrades` we rebuild the net position
 * — quantity and average price — so a crash mid-trade never leaves us guessing.
 * Pure over the trades list.
 */

import type { MyTrade } from '../exchange/types.ts'

export type ReconciledPosition = {
  symbol: string
  netQty: number
  avgPrice: number
  realizedQuoteFlow: number
  commissionPaid: number
  trades: number
}

/**
 * Net a symbol's fills into a position. Buys add, sells reduce; the average
 * price is the volume-weighted cost of the remaining long. A flat result
 * (netQty ~ 0) means no open position, whatever our local state thought.
 */
export function reconcilePosition(symbol: string, myTrades: MyTrade[]): ReconciledPosition {
  const rows = myTrades.filter((t) => t.symbol === symbol).sort((a, b) => a.time - b.time)
  let netQty = 0
  let costBasis = 0 // total quote spent on the currently-held long
  let realizedQuoteFlow = 0
  let commissionPaid = 0
  for (const t of rows) {
    const qty = Number(t.qty)
    const price = Number(t.price)
    commissionPaid += Number(t.commission)
    if (t.isBuyer) {
      costBasis += qty * price
      netQty += qty
      realizedQuoteFlow -= qty * price
    } else {
      // Selling reduces the long at its average cost.
      const avg = netQty > 0 ? costBasis / netQty : 0
      const sold = Math.min(qty, netQty)
      costBasis -= sold * avg
      netQty -= qty
      realizedQuoteFlow += qty * price
    }
  }
  const clean = Math.abs(netQty) < 1e-12 ? 0 : netQty
  return {
    symbol,
    netQty: clean,
    avgPrice: clean > 0 ? costBasis / clean : 0,
    realizedQuoteFlow,
    commissionPaid,
    trades: rows.length,
  }
}
