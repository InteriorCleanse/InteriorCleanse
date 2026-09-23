/**
 * Read the venue's real trading rules out of exchangeInfo into the `Filters`
 * shape the risk engine already uses (Phase 12). LOT_SIZE gives the step,
 * PRICE_FILTER the tick, and NOTIONAL/MIN_NOTIONAL the smallest order the venue
 * will accept. With these, a shadow order is sized exactly as a real one would be.
 */

import type { Filters } from '../risk/filters.ts'
import type { ExchangeInfo, SymbolInfo } from './types.ts'

function filterField(sym: SymbolInfo, type: string, field: string): number | null {
  const f = sym.filters.find((x) => x.filterType === type)
  if (!f) return null
  const v = f[field]
  return v === undefined ? null : Number(v)
}

/** The live filters for one symbol, or null if the venue does not list it. */
export function filtersForSymbol(info: ExchangeInfo, symbol: string): Filters | null {
  const sym = info.symbols.find((s) => s.symbol === symbol)
  if (!sym) return null
  const stepSize = filterField(sym, 'LOT_SIZE', 'stepSize') ?? 0
  const tickSize = filterField(sym, 'PRICE_FILTER', 'tickSize') ?? 0
  // Binance global uses NOTIONAL.minNotional; Binance.US uses MIN_NOTIONAL.minNotional.
  const minNotionalUsd = filterField(sym, 'NOTIONAL', 'minNotional') ?? filterField(sym, 'MIN_NOTIONAL', 'minNotional') ?? 0
  return { tickSize, stepSize, minNotionalUsd }
}
