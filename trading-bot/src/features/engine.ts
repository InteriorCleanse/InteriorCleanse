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
import type { TapeBucket, TradeAccumulator } from './trades.ts'
import { INTERVAL_MS } from '../market.ts'
import { structureReading } from './structure.ts'
import type { StructureInputs, StructureReading } from './structure.ts'
import { classifyRegime } from './regime.ts'
import type { Dir, RegimeReading } from './regime.ts'
import { volatility as volatilityOf } from './volatility.ts'
import { atrAt } from './atr.ts'
import { liquidityReading } from './liquidity.ts'
import type { LiquidityInputs, LiquidityReading } from './liquidity.ts'
import { deltaOf } from './delta.ts'
import { cvdBetween, cvdSinceTrusted } from './cvd.ts'
import { tapeSpeed } from './tape.ts'
import { largeTrades } from './largeTrades.ts'
import { bookImbalance } from './imbalance.ts'
import { footprint } from './footprint.ts'
import { absorption } from './absorption.ts'
import type { Book } from '../data/types.ts'
import { FEATURE_VERSION } from './types.ts'
import type { AbsorptionReading, BookImbalanceReading, CvdReading, DeltaReading, Feature, FeaturePoint, FeatureSnapshot, FeatureSource, FlowFeatures, FootprintReading, LargeTradesReading, ProfileReading, TapeSpeedReading, VwapReading } from './types.ts'

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
  /** The live order book, when there is one. Only used if it is fresh as of this candle's close. */
  book?: Book | null
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

    const flow = this.flowFeatures(candles, i, ctx, asOf, bucketSize)
    const hourly = hourlyAverages(candles, i)
    const mom = i > 0 ? momentum(candles, i, ctx.atr) : null
    const vol = volatility(candles, i, ctx.atr)
    const structureVal = ctx.structure ? structureReading(ctx.structure, c.close, ctx.atr) : null
    const regime = this.regimeFeature(candles, i, ctx, asOf, structureVal, hourly, mom, vol, flow)
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
      momentum: feature(mom, 'candles', asOf, false, i > 0 ? undefined : 'First candle: nothing to measure against.'),
      volatility: feature(vol, 'candles', asOf),
      vwapDay,
      vwapSession,
      vwapDayTape,
      profileDay,
      structure: feature<StructureReading>(structureVal, 'candles', asOf, false, ctx.structure ? undefined : 'No structure trackers in this run.'),
      liquidity: feature<LiquidityReading>(ctx.liquidity ? liquidityReading(ctx.liquidity, c.close, ctx.atr) : null, 'candles', asOf, false, ctx.liquidity ? undefined : 'No levels tracked in this run.'),
      regime,
      flow,
      tape: { exact: dayExact, note: tapeNote },
    }
    this.latest = snap
    this.points.push({
      openTime: c.openTime,
      vwapDay: vwapDay.value?.vwap ?? null, vwapDayUpper: vwapDay.value?.upper ?? null, vwapDayLower: vwapDay.value?.lower ?? null,
      vwapSession: vwapSession.value?.vwap ?? null,
      dayAnchor: vwapDay.value?.anchoredAt ?? null, sessionAnchor: vwapSession.value?.anchoredAt ?? null,
      delta: flow.delta.value?.delta ?? null, cvd: flow.cvd.value?.value ?? null,
    })
    if (this.points.length > this.keepPoints) this.points.splice(0, this.points.length - this.keepPoints)
    return snap
  }

  /**
   * Order flow, from the streams only. Never built from candles: when the
   * tape did not see every trade of a candle, the reading is unavailable
   * and says why.
   */
  private flowFeatures(candles: Candle[], i: number, ctx: StepContext, asOf: number, bucketSize: number): FlowFeatures {
    const c = candles[i]
    const tape = this.tape
    const trustedSince = tape?.trustedSince() ?? null
    const off = <T>(note: string): Feature<T> => feature<T>(null, 'trades', asOf, false, note)
    if (!tape) {
      const note = 'No tape in this run.'
      return { delta: off(note), cvd: off(note), cvdSinceGap: off(note), tapeSpeed: off(note), largeTrades: off(note), bookImbalance: off('No book in this run.'), footprint: off(note), absorption: off(note), stream: { trusted: false, trustedSince: null } }
    }
    const down = trustedSince === null
    const gapNote = down ? 'The stream is down: nothing on the tape is trusted.' : 'The stream came up, or had a gap, after this candle opened.'

    // This candle
    const b = tape.bucket(c.openTime)
    const bucketExact = tape.bucketExact(c.openTime)
    const delta = bucketExact && b ? feature<DeltaReading>(deltaOf(b), 'trades', asOf) : off<DeltaReading>(b ? gapNote : down ? gapNote : 'No trades on the tape for this candle.')
    const fp = bucketExact && b ? feature<FootprintReading>(footprint(b, tape.tick(), bucketSize), 'trades', asOf) : off<FootprintReading>(b ? gapNote : 'No trades on the tape for this candle.')

    // CVD from the anchor
    const anchorIndex = config.features.cvdAnchor === 'session' && ctx.session !== null ? this.sessionStart : this.dayStart
    const anchored = cvdBetween(tape, candles[anchorIndex].openTime, c.openTime)
    const cvd = anchored?.complete ? feature<CvdReading>(anchored, 'trades', asOf) : off<CvdReading>(anchored ? `Not every trade since the ${config.features.cvdAnchor} anchor was seen (${down ? 'stream down' : 'gap or late start'}); see cvdSinceGap.` : 'No trades on the tape since the anchor.')
    const restarted = anchored?.complete ? null : cvdSinceTrusted(tape, c.openTime)
    const cvdSinceGap = restarted && restarted.complete ? feature<CvdReading>(restarted, 'trades', asOf) : off<CvdReading>(down ? gapNote : 'No trusted stretch of tape to sum from yet.')

    // Rolling windows — trusted only while the stream has not dropped.
    const speed = feature<TapeSpeedReading>(down ? null : tapeSpeed(tape, asOf, config.features.tapeWindowSec), 'trades', asOf, false, down ? gapNote : undefined)
    const large = feature<LargeTradesReading>(down ? null : largeTrades(tape, asOf, config.features.largeTradesWindowMin), 'trades', asOf, false, down ? gapNote : undefined)

    // Book imbalance — only when a book arrived around this candle's close (so old
    // replayed candles never borrow a live book).
    const book = ctx.book ?? tape.latestBook() ?? null
    const bookFresh = book !== null && book.synced && book.receivedAt >= asOf && book.receivedAt - asOf <= (INTERVAL_MS[config.interval] ?? 300_000)
    const bimb = bookFresh ? bookImbalance(book, config.features.bookBandPct) : null
    const bookImb = bimb ? feature<BookImbalanceReading>(bimb, 'trades', asOf) : off<BookImbalanceReading>(book === null ? 'No order book in this run.' : !book.synced ? 'The order book is still being stitched.' : 'No book update at this candle close yet.')

    // Absorption — this candle against the previous exact candles.
    let absorptionF: Feature<AbsorptionReading>
    if (bucketExact && b) {
      const prev: TapeBucket[] = []
      for (let j = i - 1; j >= 0 && prev.length < config.features.absorption.minHistory * 2; j--) {
        const pb = tape.bucket(candles[j].openTime)
        if (pb && tape.bucketExact(candles[j].openTime)) prev.push(pb)
      }
      const a = absorption(b, prev, ctx.atr, config.features.absorption)
      absorptionF = a ? feature<AbsorptionReading>(a, 'trades', asOf) : off<AbsorptionReading>(`Not enough exact history yet (need ${config.features.absorption.minHistory} prior candles seen in full).`)
    } else {
      absorptionF = off<AbsorptionReading>(b ? gapNote : down ? gapNote : 'No trades on the tape for this candle.')
    }

    return { delta, cvd, cvdSinceGap, tapeSpeed: speed, largeTrades: large, bookImbalance: bookImb, footprint: fp, absorption: absorptionF, stream: { trusted: !down, trustedSince } }
  }

  /** Price against the 20/50-hour averages: the same rule the market-state vote uses. */
  private averagesDir(hourly: FeatureSnapshot['hourly']['value'], close: number): Dir {
    if (!hourly) return null
    const rising = hourly.ema20 > hourly.ema20Prev
    if (close > hourly.ema20 && close > hourly.ema50 && rising && hourly.ema20 > hourly.ema50) return 'up'
    if (close < hourly.ema20 && close < hourly.ema50 && !rising && hourly.ema20 < hourly.ema50) return 'down'
    return null
  }

  /**
   * The regime, from the readings this candle already produced. Needs the
   * structure trackers; without them (a candles-only run) it is unavailable.
   */
  private regimeFeature(
    candles: Candle[], i: number, ctx: StepContext, asOf: number,
    structureVal: StructureReading | null, hourly: FeatureSnapshot['hourly']['value'],
    mom: FeatureSnapshot['momentum']['value'], vol: NonNullable<FeatureSnapshot['volatility']['value']>,
    flow: FlowFeatures,
  ): Feature<RegimeReading> {
    if (!structureVal) return feature<RegimeReading>(null, 'candles', asOf, false, 'No structure trackers in this run.')
    const cfg = config.features.regime
    const lookbackIdx = i - cfg.breakoutLookback
    const beforeRatio = lookbackIdx >= 0 ? volatilityOf(candles, lookbackIdx, atrAt(candles, lookbackIdx)).ratio : vol.ratio
    const volExpanding = vol.ratio >= 1 && vol.ratio >= beforeRatio * cfg.breakoutVolRatio
    const cvdV = flow.cvd.value?.value ?? flow.cvdSinceGap.value?.value ?? null
    const flowDir: Dir = cvdV === null ? null : cvdV > 0 ? 'up' : cvdV < 0 ? 'down' : null
    const reading = classifyRegime({
      swingTrend: structureVal.swingTrend,
      lastShiftKind: structureVal.lastShift?.kind ?? null,
      lastShiftDir: structureVal.lastShift?.direction ?? null,
      shiftAgeCandles: structureVal.lastShift ? i - structureVal.lastShift.index : null,
      averages: this.averagesDir(hourly, candles[i].close),
      momentumAtr: mom?.moveAtr ?? 0,
      volLabel: vol.label,
      volExpanding,
      flow: flowDir,
    }, cfg.recentShiftCandles)
    return feature<RegimeReading>(reading, 'candles', asOf)
  }

  series(fromTime = 0): FeaturePoint[] {
    return this.points.filter((p) => p.openTime >= fromTime)
  }
}
