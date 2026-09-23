/**
 * Replay intelligence (Phase 22H) — annotation frames over time, with a
 * look-ahead guarantee that is enforced, not hoped for.
 *
 * THE GUARANTEE, in two independent layers:
 *
 *  1. BY CONSTRUCTION. Frames are produced by stepping the engine forward one
 *     candle at a time (`IctEngine.step(i)` has consumed only candles 0..i) and
 *     annotating the analysis it returns. A frame therefore physically cannot
 *     contain information from a later candle: the engine never saw it.
 *
 *  2. BY CONTRACT. Every annotation carries `knownAt`. Each frame is filtered to
 *     `knownAt <= frameTime` before it is emitted, and `auditFrames()` re-checks
 *     the whole sequence afterwards. The tests assert both that no frame
 *     contains a late annotation and that no annotation claims to be known
 *     before it happened.
 *
 * Both layers are cheap, and keeping them independent means a bug in one is
 * caught by the other.
 */

import type { Candle } from '../types.ts'
import { annotate } from './annotate.ts'
import type { EngineView } from './annotate.ts'
import { knowableAt, sortAnnotations } from './types.ts'
import type { ChartAnnotation } from './types.ts'
import { timelineFromAnnotations } from './timeline.ts'
import type { TimelineEvent } from './timeline.ts'
import { diffFrames } from './delta.ts'
import type { FrameDelta } from './delta.ts'

export type ReplayFrame = {
  index: number
  /** The candle close this frame describes — the replay cursor for this step. */
  time: number
  candle: Candle
  annotations: ChartAnnotation[]
  events: TimelineEvent[]
  /** What changed versus the previous frame. */
  delta: FrameDelta
}

export type ReplayIntel = {
  symbol: string
  timeframe: string
  from: number
  to: number
  frames: ReplayFrame[]
  note: string
}

/**
 * Build annotation frames from a sequence of already-computed engine views, one
 * per candle. The caller steps the engine (that is the engine's job, not ours)
 * and hands us the analysis it produced for each candle, in order.
 *
 * Each frame is filtered to what was knowable at that candle's close, so a frame
 * is safe to render exactly as given.
 */
export function buildReplayFrames(input: {
  symbol: string
  timeframe: string
  engineVersion: string
  /** One entry per candle, in chronological order, as the engine produced them. */
  steps: Array<{ candle: Candle; view: Omit<EngineView, 'symbol' | 'timeframe' | 'engineVersion'> }>
  now?: number
}): ReplayIntel {
  const now = input.now ?? Date.now()
  const frames: ReplayFrame[] = []
  let previous: ChartAnnotation[] | null = null

  for (let i = 0; i < input.steps.length; i++) {
    const { candle, view } = input.steps[i]
    const cursor = candle.closeTime
    const full = annotate({ ...view, symbol: input.symbol, timeframe: input.timeframe, engineVersion: input.engineVersion, now })
    // Layer 2 of the guarantee: never emit anything knowable only later.
    const annotations = sortAnnotations(knowableAt(full, cursor)).map((a) => ({ ...a, replayTimestamp: cursor }))
    const events = timelineFromAnnotations(annotations)
    const delta = diffFrames(previous, annotations, cursor, frames[frames.length - 1]?.time ?? null)
    frames.push({ index: i, time: cursor, candle, annotations, events, delta })
    previous = annotations
  }

  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    from: frames[0]?.time ?? 0,
    to: frames[frames.length - 1]?.time ?? 0,
    frames,
    note: 'Each frame contains only what the engine could know at that candle close. Nothing here trades.',
  }
}

// ---------------------------------------------------------------
// The audit — what the look-ahead tests call
// ---------------------------------------------------------------

export type LeakageFinding = {
  frameIndex: number
  frameTime: number
  annotationId: string
  annotationType: string
  knownAt: number
  eventTime: number
  problem: 'known-after-frame' | 'known-before-event' | 'appeared-too-early'
  detail: string
}

/**
 * Audit a whole replay for look-ahead leakage. Three independent checks:
 *
 *  A. `known-after-frame`  — a frame contains an annotation whose `knownAt` is
 *     later than the frame's own cursor. (The filter should make this
 *     impossible; the check exists so a regression is caught, not assumed away.)
 *  B. `known-before-event` — an annotation claims it was knowable BEFORE the
 *     market event happened. Physically impossible; a sign of a bad `knownAt`.
 *  C. `appeared-too-early` — an annotation id first appears in a frame whose
 *     cursor is earlier than that annotation's own `knownAt`.
 *
 * Returns every finding; an empty array is the pass condition.
 */
export function auditFrames(intel: ReplayIntel): LeakageFinding[] {
  const findings: LeakageFinding[] = []
  const firstSeen = new Map<string, { frameIndex: number; frameTime: number }>()

  for (const f of intel.frames) {
    for (const a of f.annotations) {
      if (a.knownAt > f.time) {
        findings.push({
          frameIndex: f.index, frameTime: f.time, annotationId: a.id, annotationType: a.annotationType,
          knownAt: a.knownAt, eventTime: a.eventTime, problem: 'known-after-frame',
          detail: `Frame at ${new Date(f.time).toISOString()} contains an annotation only knowable at ${new Date(a.knownAt).toISOString()}.`,
        })
      }
      if (a.knownAt < a.eventTime) {
        findings.push({
          frameIndex: f.index, frameTime: f.time, annotationId: a.id, annotationType: a.annotationType,
          knownAt: a.knownAt, eventTime: a.eventTime, problem: 'known-before-event',
          detail: `Annotation claims to be knowable at ${new Date(a.knownAt).toISOString()}, before the event at ${new Date(a.eventTime).toISOString()}.`,
        })
      }
      if (!firstSeen.has(a.id)) {
        firstSeen.set(a.id, { frameIndex: f.index, frameTime: f.time })
        if (f.time < a.knownAt) {
          findings.push({
            frameIndex: f.index, frameTime: f.time, annotationId: a.id, annotationType: a.annotationType,
            knownAt: a.knownAt, eventTime: a.eventTime, problem: 'appeared-too-early',
            detail: `First appeared in the frame at ${new Date(f.time).toISOString()}, earlier than its knownAt.`,
          })
        }
      }
    }
  }
  return findings
}

/** True when a replay is free of look-ahead leakage. */
export function isLeakFree(intel: ReplayIntel): boolean {
  return auditFrames(intel).length === 0
}

// ---------------------------------------------------------------
// Player helpers
// ---------------------------------------------------------------

/** The frame at or before a cursor time — what PLAY/PAUSE/SCRUB render. */
export function frameAt(intel: ReplayIntel, cursor: number): ReplayFrame | null {
  let found: ReplayFrame | null = null
  for (const f of intel.frames) { if (f.time <= cursor) found = f; else break }
  return found
}

/** Frame indices that carry at least one event — what JUMP TO EVENT steps through. */
export function eventFrameIndices(intel: ReplayIntel): number[] {
  return intel.frames.filter((f) => f.delta.changes.length > 0).map((f) => f.index)
}

/** Step to the next/previous frame that has something in it. */
export function jumpToEvent(intel: ReplayIntel, fromIndex: number, direction: 1 | -1): number | null {
  const idx = eventFrameIndices(intel)
  if (!idx.length) return null
  if (direction === 1) return idx.find((i) => i > fromIndex) ?? null
  const before = idx.filter((i) => i < fromIndex)
  return before.length ? before[before.length - 1] : null
}
