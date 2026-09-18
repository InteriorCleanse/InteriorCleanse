/**
 * THE NARRATOR — every sentence traceable to a row, or not said.
 *
 * The adversarial half of this file is the point: an AI (or a bug) that
 * invents a figure, cites a cohort that does not exist, calls a direction,
 * asserts a cause, or describes eight trades as an edge must be REJECTED by
 * the validator, and the reader must get the deterministic text instead.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPosition } from '../../src/paperTrader.ts'
import { paperDataset } from '../../src/analyst/records.ts'
import { cohort, byDimension } from '../../src/analyst/cohorts.ts'
import { thesisFor } from '../../src/analyst/thesis.ts'
import { narrateEvidence, validateNarration, narrateWithAi, claimFor, allowedFigures } from '../../src/analyst/narrate.ts'

let n = 0
function pos(r: number, over: Partial<PaperPosition> = {}): PaperPosition {
  n++
  return {
    id: `p${n}`, openedAt: 1_700_000_000_000 + n * 3_600_000, closedAt: 1_700_000_000_000 + n * 3_600_000 + 60_000, dayKey: 'D', session: 'London',
    setupKey: 'BTCUSDT|5m|silver-bullet|BUY', direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1,
    quality: 70, reason: '', atr: 1, status: 'closed', exitReason: r > 0 ? 'target' : 'stop', exit: 100 + r, rMultiple: r, pnlUsd: r, feesUsd: 0,
    outcome: r > 0.001 ? 'WIN' : r < -0.001 ? 'LOSS' : 'FLAT', strategyId: 'silver-bullet', regime: 'trending-up', ...over,
  } as PaperPosition
}
const seq = (k: number, over: Partial<PaperPosition> = {}) => Array.from({ length: k }, (_, i) => pos(i % 3 === 2 ? -1 : 2, over))

function ctxOf(ps: PaperPosition[]) {
  const dataset = paperDataset(ps)
  const cohorts = byDimension(dataset, 'session').rows
  return { dataset, cohorts, theses: cohorts.map((c) => thesisFor(c)) }
}

test('zero trades narrates as NOT ENOUGH DATA and nothing else', () => {
  const nar = narrateEvidence(ctxOf([]))
  assert.equal(nar.notEnoughData, true)
  assert.match(nar.summary, /^NOT ENOUGH DATA\. 0 PAPER trades on record\./)
  assert.deepEqual(nar.claims, [])
  assert.equal(nar.valid, true)
})

test('the deterministic narration is valid by construction: every figure is one its cohort holds', () => {
  const ctx = ctxOf([...seq(18, { session: 'London' }), ...seq(6, { session: 'Asia' })])
  const nar = narrateEvidence(ctx)
  assert.equal(nar.valid, true, nar.problems.join('; '))
  assert.equal(nar.source, 'deterministic')
  assert.match(nar.summary, /24 PAPER trades on record \(LIVE MARKET \/ SIMULATED EXECUTION\)\. \[\[dataset:PAPER\]\]/)
  const london = nar.claims.find((c) => c.text.startsWith('london'))!
  assert.match(london.text, /18 PAPER trades with a mean of \+\d\.\d\dR/)
  assert.match(london.text, /\[\[cohort:london\]\]$/)
  assert.match(london.text, /Sample status: EARLY SAMPLE/)
  const asia = nar.claims.find((c) => c.text.startsWith('asia'))!
  assert.match(asia.text, /Sample status: INSUFFICIENT SAMPLE/)
})

test('a claim about an empty cohort is NOT ENOUGH DATA', () => {
  const c = cohort(paperDataset([]), { name: 'nothing', filters: [] })
  assert.match(claimFor(c).text, /NOT ENOUGH DATA — 0 trades/)
})

// ---------------------------------------------------------------
// Adversarial: what the validator must reject
// ---------------------------------------------------------------

const ctx = ctxOf(seq(18, { session: 'London' }))
const london = ctx.cohorts[0]

test('an invented figure is rejected, even when the citation is right', () => {
  const v = validateNarration('london: 18 trades with a mean of +0.95R. [[cohort:london]]', ctx)
  assert.equal(v.valid, false)
  assert.ok(v.problems.some((p) => /"\+0\.95" is not a figure the cited evidence holds/.test(p)), v.problems.join('; '))
  // The real figure passes.
  const real = `london: 18 trades with a mean of ${london.stats.meanR! >= 0 ? '+' : ''}${london.stats.meanR!.toFixed(2)}R. [[cohort:london]]`
  assert.equal(validateNarration(real, ctx).valid, true)
})

test('a figure without a citation is rejected as unsourced', () => {
  const v = validateNarration('The London cohort has 18 trades.', ctx)
  assert.equal(v.valid, false)
  assert.match(v.problems[0], /without a citation/)
})

test('a citation to a cohort that does not exist is rejected', () => {
  const v = validateNarration('tokyo: 18 trades. [[cohort:tokyo]]', ctx)
  assert.equal(v.valid, false)
  assert.match(v.problems[0], /Cites something not in the evidence: cohort:tokyo/)
})

test('quality words, direction calls and causal claims are each rejected', () => {
  for (const [text, re] of [
    ['london is profitable. [[cohort:london]]', /quality word/],
    ['london shows a high edge. [[cohort:london]]', /quality word/],
    ['london is proven. [[cohort:london]]', /quality word/],
    ['Go long in london. [[cohort:london]]', /direction/],
    ['london is bullish. [[cohort:london]]', /direction/],
    ['london did well because of volatility. [[cohort:london]]', /cause/],
    ['The result is due to the regime. [[cohort:london]]', /cause/],
  ] as const) {
    const v = validateNarration(text, ctx)
    assert.equal(v.valid, false, text)
    assert.ok(v.problems.some((p) => re.test(p)), `${text} → ${v.problems.join('; ')}`)
  }
})

test('the allowed figures for a cohort are exactly its own statistics', () => {
  const figs = allowedFigures(london)
  assert.ok(figs.has('18'))
  assert.ok(figs.has(london.stats.meanR!.toFixed(2)))
  assert.ok(figs.has((london.stats.winRate! * 100).toFixed(1)))
  assert.equal(figs.has('99.9'), false)
})

test('an AI that hallucinates is overruled by the deterministic narration, with the problems listed', async () => {
  const liar = async () => 'london: 18 trades with a mean of +3.00R, a proven edge. [[cohort:london]]'
  const nar = await narrateWithAi(ctx, liar)
  assert.equal(nar.source, 'deterministic', 'the AI text must not reach the reader')
  assert.ok(nar.problems.includes('AI narration rejected:'))
  assert.ok(nar.problems.some((p) => /"\+3\.00" is not a figure/.test(p)))
  assert.ok(nar.problems.some((p) => /quality word/.test(p)))
  assert.equal(nar.valid, true, 'the fallback itself is valid')
})

test('an AI that cites honestly is accepted', async () => {
  const honest = async () => `london: ${london.stats.n} PAPER trades, mean ${london.stats.meanR! >= 0 ? '+' : ''}${london.stats.meanR!.toFixed(2)}R, status ${london.stats.status}. [[cohort:london]]`
  const nar = await narrateWithAi(ctx, honest)
  assert.equal(nar.source, 'ai')
  assert.equal(nar.valid, true)
})

test('with zero trades the AI is not even consulted', async () => {
  let called = false
  const nar = await narrateWithAi(ctxOf([]), async () => { called = true; return 'anything' })
  assert.equal(called, false)
  assert.equal(nar.notEnoughData, true)
})

test('an AI that throws yields the deterministic narration with the failure noted', async () => {
  const nar = await narrateWithAi(ctx, async () => { throw new Error('offline') })
  assert.equal(nar.source, 'deterministic')
  assert.ok(nar.problems.some((p) => /AI unavailable: offline/.test(p)))
})

test('theses ride into the narration only when established, and cite both the thesis and the cohort', () => {
  const big = ctxOf(Array.from({ length: 40 }, (_, i) => pos(i % 3 === 2 ? -0.5 : 2, { session: 'London' })))
  const nar = narrateEvidence(big)
  assert.equal(nar.valid, true, nar.problems.join('; '))
  assert.match(nar.summary, /Thesis for london: OBSERVED POSITIVE/)
  assert.match(nar.summary, /\[\[thesis:london\]\] \[\[cohort:london\]\]/)
})
