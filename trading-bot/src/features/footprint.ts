/**
 * The footprint of one candle: at each price bucket, how much was
 * bought aggressively and how much was sold aggressively. Where the
 * fight happened inside the candle, which a plain candle cannot show.
 */

import type { TapeBucket } from './trades.ts'
import type { FootprintReading, FootprintRow } from './types.ts'

export function footprint(b: TapeBucket, tick: number, bucketSize: number): FootprintReading {
  const rows = new Map<number, FootprintRow>()
  const key = (idx: number) => Math.floor((idx * tick) / bucketSize)
  const row = (k: number) => { let r = rows.get(k); if (!r) { r = { price: k * bucketSize, buy: 0, sell: 0, delta: 0, total: 0 }; rows.set(k, r) } return r }
  for (const [idx, q] of b.histBuy) { const r = row(key(idx)); r.buy += q }
  for (const [idx, q] of b.histSell) { const r = row(key(idx)); r.sell += q }
  const out = [...rows.values()].map((r) => ({ ...r, delta: r.buy - r.sell, total: r.buy + r.sell })).sort((a, b) => b.price - a.price)
  const poc = out.slice().sort((a, b) => b.total - a.total)[0] ?? null
  return { openTime: b.openTime, bucketSize, rows: out, volume: b.v, buyV: b.buyV, sellV: b.sellV, pocPrice: poc ? poc.price : null, high: b.high, low: b.low }
}
