/**
 * The feature engine: one FeatureSnapshot per closed candle, computed
 * from the candles and — when it has covered the whole anchor — the
 * live tape. The same code runs in a replay and in the live loop, so a
 * strategy tested on history sees exactly what it will see live.
 *
 * Inputs only. No trade rules here.
 */

import { config } from '../../config.ts'
import type { Candle, SessionName } from '../types.ts'
import { hourlyAverages } from './ema.ts'
import { momentum } from './momentum.ts'
import { volatility } from './volatility.ts'
import { candleSums, vwapFromSums } from './vwap.ts'
import { profileFromCandles, profileFromHistogram, valueArea } from './volumeProfile.ts'
import { priceTick, tradeTape } from './trades.ts'
import type { TradeAccumulator } from './trades.ts'
import { structureReading } from './structure.ts'
import type { StructureInputs, StructureReading } from './structure.ts'
import { liquidityReading } from './liquidity.ts'
import type { LiquidityInputs, LiquidityReading } from './liquidity.ts'
import { FEATURE_VERSION } from './types.ts'
import type { Feature, FeaturePoint, FeatureSnapshot, FeatureSource, ProfileReading, VwapReading } from './types.ts'

function feature<T>(value: T | null, source: FeatureSource, asOf: number, approximate = false, note?: string): Feature<T> {
  return { value, available: value !== null, source: value === null ? 'none' : source, asOf, approximate: value !== null && approximate, ...(note ? { note } : {}) }
}

export type StepContext = {
  dayKey: string
  session: SessionName | null
  atr: number
  /** The structure trackers, when the caller runs them (the ICT engine does). */
  structure?: StructureInputs
  /** Today's levels and sweeps, when the caller tracks them. */
  liquidity?: LiquidityInputs
}

export class FeatureEngine {
  private readonly tape: TradeAccumulator | null
  private dayKey: string | null = null
  private dayStart = 0
  private session: SessionName | null = null
  private sessionStart = 0
  private readonly points: FeaturePoint[] = []
  private readonly keepPoints: number
  latest: FeatureSnapshot | null = null

  /** `tape` defaults to the process-wide one; pass null to compute from candles only. */
  constructor(tape: TradeAccumulator | null = tradeTape, keepPoints = 2000) {
    this.tape = tape
    this.keepPoints = keepPoints
  }

  /** Call with every candle index in order. */
  step(candles: Candle[], i: number, ctx: StepContext): FeatureSnapshot {
    const c = candles[i]
    if (ctx.dayKey !== this.dayKey) { this.dayKey = ctx.dayKey; this.dayStart = i }
    if (ctx.session !== this.session) { this.session = ctx.session; this.sessionStart = i }
    const asOf = c.closeTime
    const sd = config.features.vwapBandSd

    // The tape, if it covered the whole day without a gap.
    const tapeDay = this.tape?.sums(candles[this.dayStart].openTime, c.openTime) ?? null
    const dayExact = tapeDay?.exact === true
    const tapeNote = !this.tape ? 'no tape in this run' : !tapeDay ? 'no trades on the tape for today yet' : !this.tape.trustedSince() ? 'the stream is down' : !dayExact ? 'the stream came up, or had a gap, after the day started' : 'the tape covered the whole day'

    const vwapDayTape = feature<VwapReading>(dayExact && tapeDay ? vwapFromSums(tapeDay, candles[this.dayStart].openTime, i - this.dayStart + 1, sd) : null, 'trades', asOf, false, dayExact ? undefined : `VWAP from the tape is unavailable: ${tapeNote}.`)
    const vwapDay = vwapDayTape.available
      ? vwapDayTape
      : feature<VwapReading>(vwapFromSums(candleSums(candles, this.dayStart, i), candles[this.dayStart].openTime, i - this.dayStart + 1, sd), 'candles', asOf, true, 'From candle volume at each candle\'s typical price; the tape would be exact.')

    let vwapSession: Feature<VwapReading>
    if (ctx.session === null) vwapSession = feature<VwapReading>(null, 'none', asOf, false, 'Between sessions: no session to anchor to.')
    else {
      const tapeSession = this.tape?.sums(candles[this.sessionStart].openTime, c.openTime) ?? null
      vwapSession = tapeSession?.exact
        ? feature<VwapReading>(vwapFromSums(tapeSession, candles[this.sessionStart].openTime, i - this.sessionStart + 1, sd), 'trades', asOf)
        : feature<VwapReading>(vwapFromSums(candleSums(candles, this.sessionStart, i), candles[this.sessionStart].openTime, i - this.sessionStart + 1, sd), 'candles', asOf, true, 'From candle volume; the tape would be exact.')
    }

    const bucketSize = Math.max(priceTick(c.close), ctx.atr * config.features.profileBucketAtr)
    const profileDay = dayExact && tapeDay
      ? feature<ProfileReading>(valueArea(profileFromHistogram(tapeDay.hist, tapeDay.tick, bucketSize), bucketSize, config.features.valueAreaPercent), 'trades', asOf)
      : feature<ProfileReading>(valueArea(profileFromCandles(candles, this.dayStart, i, bucketSize), bucketSize, config.features.valueAreaPercent), 'candles', asOf, true, 'Each candle\'s volume spread evenly across its range; the tape would be exact.')

    const hourly = hourlyAverages(candles, i)
    const snap: FeatureSnapshot = {
      version: FEATURE_VERSION,
      index: i,
      openTime: c.openTime,
      closeTime: c.closeTime,
      price: c.close,
      asOf,
      dayKey: ctx.dayKey,
      session: ctx.session,
      atr: feature(ctx.atr, 'candles', asOf),
      hourly: feature(hourly, 'candles', asOf, false, hourly ? undefined : `Not enough history: the hourly averages need about ${config.features.hourlyAveragesMinHours} hours.`),
      momentum: feature(i > 0 ? momentum(candles, i, ctx.atr) : null, 'candles', asOf, false, i > 0 ? undefined : 'First candle: nothing to measure against.'),
      volatility: feature(volatility(candles, i, ctx.atr), 'candles', asOf),
      vwapDay,
      vwapSession,
      vwapDayTape,
      profileDay,
      structure: feature<StructureReading>(ctx.structure ? structureReading(ctx.structure, c.close, ctx.atr) : null, 'candles', asOf, false, ctx.structure ? undefined : 'No structure trackers in this run.'),
      liquidity: feature<LiquidityReading>(ctx.liquidity ? liquidityReading(ctx.liquidity, c.close, ctx.atr) : null, 'candles', asOf, false, ctx.liquidity ? undefined : 'No levels tracked in this run.'),
      tape: { exact: dayExact, note: tapeNote },
    }
    this.latest = snap
    this.points.push({
      openTime: c.openTime,
      vwapDay: vwapDay.value?.vwap ?? null, vwapDayUpper: vwapDay.value?.upper ?? null, vwapDayLower: vwapDay.value?.lower ?? null,
      vwapSession: vwapSession.value?.vwap ?? null,
      dayAnchor: vwapDay.value?.anchoredAt ?? null, sessionAnchor: vwapSession.value?.anchoredAt ?? null,
    })
    if (this.points.length > this.keepPoints) this.points.splice(0, this.points.length - this.keepPoints)
    return snap
  }

  /** The VWAP lines from `fromTime` on, for drawing. */
  series(fromTime = 0): FeaturePoint[] {
    return this.points.filter((p) => p.openTime >= fromTime)
  }
}
