/**
 * THE MARKET SCHOOL — curriculum integrity, lessons that label every claim,
 * quizzes graded on the server, engagement-only mastery, and a replay school
 * that asks before it tells.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { Candle } from '../../src/types.ts'
import type { EvidenceRecord } from '../../src/analyst/records.ts'

const tmp = tempDataDir('mrcash-school-')
process.env.MRCASH_DATA_DIR = tmp.dir
const cur = await import('../../src/school/curriculum.ts')
const les = await import('../../src/school/lessons.ts')
const prog = await import('../../src/school/progress.ts')
const rs = await import('../../src/school/replaySchool.ts')
const cs = await import('../../src/school/caseStudies.ts')
const rec = await import('../../src/analyst/records.ts')
const { strategyIds } = await import('../../src/strategies/registry.ts')
after(() => tmp.cleanup())

const NOW = Date.UTC(2026, 0, 20, 15, 0)
const candles: Candle[] = syntheticKlines(5, 11, NOW).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
const cases = cs.scanCandles(candles, { votesTail: 300, horizon: 12 })

test('the curriculum is internally consistent: no dangling edges, valid answer keys, real strategy ids and case kinds', () => {
  const g = cur.conceptGraph()
  assert.deepEqual(g.dangling, [])
  assert.ok(g.nodes.length >= 20)
  const ids = new Set(strategyIds())
  for (const c of cur.CONCEPTS) {
    assert.ok(c.quiz.length >= 1, `${c.id} has a quiz`)
    for (const qq of c.quiz) { assert.ok(qq.answer >= 0 && qq.answer < qq.choices.length, `${qq.id} answer index`); assert.ok(qq.why.length > 0) }
    for (const s of c.strategies) assert.ok(ids.has(s), `${c.id} references unknown strategy ${s}`)
    for (const k of c.caseKinds) assert.ok(k in cs.CONCEPT_OF, `${c.id} references unknown case kind ${k}`)
    assert.doesNotMatch(c.summary, /\b(proven|guaranteed|fail-?proof|perfect)\b/i, `${c.id} uses a banned word`)
  }
  assert.ok(cur.conceptsForStrategy('silver-bullet').some((c) => c.id === 'silver-bullet-window'))
  assert.ok(cur.conceptsForAnnotation('liquidity-sweep').some((c) => c.id === 'liquidity-sweep'))
  assert.ok(cur.conceptsForCaseKind('bos').some((c) => c.id === 'bos'))
  assert.equal(cur.conceptById('nope'), null)
  assert.ok(!('answer' in cur.publicQuestion(cur.CONCEPTS[0].quiz[0])))
})

test('data growth bars follow the sample bars: 0–9 / 10–49 / 50–199 / 200+', () => {
  assert.equal(les.dataGrowth(0).band, '0–9')
  assert.equal(les.dataGrowth(9).band, '0–9')
  assert.equal(les.dataGrowth(10).band, '10–49')
  assert.equal(les.dataGrowth(49).band, '10–49')
  assert.equal(les.dataGrowth(50).band, '50–199')
  assert.equal(les.dataGrowth(200).band, '200+')
  assert.equal(les.dataGrowth(200).pct, 100)
  assert.equal(les.dataGrowth(10).toNext, 40)
  assert.equal(les.dataGrowth(0).status, 'INSUFFICIENT SAMPLE')
})

const T0 = Date.UTC(2026, 0, 13, 13, 30)
function r(i: number, over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: `p${i}`, source: 'PAPER', strategyId: 'silver-bullet', family: 'session', symbol: 'BTCUSDT', interval: '5m', session: 'london', regime: 'trending-up', volatility: 'normal',
    direction: 'long', decidedAt: T0 + i * 3_600_000, filledAt: T0 + i * 3_600_000 + 300_000, closedAt: T0 + i * 3_600_000 + 1_800_000, hourET: 8, weekdayET: 2,
    intendedEntry: 100, entry: 100, stop: 99, target: 102, exit: 101, exitReason: 'take-profit', rMultiple: i % 3 === 0 ? -1 : 1, outcome: i % 3 === 0 ? 'LOSS' : 'WIN', missed: false,
    quality: 85, fusedScore: 80, mtfAligned: null, newsMinutes: null, spreadPct: null, durationMs: 1_500_000,
    mae: { r: -0.3, status: 'OBSERVED', note: '' }, mfe: { r: 1.2, status: 'OBSERVED', note: '' },
    engineVersion: '2.3.0', featureVersion: 1, missing: [], corrupt: false, corruptReason: null, ...over,
  }
}

test('a lesson labels every section, teaches in zero-data mode, and says NOT ENOUGH DATA under the bar', () => {
  const zero = les.buildLesson('silver-bullet-window', { cases, now: NOW })!
  assert.ok(zero.sections.length >= 3)
  for (const s of zero.sections) { assert.ok(['OBSERVED', 'INFERRED', 'HYPOTHESIS', 'SIMULATED', 'INSUFFICIENT DATA'].includes(s.evidenceLabel)); assert.ok(s.provenance.length > 0) }
  assert.equal(zero.paperEvidence!.status, 'NOT ENOUGH DATA')
  assert.ok(zero.notes.some((n) => /Zero-data mode/.test(n)))
  assert.ok(zero.quiz.every((qq) => !('answer' in qq)))

  const few = rec.datasetOf([r(0), r(1), r(2)])
  const under = les.buildLesson('silver-bullet-window', { cases, dataset: few, now: NOW })!
  assert.equal(under.paperEvidence!.status, 'NOT ENOUGH DATA')
  assert.equal(under.paperEvidence!.n, 3)
  assert.match(under.paperEvidence!.note, /under the 10-trade bar/)

  const enough = rec.datasetOf(Array.from({ length: 12 }, (_, i) => r(i)))
  const ok = les.buildLesson('silver-bullet-window', { cases, dataset: enough, now: NOW })!
  assert.equal(ok.paperEvidence!.status, 'OBSERVED')
  if (ok.paperEvidence!.status === 'OBSERVED') {
    assert.equal(ok.paperEvidence!.n, 12)
    assert.equal(ok.paperEvidence!.growth.band, '10–49')
    assert.equal(ok.paperEvidence!.recordIds.length, 12)
    assert.equal(ok.paperEvidence!.stats.profitFactor, null, 'profit factor withheld under the early bar')
  }
  const paper = ok.sections.find((s) => s.heading === 'What the paper record shows')!
  assert.match(paper.body, /12 trades/)
  assert.match(paper.provenance, /^PAPER/)

  const noCohort = les.buildLesson('r-multiple', { cases, dataset: enough, now: NOW })!
  assert.equal(noCohort.paperEvidence, null, 'a concept with no honest cohort mapping shows no paper panel rather than an invented one')
  assert.equal(les.buildLesson('nope', { cases }), null)
})

test('lessons attach the engine\'s own historical cases and counterexamples for the concepts that have them', () => {
  const kinds = new Set(cases.map((c) => c.kind))
  const concept = cur.CONCEPTS.find((c) => c.caseKinds.some((k) => kinds.has(k)))!
  const l = les.buildLesson(concept.id, { cases, now: NOW })!
  assert.ok(l.examples.length > 0)
  assert.ok(l.examples.every((e) => e.provenance.source === 'HISTORICAL'))
  assert.ok(l.sections.some((s) => s.heading === 'From the chart' && /^HISTORICAL/.test(s.provenance)))
  for (const e of l.examples) assert.deepEqual(cs.hindsightFindings(e), [])
})

test('quizzes are graded on the server and the score is described as recall, not skill', () => {
  const c = cur.conceptById('sample-size')!
  const right = Object.fromEntries(c.quiz.map((qq) => [qq.id, qq.answer]))
  const g = les.gradeQuiz('sample-size', right)!
  assert.equal(g.correct, g.total)
  assert.equal(g.score, 1)
  const wrong = les.gradeQuiz('sample-size', {})!
  assert.equal(wrong.correct, 0)
  assert.ok(wrong.results.every((x) => x.chosen === null && x.why.length > 0))
  assert.match(g.note, /nothing about whether the concept makes money/)
  assert.equal(les.gradeQuiz('nope', {}), null)
})

test('mastery is engagement only and says so; levels move UNSEEN → INTRODUCED → PRACTISING → FAMILIAR', () => {
  assert.equal(prog.masteryOf('bos').level, 'UNSEEN')
  prog.recordEngagement({ kind: 'lesson-viewed', conceptId: 'bos', at: T0 })
  assert.equal(prog.masteryOf('bos').level, 'INTRODUCED')
  prog.recordEngagement({ kind: 'quiz-taken', conceptId: 'bos', detail: { correct: 0, total: 1 }, at: T0 + 1 })
  assert.equal(prog.masteryOf('bos').level, 'PRACTISING')
  prog.recordEngagement({ kind: 'quiz-taken', conceptId: 'bos', detail: { correct: 1, total: 1 }, at: T0 + 2 })
  prog.recordEngagement({ kind: 'counterexample-reviewed', conceptId: 'bos', at: T0 + 3 })
  const m = prog.masteryOf('bos')
  assert.equal(m.level, 'FAMILIAR')
  assert.equal(m.quizBest, 1)
  assert.equal(m.quizLast, 1)
  assert.equal(m.note, prog.MASTERY_NOTE)
  assert.match(prog.MASTERY_NOTE, /not trading skill/)
  const s = prog.progressSummary()
  assert.equal(s.totals.familiar, 1)
  assert.equal(s.totals.engagements, 4)
  assert.ok(s.suggestions.some((x) => /foundation/.test(x.reason)))
  assert.throws(() => prog.recordEngagement({ kind: 'lesson-viewed', conceptId: 'nope' }), /unknown concept/)
})

test('REPLAY SCHOOL — a stop shows only what was knowable before the event; the reveal comes after the answer', () => {
  const bundle = rs.buildReplayLesson(candles, { maxStops: 5, votesTail: 300, horizon: 12 })
  assert.ok(bundle.lesson.stops.length >= 1, 'at least one stop on five synthetic days')
  assert.ok(bundle.lesson.stops.length <= 5)
  for (let k = 0; k < bundle.lesson.stops.length; k++) {
    const before = rs.stopView(bundle, k)!
    const c = bundle.cases.get(before.stop.caseId)!
    assert.equal(before.frame.time, before.cursor)
    assert.ok(before.cursor < c.at)
    for (const a of before.frame.annotations) assert.ok(a.knownAt <= before.cursor, `${a.annotationType} leaked into the BEFORE frame`)
    const payload = JSON.stringify(before)
    assert.ok(!payload.includes(c.during.detail), 'the event detail is not in the pre-answer payload')
    assert.ok(!payload.includes(c.after.note), 'the outcome is not in the pre-answer payload')
    assert.ok(!payload.includes('"answer"'))
    assert.ok(before.stop.question.choices.length >= 2)

    const wrongChoice = before.stop.question.choices.find((x) => x !== rs.correctChoice(c, before.stop.question))!
    const reveal = rs.revealStop(bundle, k, wrongChoice)!
    assert.equal(reveal.correct, false)
    assert.equal(rs.revealStop(bundle, k, reveal.answer.correct)!.correct, true)
    assert.deepEqual(reveal.hindsight, [])
    assert.ok(reveal.after.candles === 12)
    assert.ok(reveal.eventFrame.time === c.at)
    assert.ok(reveal.answer.explanation.length > 0)
  }
  assert.equal(rs.stopView(bundle, 99), null)
  const empty = rs.buildReplayLesson(candles.slice(0, 5), { maxStops: 3 })
  assert.equal(empty.lesson.stops.length, 0)
  assert.match(empty.lesson.note, /NOT ENOUGH DATA/)
})

test('the basics come first, in teaching order, and their worked answers add up', () => {
  const basics = cur.CONCEPTS.filter((c) => c.track === 'basics')
  assert.equal(basics.length, 10)
  assert.deepEqual(cur.CONCEPTS.slice(0, 10).map((c) => c.id), basics.map((c) => c.id), 'a beginner sees the basics before any ICT concept')
  for (const c of basics) {
    const text = [c.summary, ...c.engineChecks, ...c.misreads, ...c.quiz.flatMap((qq) => [qq.prompt, qq.why])].join(' ')
    assert.doesNotMatch(text, /\b(proven|guaranteed|certain(?:ly)?|best|perfect|fail-?proof|profitable)\b/i, `${c.id} makes no promises`)
  }
  const choice = (id: string) => { const qq = cur.CONCEPTS.flatMap((c) => c.quiz).find((x) => x.id === id)!; return qq.choices[qq.answer] }
  assert.equal(choice('ps-1'), String((5000 * 0.01) / (20 - 19.5)))
  assert.equal(choice('opt-1'), (105 + 1.5).toFixed(2))
  assert.equal(choice('opt-2'), `$${0.8 * 100}`)
  assert.equal(choice('lev-1'), `${100 / 5}%`)
})
