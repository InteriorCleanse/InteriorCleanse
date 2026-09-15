/**
 * Messages shaped exactly like the exchange's combined public stream, as
 * documented for kline, aggTrade, bookTicker and depthUpdate. These are
 * hand-built from the documented field names, not recorded live — the
 * audit environment cannot reach the stream — so a field name mistake
 * here would also be a mistake in the parser; the shapes were checked
 * against the public documentation.
 */
export const SYM = 'BTCUSDT'
const s = SYM.toLowerCase()

export function klineMsg(openTime: number, o: number, h: number, l: number, c: number, closed: boolean, interval = '5m', v = 1) {
  return { stream: `${s}@kline_${interval}`, data: { e: 'kline', E: openTime + 1000, s: SYM, k: { t: openTime, T: openTime + 299_999, s: SYM, i: interval, f: 1, L: 2, o: String(o), c: String(c), h: String(h), l: String(l), v: String(v), n: 2, x: closed, q: '1', V: '0.5', Q: '0.5', B: '0' } } }
}

export function tradeMsg(id: number, time: number, price: number, qty: number, buyerIsMaker: boolean) {
  return { stream: `${s}@aggTrade`, data: { e: 'aggTrade', E: time, s: SYM, a: id, p: String(price), q: String(qty), f: id, l: id, T: time, m: buyerIsMaker, M: true } }
}

export function tickerMsg(bid: number, bidQty: number, ask: number, askQty: number, u = 1) {
  return { stream: `${s}@bookTicker`, data: { u, s: SYM, b: String(bid), B: String(bidQty), a: String(ask), A: String(askQty) } }
}

export function depthMsg(U: number, u: number, bids: Array<[number, number]>, asks: Array<[number, number]>, E = Date.now()) {
  return { stream: `${s}@depth@100ms`, data: { e: 'depthUpdate', E, s: SYM, U, u, b: bids.map(([p, q]) => [String(p), String(q)]), a: asks.map(([p, q]) => [String(p), String(q)]) } }
}
