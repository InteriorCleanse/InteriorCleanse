/**
 * THE LESSON GENERATOR — a lesson is assembled at request time from three
 * sources that are never mixed: the curriculum text (what the concept is and
 * what the engine checks), the case studies (HISTORICAL examples and
 * counterexamples the engine itself found), and the paper record (PAPER
 * evidence with its sample status — or NOT ENOUGH DATA).
 *
 * Every section carries an evidence label. The quiz is graded here, on the
 * server; the browser never receives the answer key.
 *
 * Zero-data behaviour is explicit: with no paper trades the lesson still
 * teaches, from the concept text and the historical cases, and says so.
 */

import { config } from '../../config.ts'
import { SAMPLE_BARS, cohort, sampleStatus } from '../analyst/cohorts.ts'
import type { CohortDefinition, CohortStats, SampleStatus } from '../analyst/cohorts.ts'
import type { Dataset } from '../analyst/records.ts'
import type { EvidenceLabel } from '../knowledge/vault.ts'
import { VERSION } from '../version.ts'
import { COUNTEREXAMPLE_LESSON, counterexamplesFor, outcomeTally } from './caseStudies.ts'
import type { CaseStudy, CounterexamplePair } from './caseStudies.ts'
import { conceptById, publicQuestion } from './curriculum.ts'
import type { Concept, QuizQuestion } from './curriculum.ts'

// ---------------------------------------------------------------
// Data growth — the bars the spec asks for, on screen everywhere
// ---------------------------------------------------------------

export type GrowthBand = '0–9' | '10–49' | '50–199' | '200+'

export type DataGrowth = {
  n: number
  band: GrowthBand
  status: SampleStatus
  /** Progress through the current band, 0–100. 100 at the top band. */
  pct: number
  /** Trades to the next band; 0 at the top. */
  toNext: number
  note: string
}

export function dataGrowth(n: number): DataGrowth {
  const status = sampleStatus(n)
  const edges: Array<[number, number, GrowthBand]> = [[0, SAMPLE_BARS.insufficient, '0–9'], [SAMPLE_BARS.insufficient, SAMPLE_BARS.early, '10–49'], [SAMPLE_BARS.early, SAMPLE_BARS.developing, '50–199'], [SAMPLE_BARS.developing, Infinity, '200+']]
  const [lo, hi, band] = edges.find(([a, b]) => n >= a && n < b) ?? edges[edges.length - 1]
  const pct = hi === Infinity ? 100 : Math.round(((n - lo) / (hi - lo)) * 100)
  const toNext = hi === Infinity ? 0 : hi - n
  return { n, band, status, pct, toNext, note: hi === Infinity ? `${n} trades — the largest band this system distinguishes. More data still narrows the intervals.` : `${n} trade${n === 1 ? '' : 's'} — ${toNext} more to reach the ${edges[edges.indexOf(edges.find((e) => e[2] === band)!) + 1][2]} band.` }
}

// ---------------------------------------------------------------
// Lesson shape
// ---------------------------------------------------------------

export type LessonSection = {
  heading: string
  body: string
  evidenceLabel: EvidenceLabel
  provenance: string
}

export type PaperEvidence =
  | { status: 'NOT ENOUGH DATA'; n: number; growth: DataGrowth; note: string; cohort: string }
  | { status: 'OBSERVED'; n: number; growth: DataGrowth; cohort: string; stats: CohortStats; recordIds: string[]; note: string }

export type Lesson = {
  conceptId: string
  title: string
  level: Concept['level']
  track: Concept['track']
  generatedAt: number
  engineVersion: string
  sections: LessonSection[]
  /** HISTORICAL cases the engine found, that illustrate the concept. */
  examples: CaseStudy[]
  counterexamples: CounterexamplePair[]
  /** How often the illustrating events went the concept's way — with n, no share under 10. */
  tally: ReturnType<typeof outcomeTally>
  paperEvidence: PaperEvidence | null
  quiz: Array<ReturnType<typeof publicQuestion>>
  related: string[]
  /** Things the reader should know about what this lesson is and is not. */
  notes: string[]
}

/** The paper cohort a concept is judged on, when one can be defined without inventing a field. */
export function cohortFor(c: Concept): CohortDefinition | null {
  if (c.strategies.length) return { name: `${c.id} strategies`, filters: [{ dimension: 'strategyId', values: c.strategies }] }
  if (c.id === 'sessions-killzones') return { name: 'in-session trades', filters: [{ dimension: 'session', values: Object.keys(config.ict.sessions) }] }
  if (c.id === 'regimes') return { name: 'trending regimes', filters: [{ dimension: 'regime', values: ['trending-up', 'trending-down'] }] }
  if (c.id === 'volatility-regime') return { name: 'wild volatility', filters: [{ dimension: 'volatility', values: ['wild'] }] }
  return null
}

function paperEvidenceFor(c: Concept, dataset: Dataset | null | undefined): PaperEvidence | null {
  const def = cohortFor(c)
  if (!def) return null
  if (!dataset || dataset.provenance.source !== 'PAPER') {
    return { status: 'NOT ENOUGH DATA', n: 0, growth: dataGrowth(0), cohort: def.name, note: 'No paper record was supplied. The lesson teaches from the concept and the historical cases only.' }
  }
  const co = cohort(dataset, def)
  const n = co.stats.n
  if (n < SAMPLE_BARS.insufficient) {
    return { status: 'NOT ENOUGH DATA', n, growth: dataGrowth(n), cohort: def.name, note: `${n} paper trade${n === 1 ? '' : 's'} in this cohort — under the ${SAMPLE_BARS.insufficient}-trade bar, so no result is stated. It will appear here as the record grows.` }
  }
  return { status: 'OBSERVED', n, growth: dataGrowth(n), cohort: def.name, stats: co.stats, recordIds: co.recordIds, note: `${co.stats.statusNote} Source: PAPER (live market, simulated execution).` }
}

const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

export type LessonInputs = {
  /** Case studies already computed (from the candle scan and the paper record). */
  cases: CaseStudy[]
  /** The paper dataset, when the caller has one. Never a mixed dataset. */
  dataset?: Dataset | null
  now?: number
  maxExamples?: number
}

export function buildLesson(conceptId: string, input: LessonInputs): Lesson | null {
  const c = conceptById(conceptId)
  if (!c) return null
  const now = input.now ?? Date.now()
  const maxExamples = input.maxExamples ?? 6
  const relevant = input.cases.filter((k) => c.caseKinds.includes(k.kind))
  const observed = relevant.filter((k) => k.evidenceLevel === 'OBSERVED')
  const examples = (observed.length ? observed : relevant).slice(0, maxExamples)
  const counterexamples = c.caseKinds.flatMap((k) => counterexamplesFor(relevant, k, 2)).slice(0, 4)
  const tally = outcomeTally(relevant)
  const paperEvidence = paperEvidenceFor(c, input.dataset)

  const sections: LessonSection[] = [
    { heading: 'What it is', body: c.summary, evidenceLabel: 'INFERRED', provenance: 'Curriculum text, written for this engine. A definition, not a result.' },
    { heading: 'What the engine checks', body: c.engineChecks.join('\n'), evidenceLabel: 'OBSERVED', provenance: `Engine ${VERSION}: the modules named are the ones that run.` },
    { heading: 'How it is commonly misread', body: c.misreads.join('\n'), evidenceLabel: 'INFERRED', provenance: 'Curriculum text. The counterexamples below are the evidence for it.' },
  ]
  if (examples.length) {
    sections.push({ heading: 'From the chart', body: examples.map((e) => `${e.title}: ${e.during.detail} ${e.after.note}`).join('\n'), evidenceLabel: 'OBSERVED', provenance: `HISTORICAL — ${examples.length} case stud${examples.length === 1 ? 'y' : 'ies'} the engine found on stored candles, each with BEFORE / DURING / DECISION / AFTER built from what was knowable at the time.` })
  } else if (c.caseKinds.length) {
    sections.push({ heading: 'From the chart', body: 'NOT ENOUGH DATA — no stored candles produced an instance of this concept yet. The lesson stands on the definition and the engine checks until the scan finds one.', evidenceLabel: 'INSUFFICIENT DATA', provenance: 'HISTORICAL scan returned nothing for the case kinds this concept maps to.' })
  }
  if (counterexamples.length) {
    sections.push({ heading: 'Where it went the other way', body: `${COUNTEREXAMPLE_LESSON}\n` + counterexamples.map((p) => `${p.counterexample.title}: ${p.counterexample.during.detail} ${p.counterexample.after.note}`).join('\n'), evidenceLabel: 'OBSERVED', provenance: 'HISTORICAL — cases paired by the counterexample engine.' })
  }
  if (tally.length) {
    sections.push({ heading: 'How often the event went its expected way', body: tally.map((t) => `${t.kind}: ${t.note}`).join('\n'), evidenceLabel: tally.some((t) => t.share !== null) ? 'OBSERVED' : 'INSUFFICIENT DATA', provenance: 'HISTORICAL — counted over the scanned window; a description of that window, not a probability.' })
  }
  if (paperEvidence) {
    sections.push(paperEvidence.status === 'OBSERVED'
      ? { heading: 'What the paper record shows', body: `Cohort "${paperEvidence.cohort}": ${paperEvidence.n} trades, mean ${fx(paperEvidence.stats.meanR)}R${paperEvidence.stats.ci95 ? ` (95% interval ${fx(paperEvidence.stats.ci95.lo)} to ${fx(paperEvidence.stats.ci95.hi)})` : ''}, win rate ${paperEvidence.stats.winRate === null ? '—' : `${Math.round(paperEvidence.stats.winRate * 100)}%`}. ${paperEvidence.note}`, evidenceLabel: 'OBSERVED', provenance: `PAPER — ${paperEvidence.n} records; ids attached to the lesson.` }
      : { heading: 'What the paper record shows', body: paperEvidence.note, evidenceLabel: 'INSUFFICIENT DATA', provenance: 'PAPER — under the sample bar.' })
  }

  const notes = [
    'Mastery here is engagement with the material. It is not a measure of trading skill and is not used by the engine.',
    'Nothing in this lesson is a trading recommendation. The engine remains the only source of decisions.',
  ]
  if (!input.dataset) notes.push('Zero-data mode: no paper record supplied; teaching from the concept text and HISTORICAL cases.')

  return {
    conceptId: c.id, title: c.title, level: c.level, track: c.track, generatedAt: now, engineVersion: VERSION,
    sections, examples, counterexamples, tally, paperEvidence,
    quiz: c.quiz.map(publicQuestion), related: c.related, notes,
  }
}

// ---------------------------------------------------------------
// Grading — server side only
// ---------------------------------------------------------------

export type QuizResult = {
  conceptId: string
  total: number
  correct: number
  score: number
  results: Array<{ id: string; correct: boolean; chosen: number | null; why: string }>
  note: string
}

export function gradeQuiz(conceptId: string, answers: Record<string, number>): QuizResult | null {
  const c = conceptById(conceptId)
  if (!c) return null
  const results = c.quiz.map((qq: QuizQuestion) => {
    const chosen = Number.isInteger(answers[qq.id]) ? answers[qq.id] : null
    const correct = chosen === qq.answer
    return { id: qq.id, correct, chosen, why: qq.why }
  })
  const correct = results.filter((r) => r.correct).length
  return { conceptId, total: results.length, correct, score: results.length ? correct / results.length : 0, results, note: 'A quiz score measures recall of how this engine works. It says nothing about whether the concept makes money.' }
}
