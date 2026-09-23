/**
 * THE MARKET DEBATE and THE AI TEACHER — the debate restates the engine's own
 * reasons with the engine as judge; the teacher can only say what the context
 * says, and a model that invents, decides or predicts is replaced.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { Candle } from '../../src/types.ts'

const tmp = tempDataDir('mrcash-teacher-')
process.env.MRCASH_DATA_DIR = tmp.dir
const deb = await import('../../src/school/debate.ts')
const tch = await import('../../src/school/teacher.ts')
const cs = await import('../../src/school/caseStudies.ts')
const les = await import('../../src/school/lessons.ts')
after(() => tmp.cleanup())

const NOW = Date.UTC(2026, 0, 20, 15, 0)
const candles: Candle[] = syntheticKlines(4, 13, NOW).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
const steps = cs.stepEngine(candles, 50)
const last = steps[steps.length - 1]
const cases = cs.casesFromSteps(steps, candles, { horizon: 12 })

test('the debate restates the engine: every point has a source, the judge is the fused decision, and nothing is a forecast', () => {
  const m = deb.marketDebate({ analysis: last.analysis, votes: last.votes ?? [], decision: last.decision ?? null, now: last.candle.closeTime })
  assert.equal(m.provenance, 'ENGINE')
  assert.equal(m.judge.engineDecision, last.decision!.action)
  assert.equal(m.judge.score, last.decision!.score)
  assert.deepEqual(m.judge.wouldFlip, last.decision!.invalidates)
  for (const s of [m.bull, m.bear, m.neutral]) for (const p of s.points) { assert.ok(p.source.length > 0); assert.ok(p.basis.length > 0); assert.ok(['REAL', 'ESTIMATED'].includes(p.quality)) }
  assert.match(m.note, /Nothing here is a forecast/)
  assert.match(deb.renderDebate(m), /JUDGE: /)
  // The strategies that voted BUY/SELL appear on their side with their confidence as backing.
  const buys = (last.votes ?? []).filter((v) => v.action === 'BUY')
  assert.equal(m.bull.backing, buys.reduce((a, v) => a + v.confidence, 0))
  const none = deb.marketDebate({ analysis: null, votes: [], decision: null })
  assert.equal(none.judge.engineDecision, 'NO ENGINE')
  assert.ok(none.unknowns.length >= 1)
})

test('the debate places fusion confirms on the decided side and invalidates on the other; a blackout is a neutral point', () => {
  const decision = { action: 'LONG' as const, direction: 'long' as const, score: 72, confirms: ['two session strategies agree'], invalidates: ['spread is wide'], contributors: [], reason: 'r', regime: null, enterScore: 60 }
  const m = deb.marketDebate({ analysis: null, votes: [], decision, news: { fetchedAt: 0, fromCache: false, calendar: [], headlines: [], standouts: [], blackouts: [{ start: NOW + 10 * 60_000, end: NOW + 40 * 60_000, title: 'CPI' }], errors: [] }, now: NOW })
  assert.ok(m.bull.points.some((p) => p.text === 'two session strategies agree' && p.basis === 'confirms'))
  assert.ok(m.bear.points.some((p) => p.text === 'spread is wide' && p.basis === 'invalidates'))
  assert.ok(m.neutral.points.some((p) => p.source === 'news' && /CPI/.test(p.text)))
  assert.equal(m.judge.engineDecision, 'LONG')
})

const lesson = les.buildLesson('liquidity-sweep', { cases, now: NOW })!
const caseStudy = cases.find((c) => c.evidenceLevel === 'OBSERVED') ?? cases[0] ?? null

test('the deterministic teaching is always valid and is the fallback without a model', async () => {
  const ctx = { question: 'What is a sweep?', lesson, caseStudy }
  const text = tch.deterministicTeaching(ctx)
  const v = tch.validateTeacherAnswer(text, ctx)
  assert.equal(v.valid, true, v.problems.join('; '))
  const a = await tch.teach(ctx)
  assert.equal(a.source, 'deterministic')
  assert.equal(a.valid, true)
  assert.ok(a.citations.length >= 1)
  assert.match(tch.deterministicTeaching({ question: 'x' }), /NOT ENOUGH DATA/)
})

test('a model answer that invents a figure, cites a missing section, predicts direction, uses a banned word or recommends is REPLACED', async () => {
  const ctx = { question: 'q', lesson, engineDecision: 'NO TRADE' }
  const heading = lesson.sections[0].heading
  const cases_: Array<[string, RegExp]> = [
    [`A sweep wins 73% of the time. [[section:${heading}]]`, /figure 73 is not in the context/],
    ['A sweep is a wick through a level. [[section:Made Up]]', /not in the lesson/],
    [`After a sweep price is bullish. [[section:${heading}]]`, /states a direction|quality claim/],
    [`This is a proven setup. [[section:${heading}]]`, /banned word "proven"/],
    [`You should take the trade here. [[section:${heading}]]`, /recommends an action|mentions/],
    [`The engine decision is LONG. [[section:${heading}]]`, /mentions LONG while the engine's decision is NO TRADE/],
    ['A sweep is a wick through a level with a close back.', /no citation/],
  ]
  for (const [bad, why] of cases_) {
    const v = tch.validateTeacherAnswer(bad, ctx)
    assert.equal(v.valid, false, bad)
    assert.ok(v.problems.some((p) => why.test(p)), `${bad} → ${v.problems.join('; ')}`)
    const a = await tch.teach(ctx, async () => bad)
    assert.equal(a.source, 'deterministic', `replaced: ${bad}`)
    assert.ok(a.problems.length > 0)
  }
  const good = `The engine says NO TRADE. A sweep is a wick through a marked level that closes back on the original side. [[section:${heading}]]`
  const ok = await tch.teach(ctx, async () => good)
  assert.equal(ok.source, 'ai')
  assert.equal(ok.valid, true)
  const broken = await tch.teach(ctx, async () => { throw new Error('model down') })
  assert.equal(broken.source, 'deterministic')
  assert.match(tch.TEACHER_SYSTEM, /do NOT make trading decisions/)
  assert.match(tch.buildTeacherPrompt(ctx), /\[\[section:/)
})
