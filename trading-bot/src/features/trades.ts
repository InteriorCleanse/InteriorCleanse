/**
 * The tape, folded into candle-sized buckets as trades arrive. This is
 * what makes VWAP, the volume profile, delta, CVD and the footprint
 * EXACT when the stream is up: every trade's price, size and side is
 * counted, not guessed from a candle.
 *
 * It also keeps track of whether it has seen everything. The stream
 * coming up, going down, or reporting a gap resets the point from which
 * the tape is trusted; a reading anchored before that point is not
 * "exact", and the feature engine says so instead of pretending.
 *
 * One honest limit: the exchange's public trade stream merges the fills
 * of one taker order into one print ("aggTrade"), so a "large trade" is
 * one aggressive order, not necessarily one participant.
 */

import { config } from '../../config.ts'
import { INTERVAL_MS } from '../market.ts'
import type { MarketBus } from '../data/bus.ts'
import type { Book, Trade } from '../data/types.ts'
import type { VwapSums } from './vwap.ts'

export type TapeBucket = {
  openTime: number
  pv: number
  v: number
  p2v: number
  buyV: number
  sellV: number
  buyPv: number
  sellPv: number
  trades: number
  firstAt: number
  lastAt: number
  high: number
  low: number
  /** Volume per tick of price, keyed by round(price / tick): all, buyer-initiated, seller-initiated. */
  hist: Map<number, number>
  histBuy: Map<number, number>
  histSell: Map<number, number>
}

export type TapeSums = VwapSums & {
  buyV: number
  sellV: number
  buyPv: number
  sellPv: number
  trades: number
  buckets: number
  /** True only when the stream was up before the first bucket opened and never dropped since. */
  exact: boolean
  hist: Map<number, number>
  tick: number
}

export type BigPrint = { id: number; time: number; side: 'buy' | 'sell'; price: number; qty: number; usd: number }

/** A price resolution four orders of magnitude below the price: $10 at $100,000, one cent at $100. */
export function priceTick(price: number): number {
  if (!(price > 0)) return 1
  return 10 ** (Math.floor(Math.log10(price)) - 4)
}

export class TradeAccumulator {
  private readonly buckets = new Map<number, TapeBucket>()
  private exactSince: number | null = null
  private tickSize: number | null = null
  private lastPrune = 0
  /** Trade times in arrival order, for tape speed. Bounded. */
  private readonly times: number[] = []
  private readonly big: BigPrint[] = []
  private lastBook: Book | null = null
  readonly intervalMs: number
  readonly keepMs: number
  readonly bigTradeUsd: number

  constructor(intervalMs = INTERVAL_MS[config.interval] ?? 300_000, keepDays = 2, bigTradeUsd = config.orderflow.bigTradeUsd) {
    this.intervalMs = intervalMs
    this.keepMs = keepDays * 86_400_000
    this.bigTradeUsd = bigTradeUsd
  }

  /** Subscribes to the bus. Returns the unsubscribe function. */
  attach(bus: MarketBus): () => void {
    const offs = [
      bus.on('trade', (t) => this.add(t)),
      bus.on('book', (b) => { this.lastBook = b }),
      bus.on('stream:up', () => this.markUp(Date.now())),
      bus.on('stream:down', () => { this.markDown(); this.lastBook = null }),
      bus.on('stream:gap', (_what, at) => this.markGap(at)),
    ]
    return () => { for (const off of offs) off() }
  }

  /** The most recent stitched order book, or null while the stream is down. */
  latestBook(): Book | null { return this.lastBook }

  /** The stream is delivering: the tape is trusted from now on. */
  markUp(now: number): void { if (this.exactSince === null) this.exactSince = now }
  /** The stream dropped: nothing is trusted until it is back. */
  markDown(): void { this.exactSince = null }
  /** Something was missed while up: trust restarts now. */
  markGap(now: number): void { this.exactSince = now }
  /** From when the tape has been complete, or null while the stream is down. */
  trustedSince(): number | null { return this.exactSince }
  /** Whether every trade from `since` on has been seen. */
  trustedFrom(since: number): boolean { return this.exactSince !== null && this.exactSince <= since }
  tick(): number { return this.tickSize ?? 1 }

  add(t: Trade): void {
    if (this.tickSize === null) this.tickSize = priceTick(t.price)
    const openTime = Math.floor(t.time / this.intervalMs) * this.intervalMs
    let b = this.buckets.get(openTime)
    if (!b) {
      b = { openTime, pv: 0, v: 0, p2v: 0, buyV: 0, sellV: 0, buyPv: 0, sellPv: 0, trades: 0, firstAt: t.time, lastAt: t.time, high: t.price, low: t.price, hist: new Map(), histBuy: new Map(), histSell: new Map() }
      this.buckets.set(openTime, b)
    }
    const value = t.price * t.qty
    b.pv += value
    b.v += t.qty
    b.p2v += t.price * value
    if (t.side === 'buy') { b.buyV += t.qty; b.buyPv += value } else { b.sellV += t.qty; b.sellPv += value }
    b.trades++
    if (t.time < b.firstAt) b.firstAt = t.time
    if (t.time > b.lastAt) b.lastAt = t.time
    if (t.price > b.high) b.high = t.price
    if (t.price < b.low) b.low = t.price
    const k = Math.round(t.price / this.tickSize)
    b.hist.set(k, (b.hist.get(k) ?? 0) + t.qty)
    const side = t.side === 'buy' ? b.histBuy : b.histSell
    side.set(k, (side.get(k) ?? 0) + t.qty)
    this.times.push(t.time)
    if (this.times.length > 20_000) this.times.splice(0, this.times.length - 10_000)
    if (value >= this.bigTradeUsd) {
      this.big.push({ id: t.id, time: t.time, side: t.side, price: t.price, qty: t.qty, usd: value })
      if (this.big.length > 1000) this.big.splice(0, this.big.length - 500)
    }
    if (t.time - this.lastPrune > 3_600_000) { this.prune(t.time - this.keepMs); this.lastPrune = t.time }
  }

  prune(before: number): void {
    for (const k of this.buckets.keys()) if (k < before) this.buckets.delete(k)
  }

  bucketCount(): number { return this.buckets.size }

  /** The bucket for a candle open time, if any trades landed in it. */
  bucket(openTime: number): TapeBucket | null { return this.buckets.get(openTime) ?? null }

  /** Whether a whole bucket was seen: the stream was trusted before it opened. */
  bucketExact(openTime: number): boolean { return this.buckets.has(openTime) && this.trustedFrom(openTime) }

  /** How many trades printed in (from, to]. */
  tradesBetween(from: number, to: number): number {
    let n = 0
    for (let i = this.times.length - 1; i >= 0; i--) { const t = this.times[i]; if (t > to) continue; if (t <= from) break; n++ }
    return n
  }

  /** Big prints in (from, to], newest first. */
  bigPrints(from: number, to: number): BigPrint[] {
    return this.big.filter((p) => p.time > from && p.time <= to).sort((a, b) => b.time - a.time)
  }

  /**
   * The sums over the buckets opening at `fromOpenTime` .. `toOpenTime`
   * (inclusive, stepping one interval). Null when no bucket in the range
   * has any trades.
   */
  sums(fromOpenTime: number, toOpenTime: number): TapeSums | null {
    const out: TapeSums = { pv: 0, v: 0, p2v: 0, buyV: 0, sellV: 0, buyPv: 0, sellPv: 0, trades: 0, buckets: 0, exact: false, hist: new Map(), tick: this.tickSize ?? 1 }
    let complete = true
    for (let t = fromOpenTime; t <= toOpenTime; t += this.intervalMs) {
      const b = this.buckets.get(t)
      if (!b) { complete = false; continue }
      out.pv += b.pv; out.v += b.v; out.p2v += b.p2v; out.buyV += b.buyV; out.sellV += b.sellV; out.buyPv += b.buyPv; out.sellPv += b.sellPv; out.trades += b.trades; out.buckets++
      for (const [k, q] of b.hist) out.hist.set(k, (out.hist.get(k) ?? 0) + q)
    }
    if (out.buckets === 0) return null
    out.exact = complete && this.trustedFrom(fromOpenTime)
    return out
  }
}

/** The process-wide tape, fed by the market feed while the app runs. Empty in replays and tests. */
export const tradeTape = new TradeAccumulator()
