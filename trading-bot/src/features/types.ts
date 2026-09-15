/**
 * Features are the readings every strategy shares: the numbers, computed
 * once per closed candle, with a note on where each came from and how
 * much to trust it. A feature is an INPUT. There are no trade rules in
 * this folder, and there never will be — rules live in strategies.
 *
 * Every feature says three things about itself:
 *   available   — could it be computed at all right now?
 *   source      — what it was computed from ('trades' is the live tape,
 *                 'candles' is candle open/high/low/close/volume)
 *   approximate — true when it was built from candles where the tape
 *                 would have been exact (a candle's volume has no price
 *                 detail inside it, so anything volume-weighted is a
 *                 best effort)
 * A strategy that ignores those flags is lying to itself.
 */

import type { SessionName } from '../types.ts'
import type { StructureReading } from './structure.ts'
import type { LiquidityReading } from './liquidity.ts'

/** Bump this when the meaning of any feature changes, so stored readings are not compared across versions. */
export const FEATURE_VERSION = 1

export type FeatureSource = 'trades' | 'candles' | 'none'

export type Feature<T> = {
  value: T | null
  available: boolean
  source: FeatureSource
  /** The market time the reading describes (the candle's close), not when it was computed. */
  asOf: number
  approximate: boolean
  /** Why it is unavailable or approximate, in plain words. */
  note?: string
}

/** Volume-weighted average price from an anchor point, with one-deviation bands. */
export type VwapReading = {
  vwap: number
  upper: number
  lower: number
  sd: number
  anchoredAt: number
  candles: number
  volume: number
}

/** Where the volume sat: the price with the most (POC) and the band holding most of it (VAL–VAH). */
export type ProfileReading = {
  poc: number
  vah: number
  val: number
  bucketSize: number
  volume: number
  buckets: number
}

export type HourlyAverages = {
  ema20: number
  ema50: number
  /** The 20-hour average six bars earlier, so "rising" can be judged. */
  ema20Prev: number
  hours: number
}

export type VolatilityReading = {
  /** This candle's ATR over the last day's typical ATR. */
  ratio: number
  typicalAtr: number
  label: 'quiet' | 'normal' | 'wild'
}

export type MomentumReading = {
  /** Close-to-close move over `hours`, in ATRs. Positive = up. */
  moveAtr: number
  hours: number
}

/** Everything computed for one closed candle. */
export type FeatureSnapshot = {
  version: typeof FEATURE_VERSION
  index: number
  openTime: number
  closeTime: number
  price: number
  asOf: number
  dayKey: string
  session: SessionName | null
  atr: Feature<number>
  hourly: Feature<HourlyAverages>
  momentum: Feature<MomentumReading>
  volatility: Feature<VolatilityReading>
  /** The best VWAP available: the tape when it covered the whole anchor, candles otherwise. */
  vwapDay: Feature<VwapReading>
  vwapSession: Feature<VwapReading>
  /** The tape-only VWAP for the day. Unavailable whenever the stream missed anything since the anchor. */
  vwapDayTape: Feature<VwapReading>
  profileDay: Feature<ProfileReading>
  /** Swings, BOS/CHoCH, order blocks and the dealing range, as the trackers see them. */
  structure: Feature<StructureReading>
  /** The nearest intact liquidity above and below, and today's raids. */
  liquidity: Feature<LiquidityReading>
  /** Whether the live tape covered this whole trading day without a gap. */
  tape: { exact: boolean; note: string }
}

/** One point of the VWAP lines for the chart. */
export type FeaturePoint = {
  openTime: number
  vwapDay: number | null
  vwapDayUpper: number | null
  vwapDayLower: number | null
  vwapSession: number | null
  /** Where each line is anchored, so a chart lifts the pen when the anchor moves instead of joining two days. */
  dayAnchor: number | null
  sessionAnchor: number | null
}
