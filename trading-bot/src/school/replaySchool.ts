/**
 * REPLAY SCHOOL — learn by being asked before being told.
 *
 * A replay lesson is a sequence of STOPS on stored candles. At each stop the
 * reader sees exactly what the engine could see at that candle's close (the
 * BEFORE frame: annotations filtered by `knowableAt`), is asked a question,
 * and only after answering is shown what the engine detected, what the
 * strategies voted, and what happened next.
 *
 * The no-hindsight rule is structural, not a UI convention: `stopView` does
 * not include the answer, the decision or the AFTER frame in its return value
 * at all; only `revealStop`, called with a committed answer, does. There is
 * nothing for a browser to hide.
 *
 * The engine is stepped once per lesson (`stepEngine`); this module reads the
 * steps. It creates no trades and changes nothing.
 */

import { config } from '../../config.ts'
import { buildReplayFrames } from '../intel/replay.ts'
import type { ReplayFrame, ReplayIntel } from '../intel/replay.ts'
import type { Candle } from '../types.ts'
import { VERSION } from '../version.ts'
import { CONCEPT_OF, casesFromSteps, hindsightFindings, stepEngine } from './caseStudies.ts'
import type { CaseKind, CaseStudy, Step } from './caseStudies.ts'

export type StopQuestion =
  | { type: 'what-happened'; prompt: string; choices: CaseKind[] }
  | { type: 'what-did-the-engine-do'; prompt: string; choices: Array<'LONG' | 'SHORT' | 'WATCH' | 'NO TRADE'> }

export type ReplayStop = {
  index: number
  /** The frame index of the event candle. */
  frame: number
  /** The replay cursor for BEFORE: the previous candle's close. */
  cursor: number
  caseId: string
  kind: CaseKind
  concept: string
  question: StopQuestion
}

export type ReplayLesson = {
  id: string
  symbol: string
  timeframe: string
  engineVersion: string
  from: number
  to: number
  frames: number
  stops: ReplayStop[]
  note: string
}

export type ReplayBundle = { lesson: ReplayLesson; intel: ReplayIntel; cases: Map<string, CaseStudy>; steps: Step[] }

const ALL_KINDS: CaseKind[] = ['liquidity-sweep', 'bos', 'choch', 'fvg-created', 'fvg-retest', 'fvg-inverted', 'order-block-interaction', 'breaker-formation', 'large-displacement', 'regime-transition', 'session-transition', 'volatility-expansion']

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

function questionFor(c: CaseStudy, rng: () => number): StopQuestion {
  const setup = c.kind.endsWith('-setup') || c.kind === 'strategy-rejection'
  if (setup && c.decision.fused) {
    return { type: 'what-did-the-engine-do', prompt: 'The strategies have just voted on this candle. What did the fused decision come to?', choices: ['LONG', 'SHORT', 'WATCH', 'NO TRADE'] }
  }
  const pool = ALL_KINDS.filter((k) => k !== c.kind)
  const distractors: CaseKind[] = []
  while (distractors.length < 3 && pool.length) distractors.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
  const choices = [c.kind, ...distractors]
  for (let i = choices.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]] }
  return { type: 'what-happened', prompt: 'Look at the chart as of the previous close. The next candle closes — what does the engine detect on it?', choices }
}

export type ReplayLessonOptions = { maxStops?: number; kinds?: CaseKind[]; votesTail?: number; horizon?: number; seed?: number }

export function buildReplayLesson(candles: Candle[], opts: ReplayLessonOptions = {}): ReplayBundle {
  const steps = stepEngine(candles, opts.votesTail ?? 300)
  const intel = buildReplayFrames({
    symbol: config.symbol, timeframe: config.interval, engineVersion: VERSION,
    steps: steps.map((s) => ({ candle: s.candle, view: { analysis: s.analysis, candles: candles.slice(0, s.index + 1), votes: s.votes, decision: s.decision ?? null, now: s.candle.closeTime } })),
  })
  const all = casesFromSteps(steps, candles, { horizon: opts.horizon, kinds: opts.kinds })
  // Only cases with a measured AFTER, spread across the window: oldest first, one per event candle.
  const usable = all.filter((c) => c.evidenceLevel === 'OBSERVED').sort((a, b) => a.at - b.at)
  const seen = new Set<number>()
  const picked: CaseStudy[] = []
  for (const c of usable) { if (!seen.has(c.at)) { seen.add(c.at); picked.push(c) } }
  const maxStops = opts.maxStops ?? 8
  const stride = Math.max(1, Math.floor(picked.length / maxStops))
  const chosen = picked.filter((_, i) => i % stride === 0).slice(0, maxStops)
  const rng = seeded(opts.seed ?? 7)
  const cases = new Map<string, CaseStudy>()
  const stops: ReplayStop[] = chosen.map((c, i) => {
    cases.set(c.id, c)
    const frame = steps.findIndex((s) => s.candle.closeTime === c.at)
    return { index: i, frame, cursor: c.before.asOf, caseId: c.id, kind: c.kind, concept: CONCEPT_OF[c.kind], question: questionFor(c, rng) }
  })
  const lesson: ReplayLesson = {
    id: `replay-${candles[0]?.openTime ?? 0}-${candles[candles.length - 1]?.closeTime ?? 0}-${stops.length}`,
    symbol: config.symbol, timeframe: config.interval, engineVersion: VERSION,
    from: intel.from, to: intel.to, frames: intel.frames.length, stops,
    note: stops.length ? 'Each stop shows the chart as of the previous close and asks before it tells. The answer, the decision and the outcome are not in the payload until you answer.' : 'NOT ENOUGH DATA — no event in this window has a measured outcome, so there is nothing to ask about yet.',
  }
  return { lesson, intel, cases, steps }
}

export type StopBefore = {
  stop: ReplayStop
  cursor: number
  frame: Pick<ReplayFrame, 'index' | 'time' | 'candle' | 'annotations' | 'events'>
  context: CaseStudy['before']
  /** The candles up to and including the cursor — what a chart may draw. */
  candlesUpTo: number
}

export type StopReveal = StopBefore & {
  answer: { correct: string; explanation: string }
  during: CaseStudy['during']
  decision: CaseStudy['decision']
  after: CaseStudy['after']
  eventFrame: Pick<ReplayFrame, 'index' | 'time' | 'candle' | 'annotations' | 'events'>
  hindsight: string[]
}

function frameView(f: ReplayFrame): StopBefore['frame'] {
  return { index: f.index, time: f.time, candle: f.candle, annotations: f.annotations, events: f.events }
}

/** The stop as the reader first sees it. Contains nothing from the event candle onward. */
export function stopView(bundle: ReplayBundle, k: number): StopBefore | null {
  const stop = bundle.lesson.stops[k]
  if (!stop) return null
  const c = bundle.cases.get(stop.caseId)!
  const beforeFrame = bundle.intel.frames[stop.frame - 1]
  if (!beforeFrame) return null
  return { stop, cursor: stop.cursor, frame: frameView(beforeFrame), context: c.before, candlesUpTo: stop.frame }
}

export function correctChoice(c: CaseStudy, q: StopQuestion): string {
  if (q.type === 'what-happened') return c.kind
  const a = c.decision.fused?.action ?? 'NO TRADE'
  return a === 'LONG' || a === 'SHORT' ? a : a === 'NO TRADE' ? 'NO TRADE' : 'WATCH'
}

/** The reveal: only after an answer is committed. Includes the no-hindsight audit of the case it reveals. */
export function revealStop(bundle: ReplayBundle, k: number, chosen: string): (StopReveal & { chosen: string; correct: boolean }) | null {
  const before = stopView(bundle, k)
  if (!before) return null
  const c = bundle.cases.get(before.stop.caseId)!
  const right = correctChoice(c, before.stop.question)
  const eventFrame = bundle.intel.frames[before.stop.frame]
  const explanation = before.stop.question.type === 'what-happened'
    ? `The engine recorded ${c.kind.replace(/-/g, ' ')}: ${c.during.detail}`
    : `${c.decision.note} ${c.decision.votes ? c.decision.votes.filter((v) => v.action !== 'HOLD').map((v) => `${v.id} voted ${v.action} (${v.confidence}/100)`).join('; ') || 'No strategy voted to act.' : ''}`
  return {
    ...before, chosen, correct: chosen === right,
    answer: { correct: right, explanation },
    during: c.during, decision: c.decision, after: c.after, eventFrame: frameView(eventFrame),
    hindsight: hindsightFindings(c),
  }
}
