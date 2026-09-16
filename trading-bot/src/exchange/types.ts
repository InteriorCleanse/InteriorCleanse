/**
 * Types for the exchange adapter. Phase 19 is READ-ONLY: these describe what we
 * can look at (the venue's rules, our account, our open orders and our fills),
 * and the shape of an order we would *build* to show what we would have sent —
 * never a type for sending one. There is no order-placing method in this phase.
 */

export type ExchangeFlavour = 'binance' | 'binance-us'

/** One symbol's trading rules, as the venue reports them in exchangeInfo. */
export type SymbolInfo = {
  symbol: string
  baseAsset: string
  quoteAsset: string
  status: string
  filters: Array<Record<string, string>>
}

export type ExchangeInfo = { serverTime: number; symbols: SymbolInfo[] }

/** The permissions a key carries — the doctor refuses anything that can withdraw. */
export type KeyPermissions = {
  canTrade: boolean
  canWithdraw: boolean
  canDeposit: boolean
}

export type AccountInfo = KeyPermissions & {
  accountType?: string
  balances: Array<{ asset: string; free: string; locked: string }>
  permissions?: string[]
}

export type OpenOrder = { symbol: string; orderId: number; side: 'BUY' | 'SELL'; type: string; price: string; origQty: string; status: string }

export type MyTrade = { symbol: string; id: number; price: string; qty: string; quoteQty: string; commission: string; commissionAsset: string; time: number; isBuyer: boolean; isMaker: boolean }

/**
 * The exact order the system WOULD send, built against the live book and rounded
 * to the venue's filters. It is logged and scored, never transmitted. A spot
 * entry plus its OCO exit legs (take-profit and stop).
 */
export type ShadowOrder = {
  id: string
  at: number
  symbol: string
  strategyId: string
  side: 'BUY' | 'SELL'
  /** Market entry by quote amount is how we'd actually buy; the intended price is recorded for scoring. */
  intendedPrice: number
  quantity: number
  /** The OCO exit: a take-profit limit and a stop, on the opposite side. */
  oco: { takeProfit: number; stop: number; stopLimit: number } | null
  /** The book at build time, for honesty about the spread we'd have crossed. */
  bid: number | null
  ask: number | null
  /** True when it passed the venue filters and could actually have been placed. */
  placeable: boolean
  note: string
}

export type ShadowScore = {
  id: string
  /** Would the market entry have filled, and at roughly what price (bid/ask crossed)? */
  entryFilled: boolean
  entryFillPrice: number | null
  /** Which OCO leg would have been hit first by the actual trades, if any. */
  exitLeg: 'takeProfit' | 'stop' | 'open' | null
  exitPrice: number | null
  rMultiple: number | null
  /** Assumed slippage (bps) vs what the observed book implied — the number Phase 4 gets to update. */
  assumedSlippageBps: number
  observedSpreadBps: number | null
  note: string
}
