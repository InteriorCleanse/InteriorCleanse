/**
 * A READ-ONLY Binance REST client. It can look at the venue's rules, the
 * account, open orders and fills — and nothing else. There is deliberately no
 * method that places, cancels or amends an order anywhere in this file (or this
 * phase): the whole point of shadow trading is to prove sizing, filters and
 * timing on the real venue WITHOUT sending. Order placement arrives in Phase 20
 * in a separate module, behind gates.
 *
 * `fetchImpl` is injectable so the client can be tested against a mock signed
 * API with no network.
 */

import { signedQuery } from './sign.ts'
import type { AccountInfo, ExchangeInfo, KeyPermissions, MyTrade, OpenOrder } from './types.ts'

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>

export type ExchangeConfig = {
  baseUrl: string
  apiKey: string
  apiSecret: string
  recvWindow?: number
  fetchImpl?: FetchLike
  now?: () => number
}

export class ReadOnlyExchange {
  private base: string
  private key: string
  private secret: string
  private recvWindow: number
  private doFetch: FetchLike
  private now: () => number
  /** venue time minus local time, from /time; applied to every signed request. */
  private offsetMs = 0

  constructor(cfg: ExchangeConfig) {
    this.base = cfg.baseUrl.replace(/\/$/, '')
    this.key = cfg.apiKey
    this.secret = cfg.apiSecret
    this.recvWindow = cfg.recvWindow ?? 5000
    this.doFetch = cfg.fetchImpl ?? ((globalThis.fetch as unknown) as FetchLike)
    this.now = cfg.now ?? Date.now
  }

  private async getPublic<T>(path: string): Promise<T> {
    const res = await this.doFetch(`${this.base}${path}`)
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${await res.text()}`)
    return (await res.json()) as T
  }

  private async getSigned<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const query = signedQuery(params, this.secret, { timestamp: this.now() + this.offsetMs, recvWindow: this.recvWindow })
    const res = await this.doFetch(`${this.base}${path}?${query}`, { headers: { 'X-MBX-APIKEY': this.key } })
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${await res.text()}`)
    return (await res.json()) as T
  }

  /** Sync the venue clock: offset = serverTime − localTime, so signed timestamps are accepted. */
  async syncTime(): Promise<number> {
    const before = this.now()
    const { serverTime } = await this.getPublic<{ serverTime: number }>('/api/v3/time')
    this.offsetMs = serverTime - before
    return this.offsetMs
  }

  /** For tests/inspection: the current applied offset. */
  timeOffsetMs(): number { return this.offsetMs }

  exchangeInfo(): Promise<ExchangeInfo> { return this.getPublic<ExchangeInfo>('/api/v3/exchangeInfo') }
  account(): Promise<AccountInfo> { return this.getSigned<AccountInfo>('/api/v3/account') }
  openOrders(symbol?: string): Promise<OpenOrder[]> { return this.getSigned<OpenOrder[]>('/api/v3/openOrders', symbol ? { symbol } : {}) }
  myTrades(symbol: string, limit = 500): Promise<MyTrade[]> { return this.getSigned<MyTrade[]>('/api/v3/myTrades', { symbol, limit }) }
}

export type KeyAssessment = { ok: boolean; reason: string; permissions: KeyPermissions }

/**
 * The safety gate on a key: for shadow trading it must NOT be able to withdraw.
 * A key that can move money off the exchange is refused outright — that is the
 * one permission a read-only phase can never accept.
 */
export function assessKeyPermissions(account: Pick<AccountInfo, 'canTrade' | 'canWithdraw' | 'canDeposit'>): KeyAssessment {
  const permissions: KeyPermissions = { canTrade: !!account.canTrade, canWithdraw: !!account.canWithdraw, canDeposit: !!account.canDeposit }
  if (permissions.canWithdraw) {
    return { ok: false, reason: 'This API key can WITHDRAW funds. Refused. Create a key with withdrawals disabled (and, for shadow trading, trading disabled too — read-only).', permissions }
  }
  return { ok: true, reason: permissions.canTrade ? 'Key cannot withdraw (it can trade — for shadow, a read-only key is safer still).' : 'Read-only key: cannot withdraw, cannot trade.', permissions }
}
