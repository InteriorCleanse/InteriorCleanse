/**
 * The tape, folded into candle-sized buckets as trades arrive. This is
 * what makes VWAP and the volume profile EXACT when the stream is up:
 * every trade's price and size is counted, not guessed from a candle.
 *
 * It also keeps track of whether it has seen everything. The stream
 * coming up, going down, or reporting a gap resets the point from which
 * the tape is trusted; a reading anchored before that point is not
 * "exact", and the feature engine falls back to candles and says so.
 */

import { config } from '../../config.ts'
import { INTERVAL_MS } from '../market.ts'
import type { MarketBus } from '../data/bus.ts'
import type { Trade } from '../data/types.ts'
import type { VwapSums } from './vwap.ts'

type Bucket = {
  openTime: number
  pv: number
  v: number
  p2v: number
  buyV: number
  sellV: number
  trades: number
  /** Volume per tick of price, keyed by round(price / tick). */
  hist: Map<number, number>
}

export type TapeSums = VwapSums & {
  buyV: number
  sellV: number
  trades: number
  buckets: number
  /** True only when the stream was up before the first bucket opened and never dropped since. */
  exact: boolean
  hist: Map<number, number>
  tick: number
}

/** A price resolution four orders of magnitude below the price: $10 at $100,000, one cent at $100. */
export function priceTick(price: number): number {
  if (!(price > 0)) return 1
  return 10 ** (Math.floor(Math.log10(price)) - 4)
}

export class TradeAccumulator {
  private readonly buckets = new Map<number, Bucket>()
  private exactSince: number | null = null
  private tick: number | null = null
  private lastPrune = 0
  readonly intervalMs: number
  readonly keepMs: number

  constructor(intervalMs = INTERVAL_MS[config.interval] ?? 300_000, keepDays = 2) {
    this.intervalMs = intervalMs
    this.keepMs = keepDays * 86_400_000
  }

  /** Subscribes to the bus. Returns the unsubscribe function. */
  attach(bus: MarketBus): () => void {
    const offs = [
      bus.on('trade', (t) => this.add(t)),
      bus.on('stream:up', () => this.markUp(Date.now())),
      bus.on('stream:down', () => this.markDown()),
      bus.on('stream:gap', (_what, at) => this.markGap(at)),
    ]
    return () => { for (const off of offs) off() }
  }

  /** The stream is delivering: the tape is trusted from now on. */
  markUp(now: number): void { if (this.exactSince === null) this.exactSince = now }
  /** The stream dropped: nothing is trusted until it is back. */
  markDown(): void { this.exactSince = null }
  /** Something was missed while up: trust restarts now. */
  markGap(now: number): void { this.exactSince = now }
  /** From when the tape has been complete, or null while the stream is down. */
  trustedSince(): number | null { return this.exactSince }

  add(t: Trade): void {
    if (this.tick === null) this.tick = priceTick(t.price)
    const openTime = Math.floor(t.time / this.intervalMs) * this.intervalMs
    let b = this.buckets.get(openTime)
    if (!b) { b = { openTime, pv: 0, v: 0, p2v: 0, buyV: 0, sellV: 0, trades: 0, hist: new Map() }; this.buckets.set(openTime, b) }
    b.pv += t.price * t.qty
    b.v += t.qty
    b.p2v += t.price * t.price * t.qty
    if (t.side === 'buy') b.buyV += t.qty; else b.sellV += t.qty
    b.trades++
    const k = Math.round(t.price / this.tick)
    b.hist.set(k, (b.hist.get(k) ?? 0) + t.qty)
    if (t.time - this.lastPrune > 3_600_000) { this.prune(t.time - this.keepMs); this.lastPrune = t.time }
  }

  prune(before: number): void {
    for (const k of this.buckets.keys()) if (k < before) this.buckets.delete(k)
  }

  bucketCount(): number { return this.buckets.size }

  /**
   * The sums over the buckets opening at `fromOpenTime` .. `toOpenTime`
   * (inclusive, stepping one interval). Null when no bucket in the range
   * has any trades.
   */
  sums(fromOpenTime: number, toOpenTime: number): TapeSums | null {
    const out: TapeSums = { pv: 0, v: 0, p2v: 0, buyV: 0, sellV: 0, trades: 0, buckets: 0, exact: false, hist: new Map(), tick: this.tick ?? 1 }
    let complete = true
    for (let t = fromOpenTime; t <= toOpenTime; t += this.intervalMs) {
      const b = this.buckets.get(t)
      if (!b) { complete = false; continue }
      out.pv += b.pv; out.v += b.v; out.p2v += b.p2v; out.buyV += b.buyV; out.sellV += b.sellV; out.trades += b.trades; out.buckets++
      for (const [k, q] of b.hist) out.hist.set(k, (out.hist.get(k) ?? 0) + q)
    }
    if (out.buckets === 0) return null
    out.exact = complete && this.exactSince !== null && this.exactSince <= fromOpenTime
    return out
  }
}

/** The process-wide tape, fed by the market feed while the app runs. Empty in replays and tests. */
export const tradeTape = new TradeAccumulator()
