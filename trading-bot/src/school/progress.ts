/**
 * MY LEARNING — what the user has engaged with, per concept.
 *
 * "Mastery" here is ENGAGEMENT: lessons opened, quizzes taken and how they
 * went, cases and counterexamples reviewed, replay stops answered. It is
 * stated on every summary that this is not trading skill, is not read by the
 * engine, and changes nothing about how the bot trades. The whole point of
 * the school is to make the reader a better critic of the bot; the score is
 * a bookmark, not a badge.
 *
 * Storage: one append-only event list under `learning:events`, capped.
 */

import { store } from '../store.ts'
import { conceptById, conceptIds } from './curriculum.ts'

export type EngagementKind = 'lesson-viewed' | 'quiz-taken' | 'case-reviewed' | 'counterexample-reviewed' | 'replay-stop-answered'

export type Engagement = {
  at: number
  kind: EngagementKind
  conceptId: string
  /** Quiz: correct/total. Replay: correct (1/0) of 1. Case: the case id. */
  detail?: { correct?: number; total?: number; caseId?: string; stopIndex?: number }
}

export type MasteryLevel = 'UNSEEN' | 'INTRODUCED' | 'PRACTISING' | 'FAMILIAR'

export type ConceptMastery = {
  conceptId: string
  title: string
  lessonsViewed: number
  quizzesTaken: number
  quizBest: number | null
  quizLast: number | null
  casesReviewed: number
  counterexamplesReviewed: number
  replayAnswered: number
  replayCorrect: number
  level: MasteryLevel
  lastAt: number | null
  note: string
}

export const MASTERY_NOTE = 'Engagement only — not trading skill, not read by the engine.'
const KEY = 'learning:events'
const CAP = 5000

export function readEngagements(): Engagement[] {
  return store().getJson<Engagement[]>(KEY) ?? []
}

export function recordEngagement(e: Omit<Engagement, 'at'> & { at?: number }): Engagement {
  if (!conceptById(e.conceptId)) throw new Error(`unknown concept ${e.conceptId}`)
  const ev: Engagement = { at: e.at ?? Date.now(), kind: e.kind, conceptId: e.conceptId, detail: e.detail }
  const list = readEngagements()
  list.push(ev)
  store().setJson(KEY, list.length > CAP ? list.slice(list.length - CAP) : list)
  return ev
}

/** Pure: the mastery of one concept from a list of engagements. */
export function masteryFrom(conceptId: string, events: Engagement[]): ConceptMastery {
  const c = conceptById(conceptId)
  const mine = events.filter((e) => e.conceptId === conceptId)
  const quizzes = mine.filter((e) => e.kind === 'quiz-taken' && e.detail && typeof e.detail.correct === 'number' && typeof e.detail.total === 'number' && e.detail.total > 0)
  const scores = quizzes.map((e) => (e.detail!.correct as number) / (e.detail!.total as number))
  const replays = mine.filter((e) => e.kind === 'replay-stop-answered')
  const replayCorrect = replays.filter((e) => e.detail?.correct === 1).length
  const m: ConceptMastery = {
    conceptId, title: c?.title ?? conceptId,
    lessonsViewed: mine.filter((e) => e.kind === 'lesson-viewed').length,
    quizzesTaken: quizzes.length,
    quizBest: scores.length ? Math.max(...scores) : null,
    quizLast: scores.length ? scores[scores.length - 1] : null,
    casesReviewed: mine.filter((e) => e.kind === 'case-reviewed').length,
    counterexamplesReviewed: mine.filter((e) => e.kind === 'counterexample-reviewed').length,
    replayAnswered: replays.length, replayCorrect,
    level: 'UNSEEN', lastAt: mine.length ? Math.max(...mine.map((e) => e.at)) : null, note: MASTERY_NOTE,
  }
  const practised = m.quizzesTaken + m.replayAnswered
  const reviewed = m.casesReviewed + m.counterexamplesReviewed
  if (m.lessonsViewed === 0 && practised === 0 && reviewed === 0) m.level = 'UNSEEN'
  else if (practised === 0) m.level = 'INTRODUCED'
  else if ((m.quizBest ?? 0) >= 0.8 && m.counterexamplesReviewed >= 1 && practised >= 2) m.level = 'FAMILIAR'
  else m.level = 'PRACTISING'
  return m
}

export function masteryOf(conceptId: string): ConceptMastery {
  return masteryFrom(conceptId, readEngagements())
}

export type ProgressSummary = {
  concepts: ConceptMastery[]
  totals: { concepts: number; unseen: number; introduced: number; practising: number; familiar: number; engagements: number }
  /** What to look at next: unseen foundations first, then practising concepts with no counterexample reviewed. */
  suggestions: Array<{ conceptId: string; reason: string }>
  note: string
}

export function progressSummary(events = readEngagements()): ProgressSummary {
  const concepts = conceptIds().map((id) => masteryFrom(id, events))
  const count = (l: MasteryLevel) => concepts.filter((c) => c.level === l).length
  const suggestions: ProgressSummary['suggestions'] = []
  for (const m of concepts) {
    const c = conceptById(m.conceptId)!
    if (m.level === 'UNSEEN' && c.level === 'foundation') suggestions.push({ conceptId: m.conceptId, reason: 'A foundation concept not yet opened.' })
    else if (m.level === 'PRACTISING' && m.counterexamplesReviewed === 0) suggestions.push({ conceptId: m.conceptId, reason: 'Practised, but no counterexample reviewed yet — the other half of the lesson.' })
  }
  return {
    concepts,
    totals: { concepts: concepts.length, unseen: count('UNSEEN'), introduced: count('INTRODUCED'), practising: count('PRACTISING'), familiar: count('FAMILIAR'), engagements: events.length },
    suggestions: suggestions.slice(0, 5),
    note: MASTERY_NOTE,
  }
}
