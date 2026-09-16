/**
 * "What changed?" (Phase 22L).
 *
 * Diffs two annotation frames and reports what is genuinely new, what changed
 * lifecycle, and what went away. Because annotation ids are content-derived and
 * deterministic, this diff is exact: an id appearing is a real new object, not a
 * re-render, and a lifecycle moving from ACTIVE to MITIGATED is a real event.
 *
 * Nothing is inferred beyond the diff. If the engine's state did not change,
 * this reports no change rather than manufacturing activity.
 */

import type { ChartAnnotation, Lifecycle, AnnotationType } from './types.ts'

export type ChangeKind = 'appeared' | 'lifecycle' | 'disappeared'

export type AnnotationChange = {
  kind: ChangeKind
  id: string
  annotationType: AnnotationType
  layer: ChartAnnotation['layer']
  timeframe: string
  at: number
  from: Lifecycle | null
  to: Lifecycle | null
  /** A plain sentence, built from the annotation's own rationale. */
  summary: string
  dataQuality: ChartAnnotation['dataQuality']
  strategyIds: string[]
}

export type FrameDelta = {
  fromTime: number | null
  toTime: number
  changes: AnnotationChange[]
  counts: { appeared: number; lifecycle: number; disappeared: number }
  note: string
}

const byId = (list: ChartAnnotation[]): Map<string, ChartAnnotation> => new Map(list.map((a) => [a.id, a]))

/**
 * What changed between two frames. `previous` may be null for the first frame,
 * in which case nothing is reported as "appeared" — a first frame is a baseline,
 * not a burst of events.
 */
export function diffFrames(previous: ChartAnnotation[] | null, current: ChartAnnotation[], toTime: number, fromTime: number | null = null): FrameDelta {
  const changes: AnnotationChange[] = []
  if (previous === null) {
    return { fromTime, toTime, changes, counts: { appeared: 0, lifecycle: 0, disappeared: 0 }, note: 'First frame — a baseline, so nothing is reported as changed.' }
  }
  const prev = byId(previous)
  const cur = byId(current)

  for (const [id, a] of cur) {
    const before = prev.get(id)
    if (!before) {
      changes.push({
        kind: 'appeared', id, annotationType: a.annotationType, layer: a.layer, timeframe: a.timeframe,
        at: a.knownAt, from: null, to: a.lifecycleStatus, summary: a.rationale,
        dataQuality: a.dataQuality, strategyIds: a.strategyIds,
      })
    } else if (before.lifecycleStatus !== a.lifecycleStatus) {
      changes.push({
        kind: 'lifecycle', id, annotationType: a.annotationType, layer: a.layer, timeframe: a.timeframe,
        at: a.knownAt, from: before.lifecycleStatus, to: a.lifecycleStatus,
        summary: `${a.annotationType} moved from ${before.lifecycleStatus} to ${a.lifecycleStatus}. ${a.rationale}`,
        dataQuality: a.dataQuality, strategyIds: a.strategyIds,
      })
    }
  }
  for (const [id, a] of prev) {
    if (!cur.has(id)) {
      changes.push({
        kind: 'disappeared', id, annotationType: a.annotationType, layer: a.layer, timeframe: a.timeframe,
        at: toTime, from: a.lifecycleStatus, to: null,
        summary: `${a.annotationType} is no longer reported by the engine (expired from the window, or the object aged out).`,
        dataQuality: a.dataQuality, strategyIds: a.strategyIds,
      })
    }
  }

  changes.sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  const counts = {
    appeared: changes.filter((c) => c.kind === 'appeared').length,
    lifecycle: changes.filter((c) => c.kind === 'lifecycle').length,
    disappeared: changes.filter((c) => c.kind === 'disappeared').length,
  }
  return {
    fromTime, toTime, changes, counts,
    note: changes.length
      ? `${counts.appeared} new, ${counts.lifecycle} changed state, ${counts.disappeared} retired.`
      : 'Nothing changed between these two frames.',
  }
}

/** A compact human list for the "what changed since the last candle?" panel. */
export function describeDelta(d: FrameDelta, limit = 20): string[] {
  if (!d.changes.length) return ['No change since the last candle.']
  return d.changes.slice(0, limit).map((c) => {
    const when = new Date(c.at).toISOString().slice(11, 16)
    if (c.kind === 'appeared') return `${when} · NEW ${c.annotationType} (${c.timeframe}) — ${c.summary}`
    if (c.kind === 'lifecycle') return `${when} · ${c.annotationType} ${c.from} → ${c.to}`
    return `${when} · retired ${c.annotationType} (${c.timeframe})`
  })
}
