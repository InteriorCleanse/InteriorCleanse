/**
 * Automatic chart markup (Phase 22C) — the read-only projection of engine state
 * onto canonical annotations.
 *
 * Every extractor here is PURE and takes already-computed engine output. None
 * of them re-derives structure, re-runs a strategy, or recomputes risk: if the
 * engine did not detect it, it does not get drawn. That is what keeps the chart
 * an honest picture of the engine rather than a second opinion.
 *
 * No-look-ahead comes for free: `IctAnalysis(i)` is produced by an incremental
 * engine that has only consumed candles 0..i, so anything read off it was
 * knowable at `analysis.time`. Each annotation still records `knownAt`
 * explicitly — the earliest candle close at which the engine could report it —
 * so replay can filter and tests can prove it.
 *
 * The rationale on every annotation comes from the engine's own describe
 * helpers. Where the engine recorded no explanation, the annotation says so
 * rather than inventing prose.
 */

import { config } from '../../config.ts'
import type { Candle, IctAnalysis, Level, FVG, OrderBlock, StructureShift, LabelledSwing, Sweep, SessionRange, NewsReport } from '../types.ts'
import type { StrategyVote } from '../strategies/types.ts'
import type { FusedDecision } from '../fusion.ts'
import type { Feature } from '../features/types.ts'
import { describeShift, describeSwing } from '../structure.ts'
import { describeSweep } from '../liquidity.ts'
import { describeOrderBlock, breakerRole } from '../orderblocks.ts'
import { describeDealingRange } from '../features/dealingRange.ts'
import { ifvgRole } from '../fvg.ts'
import { makeAnnotation, sortAnnotations, dedupeAnnotations, NO_RATIONALE } from './types.ts'
import type { ChartAnnotation, DataQuality, Lifecycle, AnnotationType } from './types.ts'

/**
 * The read-only bundle the intelligence layer is allowed to see. Everything in
 * it was computed by the engine already; nothing is recomputed here.
 */
export type EngineView = {
  symbol: string
  timeframe: string
  engineVersion: string
  analysis: IctAnalysis | null
  /**
   * The candle series, when the caller has it. Used ONLY to turn an engine index
   * into the timestamp at which something became knowable (a swing is confirmed
   * some candles after it prints). Without it those annotations fall back to the
   * analysis time, which is still safe but less precise.
   */
  candles?: Candle[]
  votes?: StrategyVote[]
  decision?: FusedDecision | null
  news?: NewsReport | null
  /** Open + closed paper positions, for linking trades to their setups. */
  trades?: Array<{ id: string; openedAt: number; setupKey: string; direction: 'long' | 'short'; entry: number; stop: number; target: number; status: string; exitReason?: string; closedAt?: number }>
  /** Overrides "now" for deterministic tests. */
  now?: number
}

/** The data-quality label a Feature implies, propagated verbatim — never upgraded. */
function qualityOf(f: Feature<unknown> | undefined | null): DataQuality {
  if (!f || !f.available || f.value === null) return 'UNAVAILABLE'
  return f.approximate ? 'APPROXIMATE' : 'REAL'
}

/** Candle data itself is real; this is the label for marks read straight off candles. */
const CANDLE_QUALITY: DataQuality = 'REAL'

// ---------------------------------------------------------------
// STRUCTURE
// ---------------------------------------------------------------

const SWING_LABEL_TYPE: Record<LabelledSwing['label'], AnnotationType> = {
  HH: 'higher-high', HL: 'higher-low', LH: 'lower-high', LL: 'lower-low',
  H: 'swing-high', L: 'swing-low',
}

/**
 * Swing points with their place in the sequence, and the structure breaks.
 *
 * A swing is only CONFIRMED some candles after it prints (the tracker needs the
 * candles either side), so `knownAt` is the analysis time at which the engine
 * reported it — not the swing's own timestamp. That gap is exactly what a
 * look-ahead bug would erase, so it is recorded rather than smoothed over.
 */
export function annotateStructure(view: EngineView): ChartAnnotation[] {
  const a = view.analysis
  if (!a) return []
  const now = view.now ?? Date.now()
  const base = { symbol: view.symbol, timeframe: view.timeframe, engineVersion: view.engineVersion, regime: a.features?.regime?.value?.state ?? null }
  const out: ChartAnnotation[] = []

  // The tracker confirms a swing `swingLookback` candles after it prints — it
  // needs that many candles on BOTH sides. So the moment it became knowable is
  // that later candle's close, which is fixed for the life of the swing. Using
  // the current analysis time instead would quietly re-date the swing on every
  // frame and make "when did we learn this?" unanswerable.
  const k = config.ict.swingLookback
  const confirmTime = (swingIndex: number): number => view.candles?.[swingIndex + k]?.closeTime ?? a.time

  for (const s of a.swings) {
    out.push(makeAnnotation({
      ...base,
      annotationType: SWING_LABEL_TYPE[s.label],
      layer: 'structure',
      source: 'swing-tracker',
      sourceFeature: 'swings',
      eventTime: s.time,
      knownAt: Math.max(s.time, Math.min(confirmTime(s.index), a.time)),
      price: s.price,
      direction: s.kind === 'high' ? 'bearish' : 'bullish',
      dataQuality: CANDLE_QUALITY,
      rationale: describeSwing(s) || NO_RATIONALE,
      lifecycleStatus: 'ACTIVE',
      invalidationCondition: s.kind === 'high' ? `A close above $${s.price.toFixed(2)} breaks this swing high.` : `A close below $${s.price.toFixed(2)} breaks this swing low.`,
    }, now))
  }

  for (const sh of a.structureShifts) {
    out.push(makeAnnotation({
      ...base,
      annotationType: sh.kind === 'BOS' ? 'bos' : 'choch',
      layer: 'structure',
      source: 'structure-tracker',
      sourceFeature: 'structureShifts',
      eventTime: sh.time,
      knownAt: sh.time, // a break is known on the candle that closed through
      price: sh.price,
      direction: sh.direction,
      dataQuality: CANDLE_QUALITY,
      rationale: describeShift(sh) || NO_RATIONALE,
      lifecycleStatus: 'TRIGGERED',
      invalidationCondition: `The break is undone if price closes back beyond $${sh.brokeSwing.price.toFixed(2)}.`,
      discriminator: `${sh.kind}:${sh.brokeSwing.time}`,
    }, now))
  }

  if (a.dealingRange) {
    const d = a.dealingRange
    out.push(makeAnnotation({
      ...base,
      annotationType: 'dealing-range',
      layer: 'structure',
      source: 'structure-tracker',
      sourceFeature: 'dealingRange',
      eventTime: a.time,
      knownAt: a.time,
      priceHigh: d.high,
      priceLow: d.low,
      price: d.equilibrium,
      dataQuality: CANDLE_QUALITY,
      rationale: describeDealingRange(d) || NO_RATIONALE,
      lifecycleStatus: 'ACTIVE',
      strategyState: d.zone,
      invalidationCondition: 'A new confirmed swing high or low redraws the range.',
    }, now))
  }
  return out
}

// ---------------------------------------------------------------
// LIQUIDITY
// ---------------------------------------------------------------

/** Map an engine level kind onto an annotation type. Session highs/lows keep their identity. */
function levelType(l: Level): AnnotationType {
  switch (l.kind) {
    case 'pdh': return 'previous-day-high'
    case 'pdl': return 'previous-day-low'
    case 'eqh': return 'equal-highs'
    case 'eql': return 'equal-lows'
    case 'swing-high': return 'swing-high'
    case 'swing-low': return 'swing-low'
    case 'asia-high': case 'london-high': case 'ny-high': return 'session-high'
    case 'asia-low': case 'london-low': case 'ny-low': return 'session-low'
    default: return 'buyside-liquidity'
  }
}

/** A high holds buy-side liquidity above it; a low holds sell-side below. */
function liquiditySide(l: Level): AnnotationType {
  return l.kind.endsWith('-high') || l.kind === 'pdh' || l.kind === 'eqh' ? 'buyside-liquidity' : 'sellside-liquidity'
}

function levelLifecycle(l: Level): Lifecycle {
  if (l.brokenAt !== undefined) return 'INVALIDATED'
  if (l.sweptAt !== undefined) return 'TRIGGERED'
  return 'ACTIVE'
}

/**
 * Liquidity: the levels the engine is watching, which side of the book they
 * represent, and the raids on them.
 *
 * A level's `knownAt` is its own time — it exists as soon as the session or day
 * that formed it closed, which is what `Level.time` records.
 */
export function annotateLiquidity(view: EngineView): ChartAnnotation[] {
  const a = view.analysis
  if (!a) return []
  const now = view.now ?? Date.now()
  const base = { symbol: view.symbol, timeframe: view.timeframe, engineVersion: view.engineVersion, regime: a.features?.regime?.value?.state ?? null }
  const out: ChartAnnotation[] = []

  for (const l of a.levels) {
    const status = levelLifecycle(l)
    out.push(makeAnnotation({
      ...base,
      annotationType: levelType(l),
      layer: 'liquidity',
      source: 'liquidity',
      sourceFeature: `level:${l.kind}`,
      eventTime: l.time,
      knownAt: l.time,
      price: l.price,
      direction: l.kind.endsWith('-high') || l.kind === 'pdh' || l.kind === 'eqh' ? 'bearish' : 'bullish',
      dataQuality: CANDLE_QUALITY,
      rationale: `${l.label} at $${l.price.toFixed(2)}${l.sweptAt ? ' — already swept' : l.brokenAt ? ' — closed clean through, so it is broken rather than swept' : ' — intact'}.`,
      lifecycleStatus: status,
      invalidationCondition: 'A close clean through this level breaks it; a poke that closes back inside sweeps it.',
      endTime: l.brokenAt ?? null,
      discriminator: l.kind,
    }, now))

    // The pool of stops the level implies — drawn only while the level is intact.
    if (status === 'ACTIVE') {
      out.push(makeAnnotation({
        ...base,
        annotationType: liquiditySide(l),
        layer: 'liquidity',
        source: 'liquidity',
        sourceFeature: `pool:${l.kind}`,
        eventTime: l.time,
        knownAt: l.time,
        price: l.price,
        dataQuality: CANDLE_QUALITY,
        rationale: `Resting orders are expected ${liquiditySide(l) === 'buyside-liquidity' ? 'above' : 'below'} ${l.label}. This is the pool a raid would target.`,
        lifecycleStatus: 'ACTIVE',
        invalidationCondition: 'The pool is taken once price trades through the level.',
        discriminator: l.kind,
      }, now))
    }
  }

  // Raids: session-level sweeps the checklist reads, and swing raids kept apart.
  const sweeps: Array<{ s: Sweep; kind: AnnotationType; feature: string }> = [
    ...a.sweepsToday.map((s) => ({ s, kind: 'liquidity-sweep' as AnnotationType, feature: 'sweepsToday' })),
    ...a.swingSweepsToday.map((s) => ({ s, kind: 'liquidity-raid' as AnnotationType, feature: 'swingSweepsToday' })),
  ]
  for (const { s, kind, feature } of sweeps) {
    out.push(makeAnnotation({
      ...base,
      annotationType: kind,
      layer: 'liquidity',
      source: 'liquidity',
      sourceFeature: feature,
      eventTime: s.time,
      knownAt: s.time,
      price: s.level.price,
      priceHigh: s.side === 'above' ? s.wick : null,
      priceLow: s.side === 'below' ? s.wick : null,
      direction: s.side === 'above' ? 'bearish' : 'bullish',
      dataQuality: CANDLE_QUALITY,
      rationale: describeSweep(s) || NO_RATIONALE,
      lifecycleStatus: 'TRIGGERED',
      invalidationCondition: 'A later close beyond the raided level turns the sweep into a genuine break.',
      discriminator: `${s.level.kind}:${s.side}`,
    }, now))
  }

  // A level that was swept and NOT closed through is, by the engine's own
  // definition, a failed breakout. We label it only from that recorded state.
  for (const l of a.levels) {
    if (l.sweptAt !== undefined && l.brokenAt === undefined) {
      out.push(makeAnnotation({
        ...base,
        annotationType: 'failed-breakout',
        layer: 'liquidity',
        source: 'liquidity',
        sourceFeature: `failed:${l.kind}`,
        eventTime: l.sweptAt,
        knownAt: l.sweptAt,
        price: l.price,
        direction: l.kind.endsWith('-high') || l.kind === 'pdh' || l.kind === 'eqh' ? 'bearish' : 'bullish',
        dataQuality: CANDLE_QUALITY,
        rationale: `${l.label} was poked and price closed back inside — a failed breakout, not a break.`,
        lifecycleStatus: 'TRIGGERED',
        invalidationCondition: 'A subsequent clean close through the level invalidates the failure.',
        discriminator: l.kind,
      }, now))
    }
  }
  return out
}

// ---------------------------------------------------------------
// IMBALANCE (fair value gaps)
// ---------------------------------------------------------------

const FVG_LIFECYCLE: Record<FVG['state'], Lifecycle> = {
  fresh: 'ACTIVE', mitigated: 'MITIGATED', inverted: 'INVALIDATED', expired: 'EXPIRED',
}

/**
 * Fair value gaps, their midpoint, and the moments they were mitigated or
 * inverted. An inverted gap is INVALIDATED as a gap — it now works the other
 * way round, which the engine records as its `inverted` state and `ifvgRole`.
 */
export function annotateImbalance(view: EngineView): ChartAnnotation[] {
  const a = view.analysis
  if (!a) return []
  const now = view.now ?? Date.now()
  const base = { symbol: view.symbol, timeframe: view.timeframe, engineVersion: view.engineVersion, regime: a.features?.regime?.value?.state ?? null }
  const out: ChartAnnotation[] = []

  for (const f of a.fvgs) {
    const role = ifvgRole(f)
    const mid = (f.top + f.bottom) / 2
    out.push(makeAnnotation({
      ...base,
      annotationType: f.direction === 'bullish' ? 'fvg-bullish' : 'fvg-bearish',
      layer: 'imbalance',
      source: 'fvg-tracker',
      sourceFeature: `fvg:${f.id}`,
      eventTime: f.createdTime,
      knownAt: f.createdTime,
      priceHigh: f.top,
      priceLow: f.bottom,
      price: mid,
      direction: f.direction,
      dataQuality: CANDLE_QUALITY,
      rationale: `A ${f.direction} fair value gap of ${f.sizeAtr.toFixed(2)} ATR between $${f.bottom.toFixed(2)} and $${f.top.toFixed(2)}${f.fromDisplacement ? ', left by a displacement candle' : ''}. State: ${f.state}${role ? ` — now acting as ${role}` : ''}.`,
      lifecycleStatus: FVG_LIFECYCLE[f.state],
      strategyState: role,
      invalidationCondition: f.direction === 'bullish' ? `A close below $${f.bottom.toFixed(2)} inverts this gap.` : `A close above $${f.top.toFixed(2)} inverts this gap.`,
      discriminator: f.id,
    }, now))

    // The midpoint (consequent encroachment) — only for a gap still in play.
    if (f.state === 'fresh' || f.state === 'mitigated') {
      out.push(makeAnnotation({
        ...base,
        annotationType: 'fvg-midpoint',
        layer: 'imbalance',
        source: 'fvg-tracker',
        sourceFeature: `fvg-mid:${f.id}`,
        eventTime: f.createdTime,
        knownAt: f.createdTime,
        price: mid,
        direction: f.direction,
        dataQuality: CANDLE_QUALITY,
        rationale: `Midpoint of the ${f.direction} gap — the level price often reacts to inside the imbalance.`,
        lifecycleStatus: FVG_LIFECYCLE[f.state],
        discriminator: f.id,
      }, now))
    }

    if (f.state === 'mitigated') {
      // The engine records THAT a gap is mitigated but not WHEN, so the only
      // truthful statement is "as of this candle, it is mitigated". Both times
      // are therefore the analysis time, and the rationale says the timestamp is
      // not recorded rather than inventing one.
      out.push(makeAnnotation({
        ...base,
        annotationType: 'fvg-mitigation',
        layer: 'imbalance',
        source: 'fvg-tracker',
        sourceFeature: `fvg-mitigation:${f.id}`,
        eventTime: a.time,
        knownAt: a.time,
        priceHigh: f.top,
        priceLow: f.bottom,
        direction: f.direction,
        dataQuality: CANDLE_QUALITY,
        rationale: `As of this candle, price has traded back into the ${f.direction} gap — mitigated, but not inverted. The engine does not record the exact moment of mitigation, so no earlier time is claimed.`,
        lifecycleStatus: 'MITIGATED',
        discriminator: f.id,
      }, now))
    }

    if (f.state === 'inverted' && f.invertedTime !== undefined) {
      out.push(makeAnnotation({
        ...base,
        annotationType: 'fvg-invalidation',
        layer: 'imbalance',
        source: 'fvg-tracker',
        sourceFeature: `fvg-inversion:${f.id}`,
        eventTime: f.invertedTime,
        knownAt: f.invertedTime,
        priceHigh: f.top,
        priceLow: f.bottom,
        direction: f.direction === 'bullish' ? 'bearish' : 'bullish',
        dataQuality: CANDLE_QUALITY,
        rationale: `Price closed through the ${f.direction} gap — it is inverted and now acts as ${role ?? 'the opposite'}.`,
        lifecycleStatus: 'INVALIDATED',
        discriminator: f.id,
      }, now))
    }
  }
  return out
}

// ---------------------------------------------------------------
// ORDER BLOCKS
// ---------------------------------------------------------------

const OB_LIFECYCLE: Record<OrderBlock['state'], Lifecycle> = {
  fresh: 'ACTIVE', mitigated: 'MITIGATED', broken: 'INVALIDATED', expired: 'EXPIRED',
}

/**
 * Order blocks, and the breakers they become when broken. A broken bullish
 * block flips to resistance and vice versa — `breakerRole` is the engine's own
 * reading of that, so we report it rather than deciding it.
 */
export function annotateOrderBlocks(view: EngineView): ChartAnnotation[] {
  const a = view.analysis
  if (!a) return []
  const now = view.now ?? Date.now()
  const base = { symbol: view.symbol, timeframe: view.timeframe, engineVersion: view.engineVersion, regime: a.features?.regime?.value?.state ?? null }
  const out: ChartAnnotation[] = []

  for (const b of a.orderBlocks) {
    const role = breakerRole(b)
    const isBreaker = b.state === 'broken' && role !== null
    out.push(makeAnnotation({
      ...base,
      annotationType: isBreaker ? 'breaker-block' : b.direction === 'bullish' ? 'order-block-bullish' : 'order-block-bearish',
      layer: 'orderblock',
      source: 'order-block-tracker',
      sourceFeature: `ob:${b.id}`,
      eventTime: b.time,
      knownAt: b.time,
      priceHigh: b.top,
      priceLow: b.bottom,
      price: (b.top + b.bottom) / 2,
      direction: isBreaker ? (b.direction === 'bullish' ? 'bearish' : 'bullish') : b.direction,
      dataQuality: CANDLE_QUALITY,
      rationale: describeOrderBlock(b) || NO_RATIONALE,
      lifecycleStatus: OB_LIFECYCLE[b.state],
      strategyState: role,
      invalidationCondition: b.direction === 'bullish' ? `A close below $${b.bottom.toFixed(2)} breaks this block and flips it to resistance.` : `A close above $${b.top.toFixed(2)} breaks this block and flips it to support.`,
      discriminator: b.id,
    }, now))

    if (b.state === 'mitigated' && b.mitigatedIndex !== undefined) {
      // Unlike a gap, the engine DOES record which candle mitigated a block, so
      // the exact time is used when the candles are available to resolve it.
      const at = Math.min(view.candles?.[b.mitigatedIndex]?.closeTime ?? a.time, a.time)
      out.push(makeAnnotation({
        ...base,
        annotationType: 'block-mitigation',
        layer: 'orderblock',
        source: 'order-block-tracker',
        sourceFeature: `ob-mitigation:${b.id}`,
        eventTime: at,
        knownAt: at,
        priceHigh: b.top,
        priceLow: b.bottom,
        direction: b.direction,
        dataQuality: CANDLE_QUALITY,
        rationale: `Price has traded back into the ${b.direction} order block — mitigated, still intact.`,
        lifecycleStatus: 'MITIGATED',
        discriminator: b.id,
      }, now))
    }

    if (b.state === 'broken' && b.brokenTime !== undefined) {
      out.push(makeAnnotation({
        ...base,
        annotationType: 'block-invalidation',
        layer: 'orderblock',
        source: 'order-block-tracker',
        sourceFeature: `ob-broken:${b.id}`,
        eventTime: b.brokenTime,
        knownAt: b.brokenTime,
        priceHigh: b.top,
        priceLow: b.bottom,
        direction: b.direction === 'bullish' ? 'bearish' : 'bullish',
        dataQuality: CANDLE_QUALITY,
        rationale: `Price closed through the ${b.direction} order block — it is broken and now acts as ${role ?? 'the opposite'} (a breaker).`,
        lifecycleStatus: 'INVALIDATED',
        discriminator: b.id,
      }, now))
    }
  }
  return out
}

// ---------------------------------------------------------------
// ICT STRATEGY SETUPS
// ---------------------------------------------------------------

/** The named ICT stories that have their own annotation type. */
const ICT_TYPES: Record<string, AnnotationType> = {
  'silver-bullet': 'silver-bullet-setup',
  unicorn: 'unicorn-setup',
  'turtle-soup': 'turtle-soup-setup',
}

/**
 * What each strategy is seeing right now, straight off its vote. The evidence
 * list is the strategy's own; a setup only appears when the strategy actually
 * voted for it. A HOLD produces no setup mark — we do not draw wishes.
 */
export function annotateStrategies(view: EngineView): ChartAnnotation[] {
  const a = view.analysis
  const votes = view.votes ?? []
  if (!a || !votes.length) return []
  const now = view.now ?? Date.now()
  const regime = a.features?.regime?.value?.state ?? null
  const base = { symbol: view.symbol, timeframe: view.timeframe, engineVersion: view.engineVersion, regime }
  const out: ChartAnnotation[] = []

  for (const v of votes) {
    if (v.action === 'HOLD') continue
    const passed = v.evidence.filter((e) => e.passed).length
    out.push(makeAnnotation({
      ...base,
      annotationType: ICT_TYPES[v.id] ?? 'strategy-setup',
      layer: 'ict',
      source: 'strategy',
      sourceFeature: v.id,
      eventTime: a.time,
      knownAt: a.time,
      price: v.plan?.entry ?? a.price,
      priceHigh: v.plan ? Math.max(v.plan.entry, v.plan.takeProfit) : null,
      priceLow: v.plan ? Math.min(v.plan.entry, v.plan.stop) : null,
      direction: v.direction,
      strategyIds: [v.id],
      strategyState: v.action,
      confidence: v.confidence,
      dataQuality: CANDLE_QUALITY,
      rationale: `${v.reason} (${passed}/${v.evidence.length} conditions met).`,
      lifecycleStatus: 'TRIGGERED',
      invalidationCondition: v.evidence.filter((e) => !e.passed).map((e) => e.step).join('; ') || 'All of this strategy\'s conditions are currently met.',
      discriminator: v.setupKey,
    }, now))
  }

  // The silver-bullet WINDOW is a time-of-day fact the strategy exposes through
  // its evidence; we surface it only when that evidence step exists.
  const sb = votes.find((v) => v.id === 'silver-bullet')
  const windowStep = sb?.evidence.find((e) => /window/i.test(e.step))
  if (sb && windowStep) {
    out.push(makeAnnotation({
      ...base,
      annotationType: 'silver-bullet-window',
      layer: 'ict',
      source: 'strategy',
      sourceFeature: 'silver-bullet:window',
      eventTime: a.time,
      knownAt: a.time,
      dataQuality: CANDLE_QUALITY,
      rationale: `${windowStep.step}: ${windowStep.detail}`,
      lifecycleStatus: windowStep.passed ? 'ACTIVE' : 'EXPIRED',
      strategyIds: ['silver-bullet'],
      strategyState: windowStep.passed ? 'in-window' : 'out-of-window',
    }, now))
  }
  return out
}

// ---------------------------------------------------------------
// TRADE MAP
// ---------------------------------------------------------------

/**
 * The trade map for the engine's current plan: entry, stop, target, the zones
 * and the risk/reward. Drawn only when the engine actually produced a plan.
 */
export function annotateTradeMap(view: EngineView): ChartAnnotation[] {
  const a = view.analysis
  if (!a) return []
  const now = view.now ?? Date.now()
  const plan = a.signal.plan ?? view.decision?.plan
  if (!plan) return []
  const regime = a.features?.regime?.value?.state ?? null
  const base = { symbol: view.symbol, timeframe: view.timeframe, engineVersion: view.engineVersion, regime }
  const signalId = `${a.signal.setupKey}@${a.time}`
  const linked = (view.trades ?? []).find((t) => t.setupKey === a.signal.setupKey && Math.abs(t.openedAt - a.time) < 1)
  const common = { strategyIds: [a.signal.setupKey.split('|')[2] ?? 'session-ifvg'], linkedSignalId: signalId, linkedTradeId: linked?.id ?? null, dataQuality: CANDLE_QUALITY as DataQuality, eventTime: a.time, knownAt: a.time, direction: plan.direction }
  const out: ChartAnnotation[] = []

  out.push(makeAnnotation({ ...base, ...common, annotationType: 'entry', layer: 'trade', source: 'strategy', sourceFeature: 'plan.entry', price: plan.entry, rationale: `Entry ${plan.entryLabel || 'as planned'} at $${plan.entry.toFixed(2)}.`, lifecycleStatus: linked ? 'TRIGGERED' : 'ACTIVE', invalidationCondition: `The setup is void if price reaches the stop at $${plan.stop.toFixed(2)} first.` }, now))
  out.push(makeAnnotation({ ...base, ...common, annotationType: 'stop-loss', layer: 'trade', source: 'strategy', sourceFeature: 'plan.stop', price: plan.stop, rationale: `Stop ${plan.stopLabel || 'beyond the invalidation'} at $${plan.stop.toFixed(2)}.`, lifecycleStatus: 'ACTIVE' }, now))
  out.push(makeAnnotation({ ...base, ...common, annotationType: 'take-profit', layer: 'trade', source: 'strategy', sourceFeature: 'plan.takeProfit', price: plan.takeProfit, rationale: `Target ${plan.targetLabel || 'at the next pool of liquidity'} at $${plan.takeProfit.toFixed(2)}.`, lifecycleStatus: 'ACTIVE' }, now))
  out.push(makeAnnotation({ ...base, ...common, annotationType: 'stop-zone', layer: 'trade', source: 'strategy', sourceFeature: 'plan.stopZone', priceHigh: Math.max(plan.entry, plan.stop), priceLow: Math.min(plan.entry, plan.stop), rationale: `The risk band: entry to stop, ${Math.abs(plan.entry - plan.stop).toFixed(2)} of price.`, lifecycleStatus: 'ACTIVE' }, now))
  out.push(makeAnnotation({ ...base, ...common, annotationType: 'target-zone', layer: 'trade', source: 'strategy', sourceFeature: 'plan.targetZone', priceHigh: Math.max(plan.entry, plan.takeProfit), priceLow: Math.min(plan.entry, plan.takeProfit), rationale: `The reward band: entry to target, ${Math.abs(plan.takeProfit - plan.entry).toFixed(2)} of price.`, lifecycleStatus: 'ACTIVE' }, now))
  out.push(makeAnnotation({ ...base, ...common, annotationType: 'risk-reward', layer: 'trade', source: 'strategy', sourceFeature: 'plan.rr', price: plan.entry, confidence: a.signal.quality ?? null, rationale: `Reward-to-risk ${plan.rr.toFixed(2)}:1 as the engine measured it.`, lifecycleStatus: 'ACTIVE' }, now))
  out.push(makeAnnotation({ ...base, ...common, annotationType: 'invalidation-level', layer: 'trade', source: 'strategy', sourceFeature: 'plan.invalidation', price: plan.stop, rationale: `Below/above $${plan.stop.toFixed(2)} the reason for the trade no longer holds.`, lifecycleStatus: 'ACTIVE' }, now))
  return out
}

// ---------------------------------------------------------------
// MARKET CONTEXT
// ---------------------------------------------------------------

/**
 * Context: VWAP, session boundaries, the regime readings, the order-flow state
 * and news markers. Every one carries the data-quality label of the feature it
 * came from — an unavailable feature produces an UNAVAILABLE annotation that
 * says why, rather than silently disappearing.
 */
export function annotateContext(view: EngineView): ChartAnnotation[] {
  const a = view.analysis
  if (!a) return []
  const now = view.now ?? Date.now()
  const f = a.features
  const regime = f?.regime?.value?.state ?? null
  const base = { symbol: view.symbol, timeframe: view.timeframe, engineVersion: view.engineVersion, regime }
  const out: ChartAnnotation[] = []

  // VWAP — the day anchor, with its bands.
  const vw = f?.vwapDay
  out.push(makeAnnotation({
    ...base,
    annotationType: 'vwap',
    layer: 'context',
    source: 'feature-engine',
    sourceFeature: 'vwapDay',
    eventTime: a.time,
    knownAt: a.time,
    price: vw?.value?.vwap ?? null,
    priceHigh: vw?.value?.upper ?? null,
    priceLow: vw?.value?.lower ?? null,
    dataQuality: qualityOf(vw),
    rationale: vw?.value
      ? `Day VWAP $${vw.value.vwap.toFixed(2)} with one-deviation bands, over ${vw.value.candles} candles${vw.approximate ? ' (approximated from candles — the tape would be exact)' : ''}.`
      : `VWAP is unavailable: ${vw?.note ?? 'no reading was produced for this candle.'}`,
    lifecycleStatus: vw?.value ? 'ACTIVE' : 'EXPIRED',
  }, now))

  // Session boundaries — each session that has a range for this day.
  for (const s of Object.values(a.sessions) as SessionRange[]) {
    if (!s) continue
    out.push(makeAnnotation({
      ...base,
      annotationType: 'session-boundary',
      layer: 'context',
      source: 'session-tracker',
      sourceFeature: `session:${s.name}`,
      eventTime: s.startTime,
      knownAt: s.startTime,
      startTime: s.startTime,
      endTime: s.endTime,
      priceHigh: s.high,
      priceLow: s.low,
      dataQuality: CANDLE_QUALITY,
      rationale: `${s.label}: high $${s.high.toFixed(2)}, low $${s.low.toFixed(2)} over ${s.candles} candles${s.complete ? '' : ' (still forming)'}.`,
      lifecycleStatus: s.complete ? 'RESOLVED' : 'ACTIVE',
      strategyState: s.name,
      discriminator: `${s.name}:${s.dayKey}`,
    }, now))
  }

  // Regime: trend / range / breakout / transition, plus volatility.
  const rg = f?.regime
  const state = rg?.value?.state ?? null
  const regimeType: AnnotationType = state === 'ranging' ? 'range-regime' : state === 'trending-up' || state === 'trending-down' ? 'trend-regime' : 'trend-regime'
  out.push(makeAnnotation({
    ...base,
    annotationType: regimeType,
    layer: 'context',
    source: 'feature-engine',
    sourceFeature: 'regime',
    eventTime: a.time,
    knownAt: a.time,
    direction: rg?.value?.direction === 'up' ? 'bullish' : rg?.value?.direction === 'down' ? 'bearish' : null,
    confidence: rg?.value?.confidence ?? null,
    dataQuality: qualityOf(rg),
    rationale: rg?.value ? `${rg.value.state}: ${rg.value.reasons.join(' ')}` : `Regime unavailable: ${rg?.note ?? 'not enough history to classify.'}`,
    lifecycleStatus: rg?.value ? 'ACTIVE' : 'EXPIRED',
    strategyState: state,
  }, now))

  const vol = f?.volatility
  out.push(makeAnnotation({
    ...base,
    annotationType: 'volatility-regime',
    layer: 'context',
    source: 'feature-engine',
    sourceFeature: 'volatility',
    eventTime: a.time,
    knownAt: a.time,
    dataQuality: qualityOf(vol),
    rationale: vol?.value ? `Volatility ${vol.value.label}: this candle's ATR is ${vol.value.ratio.toFixed(2)}× the typical one.` : `Volatility unavailable: ${vol?.note ?? 'no reading.'}`,
    lifecycleStatus: vol?.value ? 'ACTIVE' : 'EXPIRED',
    strategyState: vol?.value?.label ?? null,
  }, now))

  // Order flow — from the streams only. Unavailable is reported, never estimated.
  const cvd = f?.flow?.cvd
  const trusted = f?.flow?.stream?.trusted === true
  out.push(makeAnnotation({
    ...base,
    annotationType: 'order-flow-state',
    layer: 'context',
    source: 'feature-engine',
    sourceFeature: 'flow.cvd',
    eventTime: a.time,
    knownAt: a.time,
    dataQuality: trusted ? qualityOf(cvd) : 'UNAVAILABLE',
    rationale: trusted && cvd?.value
      ? `Cumulative delta ${cvd.value.value >= 0 ? '+' : ''}${cvd.value.value.toFixed(3)} since the anchor over ${cvd.value.candles} candles${cvd.value.complete ? '' : ' (incomplete — a gap in the tape)'}.`
      : `Order flow is unavailable: ${cvd?.note ?? 'the trade stream is not trusted right now.'} It is never estimated from candles.`,
    lifecycleStatus: trusted && cvd?.value ? 'ACTIVE' : 'EXPIRED',
  }, now))

  // News markers — only the blackout windows the news module actually produced.
  for (const b of view.news?.blackouts ?? []) {
    out.push(makeAnnotation({
      ...base,
      annotationType: 'news-marker',
      layer: 'context',
      source: 'news',
      sourceFeature: 'blackout',
      eventTime: b.start,
      knownAt: b.start,
      startTime: b.start,
      endTime: b.end,
      dataQuality: 'REAL',
      rationale: `High-impact event: ${b.title}. The engine stands aside inside this window.`,
      lifecycleStatus: 'ACTIVE',
      discriminator: b.title,
    }, now))
  }
  return out
}

// ---------------------------------------------------------------
// The whole picture
// ---------------------------------------------------------------

/**
 * Every annotation the engine's current state supports, deduped and in a total,
 * deterministic order. The same EngineView always produces exactly this list.
 */
export function annotate(view: EngineView): ChartAnnotation[] {
  if (!view.analysis) return []
  return sortAnnotations(dedupeAnnotations([
    ...annotateStructure(view),
    ...annotateLiquidity(view),
    ...annotateImbalance(view),
    ...annotateOrderBlocks(view),
    ...annotateStrategies(view),
    ...annotateTradeMap(view),
    ...annotateContext(view),
  ]))
}
