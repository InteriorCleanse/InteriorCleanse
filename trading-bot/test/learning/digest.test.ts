/**
 * THE DIGESTS AND EDUCATION UPDATES — a digest is written once per period and
 * re-read after that; the lesson of the day is the most significant resolved
 * case, described BEFORE → DECISION → AFTER with what it does not teach; the
 * weekly review says what should not be touched; the monthly audit rates
 * nothing; lessons are versioned, never rewritten; exercises ask what
 * happened, never what will.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { Candle } from '../../src/types.ts'

const tmp = tempDataDir('mrcash-digest-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const D = await import('../../src/learning/digest.ts')
const U = await import('../../src/school/updates.ts')
const cs = await import('../../src/school/caseStudies.ts')
const lessons = await import('../../src/school/lessons.ts')
const curriculum = await import('../../src/school/curriculum.ts')
const vault = await import('../../src/knowledge/vault.ts')
const ev = await import('../../src/observer/events.ts')
after(() => tmp.cleanup())

const NOW = Date.UTC(2026, 0, 20, 15, 0)
const DAY = 86_400_000
const FORECAST = /\b(will (rise|fall|rally|drop|reverse|continue)|expect a|forecast:|guaranteed|proven)\b/i

test('zero data: every digest is produced, stored once under its period id, labelled INSUFFICIENT DATA where it must be, and forecasts nothing', () => {
  const d = D.buildDailyDigest([], NOW)
  assert.equal(d.kind, 'DAILY LEARNING DIGEST')
  assert.equal(d.sections.length, 12)
  assert.ok(d.sections.every((s) => s.lines.length >= 1 && s.source))
  assert.ok(d.sections.filter((s) => s.evidenceLabel === 'INSUFFICIENT DATA').length >= 8, 'with nothing recorded, most sections say so')
  assert.equal(d.lessonOfTheDay, null)
  assert.ok(d.notes.some((n) => /No resolved case study yet/.test(n)))
  const first = D.dailyDigest([], NOW)
  const second = D.dailyDigest([], NOW + 3_600_000)
  assert.equal(first.isNew, true); assert.equal(second.isNew, false)
  assert.equal(first.digest.id, second.digest.id, 'one digest per trading day, whatever the hour')
  assert.equal(D.listDigests('daily').length, 1)
  const w = D.weeklyResearchReview([], NOW)
  assert.equal(w.isNew, true)
  assert.equal(D.weeklyResearchReview([], NOW + DAY).isNew, false)
  const dnt = w.review.sections.find((s) => s.heading === 'WHAT SHOULD NOT BE TOUCHED')!
  assert.ok(dnt.lines.some((l) => /Live execution gate: disabled/.test(l)))
  assert.ok(dnt.lines.some((l) => /No research result applies itself/.test(l)))
  assert.ok(w.review.sections.map((s) => s.heading).includes('WHAT NEEDS MORE DATA'))
  const m = D.monthlyModelAudit([], NOW)
  assert.equal(m.isNew, true)
  assert.ok(m.audit.strategies.length >= 3)
  assert.ok(m.audit.strategies.every((s) => s.paper.meanR === null && /more paper trade/.test(s.wouldChange)), 'no strategy has a stated result at zero data')
  assert.ok(m.audit.boundaries.some((b) => /Live execution gate: disabled/.test(b)))
  assert.equal(m.audit.previousStrategyVersion, null)
  for (const text of [JSON.stringify(d), JSON.stringify(w.review), JSON.stringify(m.audit)]) assert.doesNotMatch(text, FORECAST)
  assert.match(D.weekKey(Date.UTC(2026, 0, 20, 15)), /^2026-W0[34]$/)
  assert.equal(D.monthKey(Date.UTC(2026, 0, 20, 15)), '2026-01')
})

// Real cases from a scan of synthetic candles, resolved into the vault the way the observer does it — seeded by the second test, after the zero-data test has run.
type Case = ReturnType<typeof cs.casesFromSteps>[number]
let cases: Case[] = []
let top: Case, other: Case
function seed() {
  const candles: Candle[] = syntheticKlines(5, 17, NOW).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
  store().upsertCandles(config.symbol, config.interval, candles, 'rest')
  cases = cs.casesFromSteps(cs.stepEngine(candles, 200), candles, { horizon: 12 }).filter((c) => c.after.candles > 0 && c.after.moveAtr !== null)
  assert.ok(cases.length >= 2, `the scan must find cases with an AFTER frame (found ${cases.length})`)
  ;[top, other] = [cases[0], cases[1]]
  resolve(top, 88)
  resolve(other, 61)
}
const resolvedAt = NOW - 3_600_000
function resolve(c: Case, score: number) {
  vault.addItem(cs.caseStudyItem(c))
  const o = ev.makeObservation({ time: c.at, availableAt: c.knownAt, session: c.before.session, regime: c.before.regime, volatility: c.before.volatility, type: 'STRUCTURE CHANGE', source: 'engine-step', detail: c.during.detail, direction: c.during.direction, evidence: [], caseKind: c.kind, recordId: null, significance: { score, selected: true, reasons: [`score ${score}`, 'test fixture'], basis: {}, note: 'n' }, before: { structureTrend: c.before.structureTrend, liquidity: null, regime: c.before.regime, session: c.before.session, strategiesActive: 0, strategiesNear: 0, risk: null, price: c.before.price } })
  ev.recordObservation(o)
  ev.updateObservation({ ...ev.getObservation(o.id)!, status: 'RESOLVED', caseId: c.id, resolvedAt, resolutionNote: 'horizon stored' })
  return o
}

test('the lesson of the day is the most significant resolved case, BEFORE → DECISION → AFTER, with what it does not teach; the digest lists the cases', () => {
  seed()
  const d = D.buildDailyDigest([], NOW, {})
  assert.ok(d.lessonOfTheDay, 'a case resolved today gives a lesson')
  const l = d.lessonOfTheDay!
  assert.equal(l.caseId, top.id)
  assert.equal(l.significance, 88)
  assert.ok(l.before && l.decision && l.after && l.teaches)
  assert.ok(!l.before.includes(top.after.note), 'BEFORE never carries the AFTER note')
  assert.doesNotMatch(l.before, /max up|max down|Over \d+ candle/, 'BEFORE carries no outcome measure')
  assert.ok(l.doesNotTeach.some((x) => /one observation/.test(x)))
  assert.ok(l.doesNotTeach.some((x) => /nothing is re-simulated/.test(x)))
  assert.doesNotMatch(l.teaches, FORECAST)
  const sec = d.sections.find((s) => s.heading === 'WHICH CASE STUDIES WERE CREATED')!
  assert.equal(sec.evidenceLabel, 'OBSERVED')
  assert.ok(sec.lines.some((x) => x.includes(top.id)) && sec.lines.some((x) => x.includes(other.id)))
  assert.equal(d.counts.casesResolved, 2)
  // A rebuild for the same day is explicit; the stored digest still says what it said.
  const stored = D.dailyDigest([], NOW)
  assert.equal(stored.isNew, false)
  assert.equal(stored.digest.lessonOfTheDay, null, 'the digest written at zero data is the record for that day until a rebuild is asked for')
  assert.equal(D.dailyDigest([], NOW, { rebuild: true }).digest.lessonOfTheDay?.caseId, top.id)
  const item = D.lessonItem(l, d.dayKey)
  assert.equal(item.id, `lesson:of-the-day:${d.dayKey}`)
  assert.ok(item.tags.includes('memory:teaching'))
})

test('lessons are versioned as the record grows: a snapshot is appended only when the content moves, with a diff in words, and v1 stays', () => {
  const conceptId = curriculum.conceptsForCaseKind(top.kind)[0].id
  const empty = lessons.buildLesson(conceptId, { cases: [], now: NOW })!
  const v1 = U.snapshotLesson(empty, NOW)
  assert.equal(v1.isNew, true); assert.equal(v1.version.version, 1); assert.deepEqual(v1.version.diff, [])
  assert.equal(U.snapshotLesson(empty, NOW + 1000).isNew, false, 'same content, no new version')
  const full = lessons.buildLesson(conceptId, { cases, now: NOW + DAY })!
  const v2 = U.snapshotLesson(full, NOW + DAY)
  assert.equal(v2.isNew, true); assert.equal(v2.version.version, 2)
  assert.ok(v2.version.diff.some((x) => /Examples: \d+ added|Tally|New section/.test(x)), v2.version.diff.join(' | '))
  const vs = U.lessonVersions(conceptId)
  assert.equal(vs.length, 2)
  assert.equal(vs[0].hash, v1.version.hash, 'v1 is untouched')
  assert.ok(U.curriculumChanges(NOW + DAY - 1).some((c) => c.conceptId === conceptId && c.versions === 2))
})

test('exercises come from resolved cases: BEFORE and DURING are shown, the answer is the stored AFTER, and no choice is a forecast', () => {
  const { exercises, note } = U.caseExercises()
  assert.equal(exercises.length, 2, note)
  for (const ex of exercises) {
    assert.equal(ex.choices.length, 4)
    assert.ok(ex.answer >= 0 && ex.answer < 4)
    assert.doesNotMatch(ex.prompt, /\bwill\b/)
    for (const c of ex.choices) assert.doesNotMatch(c, /\bwill\b|should|expect/)
    assert.ok(ex.shown.includes('BEFORE') && ex.shown.includes('DURING') && !ex.shown.includes('AFTER:'))
    const pub = U.publicExercise(ex)
    assert.ok(!('answer' in pub) && !('why' in pub))
    assert.equal(U.gradeCaseExercise(ex, ex.answer).correct, true)
    assert.equal(U.gradeCaseExercise(ex, (ex.answer + 1) % 4).correct, false)
    assert.match(ex.why, /never about what will/)
  }
  assert.equal(U.caseExercises({ conceptId: 'no-such-concept' }).exercises.length, 0)
  assert.equal(config.live.enabled, false)
})
