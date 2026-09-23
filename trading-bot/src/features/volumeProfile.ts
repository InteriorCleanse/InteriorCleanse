/**
 * Volume profile — how much traded at each price. The bucket with the
 * most is the POINT OF CONTROL (POC): the price the market agreed on.
 * The band around it holding most of the volume (70% by default) is
 * the VALUE AREA, from VAL (low) to VAH (high). Price leaving the value
 * area and failing to come back is the market changing its mind.
 *
 * From the tape it is exact. From candles it is an approximation: a
 * candle's volume is spread evenly across its high–low range, because
 * where inside the candle it actually traded is unknown. Approximate
 * readings say so.
 */

import type { Candle } from '../types.ts'
import type { ProfileReading } from './types.ts'

/** Volume per bucket, keyed by bucket index (price = index × bucketSize). */
export type Profile = Map<number, number>

/** Each candle's volume spread evenly over the buckets its range touches. */
export function profileFromCandles(candles: Candle[], from: number, to: number, bucketSize: number): Profile {
  const out: Profile = new Map()
  if (bucketSize <= 0) return out
  for (let j = Math.max(0, from); j <= to && j < candles.length; j++) {
    const c = candles[j]
    if (c.volume <= 0) continue
    const lo = Math.floor(c.low / bucketSize)
    const hi = Math.floor(c.high / bucketSize)
    const n = hi - lo + 1
    const each = c.volume / n
    for (let b = lo; b <= hi; b++) out.set(b, (out.get(b) ?? 0) + each)
  }
  return out
}

/** Re-buckets a fine histogram (keyed by tick index, price = index × tick) into `bucketSize` buckets. */
export function profileFromHistogram(hist: Map<number, number>, tick: number, bucketSize: number): Profile {
  const out: Profile = new Map()
  if (bucketSize <= 0 || tick <= 0) return out
  for (const [idx, qty] of hist) {
    const b = Math.floor((idx * tick) / bucketSize)
    out.set(b, (out.get(b) ?? 0) + qty)
  }
  return out
}

/**
 * POC and the value area. The area grows out from the POC one bucket at
 * a time, always taking whichever neighbour (above or below) holds more
 * volume, until it holds `percent` of the total.
 */
export function valueArea(profile: Profile, bucketSize: number, percent = 70): ProfileReading | null {
  if (profile.size === 0) return null
  const keys = [...profile.keys()].sort((a, b) => a - b)
  let total = 0
  let pocIdx = keys[0]
  for (const k of keys) {
    const v = profile.get(k)!
    total += v
    if (v > (profile.get(pocIdx) ?? 0)) pocIdx = k
  }
  if (total <= 0) return null
  const target = total * (percent / 100)
  let lo = pocIdx
  let hi = pocIdx
  let held = profile.get(pocIdx)!
  const min = keys[0]
  const max = keys[keys.length - 1]
  while (held < target && (lo > min || hi < max)) {
    const below = lo > min ? profile.get(lo - 1) ?? 0 : -1
    const above = hi < max ? profile.get(hi + 1) ?? 0 : -1
    if (above > below) { hi++; held += above } else { lo--; held += below }
  }
  return {
    poc: (pocIdx + 0.5) * bucketSize,
    vah: (hi + 1) * bucketSize,
    val: lo * bucketSize,
    bucketSize,
    volume: total,
    buckets: profile.size,
  }
}
