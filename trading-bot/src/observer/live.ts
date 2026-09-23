/**
 * THE LIVE SCHOOL — "Mr. Cash is observing…" and, later, "RESULT REVEALED".
 *
 * The live view explains a selected event using only what was knowable at
 * its candle close: the BEFORE summary the observer stored (structure,
 * liquidity, regime, session, strategies active, risk) and the engine's own
 * event detail. The outcome is not in the live payload because it does not
 * exist yet; once the candidate is resolved into a case study, the reveal
 * quotes the case's AFTER frame from the vault.
 *
 * Replay conversion: any resolved event becomes a replay lesson with one stop
 * at that event, built by the replay school over the stored candles around it
 * — the stop ends before the outcome, as every replay stop does.
 */

import { config } from '../../config.ts'
import { getItem } from '../knowledge/vault.ts'
import { INTERVAL_MS } from '../market.ts'
import type { CaseStudy } from '../school/caseStudies.ts'
import { buildReplayLesson } from '../school/replaySchool.ts'
import type { ReplayBundle } from '../school/replaySchool.ts'
import { store } from '../store.ts'
import type { Candle } from '../types.ts'
import { listObservations, observationCounts } from './events.ts'
import type { Observation } from './events.ts'
import { HORIZON } from './observer.ts'

export type LiveObservation = {
  id: string
  type: Observation['type']
  at: number
  availableAt: number
  detail: string
  significance: Observation['significance']
  before: Observation['before']
  /** What the horizon is and when the reveal can happen. */
  revealAfter: number
  status: 'OBSERVING' | 'REVEALED' | 'UNRESOLVABLE' | 'RECORDED'
  caseId: string | null
  /** Present only after the reveal: the case's AFTER note. Never in an OBSERVING entry. */
  result: string | null
}

function toLive(o: Observation, stepMs: number): LiveObservation {
  const status: LiveObservation['status'] = o.status === 'CANDIDATE' ? 'OBSERVING' : o.status === 'RESOLVED' ? 'REVEALED' : o.status === 'UNRESOLVABLE' ? 'UNRESOLVABLE' : 'RECORDED'
  let result: string | null = null
  if (status === 'REVEALED' && o.caseId) {
    const item = getItem(o.caseId)
    const c = item?.payload as CaseStudy | undefined
    result = c ? c.after.note : o.resolutionNote
  }
  return { id: o.id, type: o.type, at: o.time, availableAt: o.availableAt, detail: o.detail, significance: o.significance, before: o.before, revealAfter: o.availableAt + (HORIZON + 1) * stepMs, status, caseId: o.caseId, result }
}

export type LiveView = {
  at: number
  observing: LiveObservation[]
  revealed: LiveObservation[]
  recent: LiveObservation[]
  counts: ReturnType<typeof observationCounts>
  horizon: { candles: number; interval: string }
  notes: string[]
}

export function liveView(now = Date.now(), opts: { recent?: number } = {}): LiveView {
  const stepMs = INTERVAL_MS[config.interval] ?? 300_000
  const observing = listObservations({ status: 'CANDIDATE', limit: 50 }).map((o) => toLive(o, stepMs))
  const revealed = listObservations({ status: 'RESOLVED', limit: 20 }).map((o) => toLive(o, stepMs))
  const recent = listObservations({ limit: opts.recent ?? 40 }).map((o) => toLive(o, stepMs))
  return {
    at: now, observing, revealed, recent, counts: observationCounts(), horizon: { candles: HORIZON, interval: config.interval },
    notes: [
      observing.length ? `Mr. Cash is observing ${observing.length} event(s). Each is explained with what was knowable at its close; the result is revealed only after ${HORIZON} more candles are stored.` : 'Nothing is being observed right now. Selected events appear here as the engine finds them.',
      'Selection means an event is worth studying, not a forecast. The engine remains the only source of decisions.',
    ],
  }
}

/** The REPLAY of a completed event: one stop, at that event, over the stored candles around it. Stops before the outcome. */
export function replayForObservation(id: string, opts: { candlesBetween?: (symbol: string, interval: string, from: number, to: number) => Candle[] } = {}): { bundle: ReplayBundle; observation: Observation } | null {
  const o = store().getObservation<Observation>(id)
  if (!o || o.status !== 'RESOLVED' || !o.caseId) return null
  const stepMs = INTERVAL_MS[config.interval] ?? 300_000
  const read = opts.candlesBetween ?? ((s, i, from, to) => store().candlesBetween(s, i, from, to))
  const candles = read(o.symbol, o.timeframe, o.availableAt - 2 * 86_400_000, o.availableAt + (HORIZON + 1) * stepMs)
  if (candles.length < 10) return null
  const bundle = buildReplayLesson(candles, { maxStops: 1, votesTail: 60, horizon: HORIZON, onlyAt: o.availableAt, kinds: o.caseKind ? [o.caseKind as CaseStudy['kind']] : undefined })
  return bundle.lesson.stops.length ? { bundle, observation: o } : null
}
