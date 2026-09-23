/**
 * The order-PLACING adapter. This is the only file in the tree with methods
 * that submit, bracket or cancel real orders. It is inert on its own: it is
 * constructed and called ONLY by the live trader (src/live/trader.ts), which
 * refuses to run unless every gate in src/live/gates.ts is open — a chain that
 * ships closed (LIVE_TRADING_ENABLED is false). Nothing here runs by default,
 * and every method is exercised in tests against a mock exchange, never a real
 * venue. `fetchImpl` is injectable for exactly that reason.
 *
 * Spot is long-only: a market BUY opens, an OCO SELL brackets the exit. Binance
 * global and Binance.US differ in the OCO endpoint shape; the flavour switch
 * picks the right one.
 */

import { signedQuery } from './sign.ts'
import type { ExchangeFlavour } from './types.ts'
import type { FetchLike } from './binanceRest.ts'

export type TradeConfig = {
  baseUrl: string
  apiKey: string
  apiSecret: string
  flavour: ExchangeFlavour
  recvWindow?: number
  fetchImpl?: FetchLike
  now?: () => number
  offsetMs?: number
}

export type PlacedOrder = { orderId: number; status: string; executedQty: string; cummulativeQuoteQty?: string; fills?: Array<{ price: string; qty: string; commission: string; commissionAsset: string }> }
export type OcoResult = { orderListId: number; listOrderStatus: string; orders: Array<{ orderId: number }> }

export class TradeExchange {
  private base: string
  private key: string
  private secret: string
  private flavour: ExchangeFlavour
  private recvWindow: number
  private doFetch: FetchLike
  private now: () => number
  private offsetMs: number

  constructor(cfg: TradeConfig) {
    this.base = cfg.baseUrl.replace(/\/$/, '')
    this.key = cfg.apiKey
    this.secret = cfg.apiSecret
    this.flavour = cfg.flavour
    this.recvWindow = cfg.recvWindow ?? 5000
    this.doFetch = cfg.fetchImpl ?? ((globalThis.fetch as unknown) as FetchLike)
    this.now = cfg.now ?? Date.now
    this.offsetMs = cfg.offsetMs ?? 0
  }

  private async post<T>(path: string, params: Record<string, string | number>, method: 'POST' | 'DELETE' = 'POST'): Promise<T> {
    const query = signedQuery(params, this.secret, { timestamp: this.now() + this.offsetMs, recvWindow: this.recvWindow })
    const res = await this.doFetch(`${this.base}${path}?${query}`, { headers: { 'X-MBX-APIKEY': this.key, 'X-HTTP-Method': method } })
    if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${await res.text()}`)
    return (await res.json()) as T
  }

  /** Market BUY by quote amount (spend N quote to open). */
  marketBuy(symbol: string, quoteOrderQty: number, clientOrderId: string): Promise<PlacedOrder> {
    return this.post<PlacedOrder>('/api/v3/order', { symbol, side: 'BUY', type: 'MARKET', quoteOrderQty, newClientOrderId: clientOrderId, newOrderRespType: 'FULL' })
  }

  /** Market SELL a base quantity (flatten). */
  marketSell(symbol: string, quantity: number, clientOrderId: string): Promise<PlacedOrder> {
    return this.post<PlacedOrder>('/api/v3/order', { symbol, side: 'SELL', type: 'MARKET', quantity, newClientOrderId: clientOrderId, newOrderRespType: 'FULL' })
  }

  /**
   * The OCO exit for a long: a take-profit limit above and a stop-limit below.
   * Binance global uses /api/v3/orderList/oco with above/below types; Binance.US
   * uses the older /api/v3/order/oco shape. The flavour switch picks the right one.
   */
  ocoSell(symbol: string, quantity: number, takeProfit: number, stop: number, stopLimit: number, listClientOrderId: string): Promise<OcoResult> {
    if (this.flavour === 'binance-us') {
      return this.post<OcoResult>('/api/v3/order/oco', { symbol, side: 'SELL', quantity, price: takeProfit, stopPrice: stop, stopLimitPrice: stopLimit, stopLimitTimeInForce: 'GTC', listClientOrderId })
    }
    return this.post<OcoResult>('/api/v3/orderList/oco', { symbol, side: 'SELL', quantity, aboveType: 'LIMIT_MAKER', abovePrice: takeProfit, belowType: 'STOP_LOSS_LIMIT', belowPrice: stopLimit, belowStopPrice: stop, belowTimeInForce: 'GTC', listClientOrderId })
  }

  /** Cancel every open order on a symbol — what the kill switch calls. */
  cancelAll(symbol: string): Promise<unknown> {
    return this.post<unknown>('/api/v3/openOrders', { symbol }, 'DELETE')
  }

  /** Look up an order list (OCO) status for reconciliation. */
  orderList(orderListId: number): Promise<OcoResult> {
    return this.post<OcoResult>('/api/v3/orderList', { orderListId }, 'POST')
  }
}
