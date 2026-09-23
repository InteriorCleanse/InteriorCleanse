/**
 * EDUCATION UPDATES — lessons are versioned as the record grows, and new
 * exercises are drawn from resolved case studies. History is never rewritten.
 *
 * A lesson is assembled on request from the curriculum, the historical cases
 * and the paper record, so it changes whenever those change. A LESSON VERSION
 * is a snapshot of what the lesson said at a moment: which examples it used,
 * what the tally was, what the paper cohort showed, and a content hash. When
 * the hash moves, a new version is appended with a diff in words; the old
 * version stays. A learner who read v3 can see what v4 added.
 *
 * A CASE EXERCISE is a quiz question built from one resolved case: BEFORE is
 * shown, the reader is asked what the record supports saying, and the answer
 * is derived from the stored AFTER frame. Exercises say "what happened", not
 * "what will happen"; the choices never include a forecast.
 */

import { listItems } from '../knowledge/vault.ts'
import { listObservations } from '../observer/events.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'
import type { CaseStudy } from './caseStudies.ts'
import { conceptById, conceptIds, conceptsForCaseKind } from './curriculum.ts'
import type { QuizQuestion } from './curriculum.ts'
import type { Lesson } from './lessons.ts'

// ---------------------------------------------------------------
// Lesson versions
// ---------------------------------------------------------------

export type LessonVersion = {
  conceptId: string
  version: number
  at: number
  engineVersion: string
  hash: string
  exampleIds: string[]
  counterexampleIds: string[]
  tally: Array<{ kind: string; n: number; wentExpected: number }>
  paperEvidence: { status: string; n: number; meanR: number | null } | null
  sectionHeadings: string[]
  /** What changed against the previous version, in words. Empty on v1. */
  diff: string[]
}

const PREFIX = 'lesson-version:'
const key = (conceptId: string, v: number) => `${PREFIX}${conceptId}:${String(v).padStart(4, '0')}`

function hash(s: string): string {
  let h = 2166136261
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(36)
}

/** The parts of a lesson that can change with the record, hashed. Pure. */
export function lessonFingerprint(l: Lesson): Omit<LessonVersion, 'conceptId' | 'version' | 'at' | 'engineVersion' | 'diff'> {
  const exampleIds = l.examples.map((e) => e.id).sort()
  const counterexampleIds = l.counterexamples.map((p) => p.counterexample.id).sort()
  const tally = l.tally.map((t) => ({ kind: t.kind, n: t.n, wentExpected: t.wentExpected })).sort((a, b) => a.kind.localeCompare(b.kind))
  const pe = l.paperEvidence ? { status: l.paperEvidence.status, n: l.paperEvidence.n, meanR: l.paperEvidence.status === 'OBSERVED' ? Math.round((l.paperEvidence.stats.meanR ?? 0) * 100) / 100 : null } : null
  const sectionHeadings = l.sections.map((s) => s.heading)
  const h = hash(JSON.stringify({ exampleIds, counterexampleIds, tally, pe, sectionHeadings, bodies: l.sections.map((s) => s.body) }))
  return { hash: h, exampleIds, counterexampleIds, tally, paperEvidence: pe, sectionHeadings }
}

export function lessonVersions(conceptId: string): LessonVersion[] {
  return store().keysWithPrefix(`${PREFIX}${conceptId}:`).map((k) => store().getJson<LessonVersion>(k)).filter((v): v is LessonVersion => v !== null).sort((a, b) => a.version - b.version)
}

export function latestLessonVersion(conceptId: string): LessonVersion | null { const vs = lessonVersions(conceptId); return vs[vs.length - 1] ?? null }

function describeDiff(prev: LessonVersion, next: ReturnType<typeof lessonFingerprint>): string[] {
  const out: string[] = []
  const added = next.exampleIds.filter((id) => !prev.exampleIds.includes(id)).length
  const removed = prev.exampleIds.filter((id) => !next.exampleIds.includes(id)).length
  if (added || removed) out.push(`Examples: ${added} added, ${removed} no longer shown (${next.exampleIds.length} now).`)
  const ca = next.counterexampleIds.filter((id) => !prev.counterexampleIds.includes(id)).length
  if (ca) out.push(`${ca} new counterexample(s).`)
  for (const t of next.tally) {
    const p = prev.tally.find((x) => x.kind === t.kind)
    if (!p) out.push(`Tally: ${t.kind} first counted (${t.wentExpected} of ${t.n}).`)
    else if (p.n !== t.n) out.push(`Tally: ${t.kind} ${p.wentExpected}/${p.n} → ${t.wentExpected}/${t.n}.`)
  }
  if (JSON.stringify(prev.paperEvidence) !== JSON.stringify(next.paperEvidence)) {
    out.push(next.paperEvidence ? `Paper evidence: ${prev.paperEvidence ? `${prev.paperEvidence.status} n=${prev.paperEvidence.n}` : 'none'} → ${next.paperEvidence.status} n=${next.paperEvidence.n}${next.paperEvidence.meanR !== null ? ` mean ${next.paperEvidence.meanR}R` : ''}.` : 'Paper evidence removed.')
  }
  const newHeads = next.sectionHeadings.filter((h) => !prev.sectionHeadings.includes(h))
  if (newHeads.length) out.push(`New section(s): ${newHeads.join(', ')}.`)
  if (!out.length) out.push('Section text changed with the record; the structure is the same.')
  return out
}

/** Append a version when the lesson's content has moved. Returns the version on record (new or existing). Never overwrites. */
export function snapshotLesson(l: Lesson, now = Date.now()): { version: LessonVersion; isNew: boolean } {
  const fp = lessonFingerprint(l)
  const prev = latestLessonVersion(l.conceptId)
  if (prev && prev.hash === fp.hash) return { version: prev, isNew: false }
  const version: LessonVersion = { conceptId: l.conceptId, version: (prev?.version ?? 0) + 1, at: now, engineVersion: VERSION, ...fp, diff: prev ? describeDiff(prev, fp) : [] }
  store().setJson(key(l.conceptId, version.version), version)
  return { version, isNew: true }
}

/** Every concept's version count and last change, for the "what changed in the curriculum" panel. */
export function curriculumChanges(since?: number): Array<{ conceptId: string; title: string; versions: number; lastChanged: number | null; lastDiff: string[] }> {
  return conceptIds().map((id) => {
    const vs = lessonVersions(id)
    const last = vs[vs.length - 1] ?? null
    return { conceptId: id, title: conceptById(id)?.title ?? id, versions: vs.length, lastChanged: last?.at ?? null, lastDiff: last?.diff ?? [] }
  }).filter((c) => since === undefined || (c.lastChanged !== null && c.lastChanged >= since))
}

// ---------------------------------------------------------------
// Exercises from resolved cases
// ---------------------------------------------------------------

export type CaseExercise = QuizQuestion & {
  caseId: string
  conceptId: string
  kind: string
  at: number
  source: 'HISTORICAL' | 'PAPER'
  /** What the reader is shown before answering: BEFORE and DURING only. */
  shown: string
  evidenceLabel: 'OBSERVED' | 'INSUFFICIENT DATA'
}

const fx = (n: number | null, d = 1) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

/** One exercise from one case. The answer is the stored AFTER frame; the choices describe what happened, never what will. Pure. */
export function exerciseFromCase(c: CaseStudy): CaseExercise | null {
  if (c.after.candles <= 0 || c.after.moveAtr === null) return null
  const move = c.after.moveAtr
  const dir = c.during.direction
  const conceptId = conceptById(c.concept)?.id ?? conceptsForCaseKind(c.kind)[0]?.id ?? c.concept
  const shown = `${c.title}. BEFORE (as of ${new Date(c.before.asOf).toISOString().slice(0, 16).replace('T', ' ')}): session ${c.before.session ?? '—'}, regime ${c.before.regime ?? 'unclassified'}, volatility ${c.before.volatility ?? '—'}, structure ${c.before.structureTrend ?? '—'}. DURING: ${c.during.detail} DECISION: ${c.decision.note}`
  const up = `Price closed higher over the next ${c.after.candles} candle(s) (${fx(move)} ATR)`
  const down = `Price closed lower over the next ${c.after.candles} candle(s) (${fx(move)} ATR)`
  const flat = `Price closed within a quarter ATR of the event over the next ${c.after.candles} candle(s)`
  const cannot = 'The record cannot say: the AFTER frame was not stored'
  const answerText = Math.abs(move) < 0.25 ? flat : move > 0 ? up : down
  const choices = [up, down, flat, cannot].map((t) => (t === answerText ? t : t.replace(`(${fx(move)} ATR)`, '')))
  const answer = choices.indexOf(answerText)
  const went = c.after.wentExpectedWay
  return {
    id: `case-quiz:${c.id}`, caseId: c.id, conceptId, kind: c.kind, at: c.at, source: c.provenance.source, shown,
    prompt: `Given only what was knowable BEFORE and DURING, what does the stored record say happened AFTER${dir ? ` this ${dir} ${c.kind.replace(/-/g, ' ')}` : ''}?`,
    choices, answer,
    why: `${c.after.note} ${went === null ? 'The concept has no expected direction here.' : went ? 'That is the way the concept expects, on this one occasion.' : 'That is the other way from what the concept expects — one counterexample, not a refutation.'} The question is about what happened, never about what will.`,
    evidenceLabel: c.evidenceLevel,
  }
}

/** Exercises from the resolved cases on record (via the observer's resolved candidates), newest first. */
export function caseExercises(opts: { limit?: number; conceptId?: string; since?: number } = {}): { exercises: CaseExercise[]; note: string } {
  const resolved = listObservations({ status: 'RESOLVED', from: opts.since, limit: 500 })
  const byId = new Map(listItems({ kind: 'case-study' }).map((i) => [i.id, i.payload as CaseStudy]))
  const out: CaseExercise[] = []
  const seen = new Set<string>()
  for (const o of resolved) {
    const c = o.caseId ? byId.get(o.caseId) : null
    if (!c || seen.has(c.id)) continue
    const ex = exerciseFromCase(c)
    if (!ex) continue
    if (opts.conceptId && ex.conceptId !== opts.conceptId) continue
    seen.add(c.id)
    out.push(ex)
  }
  out.sort((a, b) => b.at - a.at)
  const exercises = out.slice(0, opts.limit ?? 20)
  return { exercises, note: exercises.length ? `${exercises.length} exercise(s) from resolved cases. Each asks what the record says happened; none asks what will.` : 'No resolved case yet to draw an exercise from.' }
}

/** Grade one case exercise; the answer never leaves the server unmarked. */
export function gradeCaseExercise(ex: CaseExercise, chosen: number | null): { correct: boolean; why: string } {
  return { correct: chosen === ex.answer, why: ex.why }
}

export function publicExercise(ex: CaseExercise): Omit<CaseExercise, 'answer' | 'why'> {
  const { answer: _a, why: _w, ...rest } = ex
  return rest
}
