/**
 * The canonical chart annotation (Phase 22B).
 *
 * ONE representation for every mark the intelligence layer can put on a chart,
 * whatever produced the underlying fact. This module is types + pure helpers
 * only: it holds no state, reads no engine, and decides nothing.
 *
 * Two rules govern every field:
 *
 *  1. NOTHING IS INVENTED. Every value comes from engine state that already
 *     exists. A value the engine does not supply is `null`, and `dataQuality`
 *     becomes 'UNAVAILABLE' with the reason in `rationale`. We never fill a gap
 *     with a plausible-looking number.
 *
 *  2. NOTHING IS KNOWN BEFORE IT HAPPENS. Every annotation carries `eventTime`
 *     (when the market did it) AND `knownAt` (the candle close at which the
 *     engine could first report it). Replay renders only `knownAt <= cursor`,
 *     which is what makes look-ahead leakage testable rather than hoped for.
 *
 * Ids are derived from content — never from a clock or a random — so the same
 * market input always produces the same annotations. That is the invariant the
 * determinism tests pin.
 */

/** Bump when the meaning of any annotation field changes. */
export const ANNOTATION_SCHEMA_VERSION = 1

/** The visual/logical band an annotation belongs to. The UI toggles these. */
export type AnnotationLayer =
  | 'structure'
  | 'liquidity'
  | 'imbalance'
  | 'orderblock'
  | 'ict'
  | 'trade'
  | 'context'

/** Every kind of mark. Each one must correspond to something the engine actually detects. */
export type AnnotationType =
  // structure
  | 'swing-high' | 'swing-low'
  | 'higher-high' | 'higher-low' | 'lower-high' | 'lower-low'
  | 'bos' | 'choch'
  | 'dealing-range'
  // liquidity
  | 'equal-highs' | 'equal-lows'
  | 'buyside-liquidity' | 'sellside-liquidity'
  | 'previous-day-high' | 'previous-day-low'
  | 'previous-week-high' | 'previous-week-low'
  | 'session-high' | 'session-low'
  | 'liquidity-sweep' | 'liquidity-raid' | 'failed-breakout'
  // imbalance
  | 'fvg-bullish' | 'fvg-bearish' | 'fvg-midpoint'
  | 'fvg-mitigation' | 'fvg-invalidation'
  // order blocks
  | 'order-block-bullish' | 'order-block-bearish'
  | 'breaker-block' | 'block-mitigation' | 'block-invalidation'
  // ict strategies
  | 'silver-bullet-window' | 'silver-bullet-setup'
  | 'unicorn-setup' | 'turtle-soup-setup'
  | 'strategy-setup'
  // trade map
  | 'entry' | 'stop-loss' | 'take-profit'
  | 'entry-zone' | 'stop-zone' | 'target-zone'
  | 'risk-reward' | 'invalidation-level'
  // market context
  | 'vwap' | 'session-boundary'
  | 'volatility-regime' | 'trend-regime' | 'range-regime'
  | 'news-marker' | 'order-flow-state'

/** Which engine module the underlying fact came from. Provenance, not decoration. */
export type AnnotationSource =
  | 'structure-tracker'
  | 'swing-tracker'
  | 'fvg-tracker'
  | 'order-block-tracker'
  | 'session-tracker'
  | 'liquidity'
  | 'feature-engine'
  | 'strategy'
  | 'fusion'
  | 'risk-engine'
  | 'paper-trader'
  | 'news'

/**
 * How much to trust the numbers behind this annotation. Propagated verbatim
 * from the existing `Feature` contract — we never upgrade a label.
 *   REAL        — from the live tape / actual candle data
 *   APPROXIMATE — computed from candles where the tape would have been exact
 *   UNAVAILABLE — could not be computed; the annotation exists to say so
 */
export type DataQuality = 'REAL' | 'APPROXIMATE' | 'UNAVAILABLE'

/**
 * Where the annotated object is in its life. Mapped from engine state; the
 * intelligence layer never decides a lifecycle on its own.
 */
export type Lifecycle =
  | 'ACTIVE'
  | 'MITIGATED'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'TRIGGERED'
  | 'RESOLVED'

export type AnnotationDirection = 'long' | 'short' | 'bullish' | 'bearish' | null

export type ChartAnnotation = {
  /** Deterministic, content-derived. Same market input → same id. */
  id: string
  schemaVersion: number
  engineVersion: string
  symbol: string
  timeframe: string
  annotationType: AnnotationType
  layer: AnnotationLayer
  source: AnnotationSource
  /** The specific feature/tracker key behind it, when there is one. */
  sourceFeature: string | null
  /** When this annotation object was built (not market time). */
  createdAt: number
  /** When the market event happened. */
  eventTime: number
  /** The moment the engine could FIRST know it. Replay filters on this. */
  knownAt: number
  startTime: number
  /** null = the object still extends to "now". */
  endTime: number | null
  price: number | null
  priceHigh: number | null
  priceLow: number | null
  direction: AnnotationDirection
  /** Strategies that reference this object, when any do. */
  strategyIds: string[]
  strategyState: string | null
  regime: string | null
  dataQuality: DataQuality
  /** 0–100 when the engine supplied one; null otherwise. Never guessed. */
  confidence: number | null
  /** Engine-derived. When the engine recorded none, this says exactly that. */
  rationale: string
  invalidationCondition: string | null
  lifecycleStatus: Lifecycle
  linkedSignalId: string | null
  linkedTradeId: string | null
  /** Set when produced inside a replay frame, so a frame is self-describing. */
  replayTimestamp: number | null
}

/** Said once, so every extractor spells "we don't know" the same way. */
export const NO_RATIONALE = 'No engine rationale was recorded for this object.'

// ---------------------------------------------------------------
// Deterministic ids
// ---------------------------------------------------------------

/**
 * A small, stable, non-cryptographic hash (FNV-1a, 32-bit). Used only to keep
 * ids short — it carries no security meaning. Deterministic across runs and
 * platforms, which is the whole point.
 */
export function stableHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).padStart(7, '0')
}

/**
 * The id of an annotation, from its content alone. No clock, no randomness, no
 * ordering dependence — replaying the same candles reproduces the same ids.
 * Prices are quantised to 6 decimals so float noise cannot fork an id.
 */
export function annotationId(parts: {
  layer: AnnotationLayer
  annotationType: AnnotationType
  timeframe: string
  eventTime: number
  price?: number | null
  priceHigh?: number | null
  priceLow?: number | null
  discriminator?: string
}): string {
  const q = (n: number | null | undefined): string => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(6) : '-')
  const key = [
    parts.layer,
    parts.annotationType,
    parts.timeframe,
    String(parts.eventTime),
    q(parts.price),
    q(parts.priceHigh),
    q(parts.priceLow),
    parts.discriminator ?? '',
  ].join('|')
  return `${parts.annotationType}.${stableHash(key)}`
}

// ---------------------------------------------------------------
// Construction
// ---------------------------------------------------------------

/**
 * The fields an extractor must supply; everything else has an honest default.
 * `discriminator` is an input-only hint that keeps two otherwise identical
 * annotations apart in the id (two gaps created on the same candle, say). It
 * never appears on the finished annotation.
 */
export type AnnotationInput = Omit<
  ChartAnnotation,
  'id' | 'schemaVersion' | 'createdAt' | 'startTime' | 'endTime' | 'price' | 'priceHigh' | 'priceLow'
  | 'direction' | 'strategyIds' | 'strategyState' | 'regime' | 'confidence' | 'invalidationCondition'
  | 'linkedSignalId' | 'linkedTradeId' | 'replayTimestamp' | 'sourceFeature'
> & Partial<ChartAnnotation> & { discriminator?: string }

/**
 * Build an annotation with honest defaults. Anything not supplied is null (not
 * zero, not ''), so a missing value is visibly missing downstream.
 */
export function makeAnnotation(input: AnnotationInput, now: number): ChartAnnotation {
  const eventTime = input.eventTime
  // Nothing can be known before it happened: knownAt is clamped forward, never back.
  const knownAt = Math.max(input.knownAt ?? eventTime, eventTime)
  const a: ChartAnnotation = {
    id: input.id ?? annotationId({
      layer: input.layer,
      annotationType: input.annotationType,
      timeframe: input.timeframe,
      eventTime,
      price: input.price ?? null,
      priceHigh: input.priceHigh ?? null,
      priceLow: input.priceLow ?? null,
      discriminator: input.discriminator,
    }),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    engineVersion: input.engineVersion,
    symbol: input.symbol,
    timeframe: input.timeframe,
    annotationType: input.annotationType,
    layer: input.layer,
    source: input.source,
    sourceFeature: input.sourceFeature ?? null,
    createdAt: now,
    eventTime,
    knownAt,
    startTime: input.startTime ?? eventTime,
    endTime: input.endTime ?? null,
    price: input.price ?? null,
    priceHigh: input.priceHigh ?? null,
    priceLow: input.priceLow ?? null,
    direction: input.direction ?? null,
    strategyIds: input.strategyIds ?? [],
    strategyState: input.strategyState ?? null,
    regime: input.regime ?? null,
    dataQuality: input.dataQuality,
    confidence: input.confidence ?? null,
    rationale: input.rationale || NO_RATIONALE,
    invalidationCondition: input.invalidationCondition ?? null,
    lifecycleStatus: input.lifecycleStatus,
    linkedSignalId: input.linkedSignalId ?? null,
    linkedTradeId: input.linkedTradeId ?? null,
    replayTimestamp: input.replayTimestamp ?? null,
  }
  return a
}

// ---------------------------------------------------------------
// Ordering and filtering
// ---------------------------------------------------------------

/**
 * A total, deterministic order: by event time, then by id. Two runs over the
 * same input therefore produce not just the same set but the same sequence.
 */
export function sortAnnotations(list: ChartAnnotation[]): ChartAnnotation[] {
  return list.slice().sort((a, b) => a.eventTime - b.eventTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Drop duplicates by id, keeping the first. Extractors can overlap safely. */
export function dedupeAnnotations(list: ChartAnnotation[]): ChartAnnotation[] {
  const seen = new Set<string>()
  const out: ChartAnnotation[] = []
  for (const a of list) { if (!seen.has(a.id)) { seen.add(a.id); out.push(a) } }
  return out
}

/**
 * Everything knowable at or before `cursor`. THE no-look-ahead filter: a replay
 * frame must never contain an annotation the engine could not yet have made.
 */
export function knowableAt(list: ChartAnnotation[], cursor: number): ChartAnnotation[] {
  return list.filter((a) => a.knownAt <= cursor)
}

/** Layer/type filters for the UI's toggles. Hides marks; never drops data. */
export function filterByLayer(list: ChartAnnotation[], layers: AnnotationLayer[]): ChartAnnotation[] {
  const on = new Set(layers)
  return list.filter((a) => on.has(a.layer))
}

/** True when every annotation respects the "nothing known before it happened" rule. */
export function noLookahead(list: ChartAnnotation[]): boolean {
  return list.every((a) => a.knownAt >= a.eventTime)
}

// ---------------------------------------------------------------
// Logical identity vs runtime identity
// ---------------------------------------------------------------

/**
 * `createdAt` records when the annotation OBJECT was built, so it moves with the
 * wall clock even when the market input is identical. That is runtime identity,
 * and it must never be mistaken for logical identity.
 *
 * LOGICAL identity is everything the annotation asserts about the market. Two
 * runs over the same candles, the same config and the same engine version are
 * required to agree on all of it — which is what replay comparison and snapshot
 * tests actually care about. Comparing raw objects instead would make every
 * snapshot spuriously fail one millisecond later.
 */
export type LogicalAnnotation = Omit<ChartAnnotation, 'createdAt'>

export function logicalAnnotation(a: ChartAnnotation): LogicalAnnotation {
  const { createdAt: _runtimeOnly, ...logical } = a
  return logical
}

/**
 * A stable digest of a whole annotation set's logical content — the thing to
 * compare in a snapshot test. Order is normalised first, so two runs that emit
 * the same annotations in a different order still agree.
 */
export function logicalDigest(list: ChartAnnotation[]): string {
  return JSON.stringify(sortAnnotations(list).map(logicalAnnotation))
}

/** True when two annotation sets are logically identical, ignoring build time. */
export function sameLogically(a: ChartAnnotation[], b: ChartAnnotation[]): boolean {
  return logicalDigest(a) === logicalDigest(b)
}
