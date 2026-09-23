/**
 * OBSERVATIONS — the market observer's record.
 *
 * An observation is a meaningful event the engine could see on a closed
 * candle, or a paper event the paper trader recorded. It carries exactly
 * what the specification asks for: timestamp, symbol, timeframe, session,
 * regime, engine version, feature version, event type, source, evidence and
 * the AVAILABLE-AT timestamp — the candle close at which the engine could
 * first know it. Nothing is manufactured: every field is read from an engine
 * output or a stored record, and the evidence names which.
 *
 * Ids are deterministic from content, so a restart, a re-run or a second code
 * path recording the same event produces one row. Storage is the store's
 * `observations` table (Phase 24), never a second store.
 */

import { config } from '../../config.ts'
import { FEATURE_VERSION } from '../features/types.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'

export type ObservationType =
  | 'STRUCTURE CHANGE' | 'LIQUIDITY EVENT' | 'FVG CREATED' | 'FVG RETEST' | 'ORDER BLOCK EVENT' | 'BREAKER EVENT'
  | 'UNICORN EVENT' | 'SILVER BULLET WINDOW' | 'TURTLE SOUP EVENT'
  | 'REGIME CHANGE' | 'VOLATILITY CHANGE' | 'SESSION CHANGE' | 'NEWS EVENT' | 'ORDER FLOW EVENT'
  | 'STRATEGY ACTIVATION' | 'STRATEGY REJECTION' | 'RISK VETO'
  | 'PAPER ENTRY' | 'PAPER EXIT' | 'UNUSUAL MAE' | 'UNUSUAL MFE' | 'ANOMALY'

export type ObservationSource = 'engine-step' | 'strategy-votes' | 'fusion' | 'paper-trader' | 'news' | 'order-flow' | 'features'

/** What the significance engine concluded about the event, and why. */
export type Significance = {
  score: number
  selected: boolean
  reasons: string[]
  /** The measurable properties the score rests on, each named. */
  basis: Record<string, number | string | null>
  note: string
}

export type ObservationStatus = 'RECORDED' | 'CANDIDATE' | 'RESOLVED' | 'UNRESOLVABLE'

export type Observation = {
  id: string
  time: number
  /** The candle close at which the engine could first know the event. Never earlier than `time`. */
  availableAt: number
  symbol: string
  timeframe: string
  session: string | null
  regime: string | null
  volatility: string | null
  engineVersion: string
  featureVersion: number
  type: ObservationType
  source: ObservationSource
  /** The engine's own statement of what happened. */
  detail: string
  direction: string | null
  /** Named evidence: the field or record each fact came from. */
  evidence: Array<{ field: string; value: string | number | boolean | null }>
  /** The case-study kind the event maps to, when one exists. */
  caseKind: string | null
  /** A paper record id when the event is about one. */
  recordId: string | null
  significance: Significance
  status: ObservationStatus
  /** Set when a candidate is resolved: the case-study id in the vault, and when. */
  caseId: string | null
  resolvedAt: number | null
  resolutionNote: string | null
  /** What was knowable at the event: a small BEFORE summary for the live school (never the outcome). */
  before: { structureTrend: string | null; liquidity: string | null; regime: string | null; session: string | null; strategiesActive: number; strategiesNear: number; risk: string | null; price: number | null }
}

export function observationId(o: Pick<Observation, 'type' | 'symbol' | 'timeframe' | 'availableAt'> & { refId?: string | null }): string {
  let h = 2166136261
  for (const ch of `${o.type}|${o.symbol}|${o.timeframe}|${o.availableAt}|${o.refId ?? ''}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return `obs-${o.type.toLowerCase().replace(/\s+/g, '-')}-${h.toString(36)}`
}

export type NewObservation = Omit<Observation, 'id' | 'engineVersion' | 'featureVersion' | 'symbol' | 'timeframe' | 'status' | 'caseId' | 'resolvedAt' | 'resolutionNote'> & { refId?: string | null; symbol?: string; timeframe?: string }

export function makeObservation(n: NewObservation): Observation {
  const symbol = n.symbol ?? config.symbol
  const timeframe = n.timeframe ?? config.interval
  const availableAt = Math.max(n.availableAt, n.time)
  const base = { type: n.type, symbol, timeframe, availableAt, refId: n.refId ?? n.recordId ?? null }
  return {
    id: observationId(base), time: n.time, availableAt, symbol, timeframe,
    session: n.session, regime: n.regime, volatility: n.volatility,
    engineVersion: VERSION, featureVersion: FEATURE_VERSION,
    type: n.type, source: n.source, detail: n.detail, direction: n.direction, evidence: n.evidence,
    caseKind: n.caseKind, recordId: n.recordId, significance: n.significance,
    status: n.significance.selected && n.caseKind ? 'CANDIDATE' : 'RECORDED',
    caseId: null, resolvedAt: null, resolutionNote: null, before: n.before,
  }
}

// ---------------------------------------------------------------
// Store wrappers
// ---------------------------------------------------------------

const rowOf = (o: Observation) => ({ id: o.id, time: o.time, kind: o.type, significance: o.significance.score, status: o.status })

/** Record an observation. Returns the stored row and whether it was new. */
export function recordObservation(o: Observation): { observation: Observation; isNew: boolean } {
  const prior = store().getObservation<Observation>(o.id)
  if (prior) return { observation: prior, isNew: false } // the same event recorded twice is one record; the first stays
  const isNew = store().upsertObservation(rowOf(o), o)
  return { observation: o, isNew }
}

export function getObservation(id: string): Observation | null { return store().getObservation<Observation>(id) }

export function listObservations(q: { from?: number; to?: number; type?: ObservationType; status?: ObservationStatus; minSignificance?: number; limit?: number } = {}): Observation[] {
  return store().observations<Observation>({ from: q.from, to: q.to, kind: q.type, status: q.status, minSignificance: q.minSignificance, limit: q.limit })
}

export function updateObservation(o: Observation): Observation {
  store().upsertObservation(rowOf(o), o)
  return o
}

export function observationCounts(): { total: number; candidates: number; resolved: number; unresolvable: number } {
  return { total: store().observationCount(), candidates: store().observationCount('CANDIDATE'), resolved: store().observationCount('RESOLVED'), unresolvable: store().observationCount('UNRESOLVABLE') }
}
