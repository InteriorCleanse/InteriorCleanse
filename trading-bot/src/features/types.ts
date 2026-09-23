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
import type { RegimeReading } from './regime.ts'

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

// ---- order flow, from the streams only --------------------------------

export type DeltaReading = {
  buyV: number
  sellV: number
  /** Buyer-initiated minus seller-initiated volume, in units of the asset. */
  delta: number
  buyUsd: number
  sellUsd: number
  deltaUsd: number
  buyShare: number
  trades: number
  volume: number
}

export type CvdReading = {
  /** Cumulative delta since the anchor, in units of the asset. */
  value: number
  valueUsd: number
  anchoredAt: number
  candles: number
  /** True only when every trade since the anchor was seen. */
  complete: boolean
  /** Set when the sum had to restart after a gap: the moment the tape became trusted again. */
  restartedAt: number | null
}

export type TapeSpeedReading = {
  tradesPerMinute: number
  previousPerMinute: number
  /** Now over the previous window; null when the previous window had no prints. */
  acceleration: number | null
  windowSec: number
  label: 'accelerating' | 'steady' | 'slowing'
}

export type BigPrintSummary = { id: number; time: number; side: 'buy' | 'sell'; price: number; qty: number; usd: number }

export type LargeTradesReading = {
  windowMin: number
  thresholdUsd: number
  count: number
  buys: number
  sells: number
  buyUsd: number
  sellUsd: number
  netUsd: number
  largest: BigPrintSummary | null
  recent: BigPrintSummary[]
}

export type BookImbalanceReading = {
  mid: number
  bestBid: number
  bestAsk: number
  spreadPct: number
  bidUsd: number
  askUsd: number
  /** 0.5 = balanced, above = more resting bids than asks within the band. */
  imbalance: number
  bandPct: number
  bookTime: number
  lean: 'bids deeper' | 'asks deeper' | 'balanced'
}

export type FootprintRow = { price: number; buy: number; sell: number; delta: number; total: number }

export type FootprintReading = {
  openTime: number
  bucketSize: number
  /** Highest price first. */
  rows: FootprintRow[]
  volume: number
  buyV: number
  sellV: number
  pocPrice: number | null
  high: number
  low: number
}

export type AbsorptionReading = {
  detected: boolean
  side: 'buyers absorbed' | 'sellers absorbed' | null
  hint: 'bullish' | 'bearish' | null
  volumeMultiple: number
  rangeAtr: number
  deltaShare: number
  rule: { volumeMultiple: number; maxRangeAtr: number; minDeltaShare: number; minHistory: number }
  note: string
}

/** The order-flow block. Every reading is from the streams; none is ever built from candles. */
export type FlowFeatures = {
  /** This candle's delta. */
  delta: Feature<DeltaReading>
  /** CVD from the configured anchor (day or session). Unavailable if any trade since the anchor was missed. */
  cvd: Feature<CvdReading>
  /** CVD restarted from the moment the tape became trusted, with the restart marked. */
  cvdSinceGap: Feature<CvdReading>
  tapeSpeed: Feature<TapeSpeedReading>
  largeTrades: Feature<LargeTradesReading>
  bookImbalance: Feature<BookImbalanceReading>
  footprint: Feature<FootprintReading>
  absorption: Feature<AbsorptionReading>
  /** Whether the stream is trusted right now, and since when. */
  stream: { trusted: boolean; trustedSince: number | null }
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
  /** What kind of market this is — trend, range, breakout, transition — with its reasons. */
  regime: Feature<RegimeReading>
  /** Order flow from the trade and book streams. */
  flow: FlowFeatures
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
  /** This candle's delta and the anchored CVD, from the tape only; null when not available. */
  delta: number | null
  cvd: number | null
}
