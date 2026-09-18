/**
 * THE PHASE 23 ACCEPTANCE WORKFLOW — 23 steps, in order, in one process,
 * over a temporary data directory with zero paper trades at the start.
 *
 * It walks the whole continuous-learning system the way a reviewer would:
 * the gates first, then the school, the replay school, the debate and the
 * teacher, the research lab, the knowledge vault and the reviews, then a
 * simulated paper close through the real observer, then the reassessment,
 * and finally the proof that nothing in the engine or its configuration
 * changed. Each step is a named sub-test so a failure says which promise
 * broke. docs/CONTINUOUS_LEARNING_ACCEPTANCE.md lists the same 23 steps.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'

const tmp = tempDataDir('mrcash-accept-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const api = await import('../../src/learning/api.ts')
const cs = await import('../../src/school/caseStudies.ts')
const vault = await import('../../src/knowledge/vault.ts')
const H = await import('../../src/research/hypotheses.ts')
const { hindsightFindings } = cs
after(() => tmp.cleanup())

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '..', '..')
const NOW = Date.UTC(2026, 0, 20, 15, 0)
const configBefore = JSON.stringify(config)

// Stored candles for the scan and the replay school: 16 synthetic days through NOW.
store().upsertCandles(config.symbol, config.interval, syntheticKlines(16, 21, NOW).map((k) => ({ openTime: k[0], closeTime: k[6], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5] })), 'rest')

test('01 — the live and shadow gates are off and stay off for the whole workflow', () => {
  assert.equal(config.live.enabled, false)
  assert.equal(config.shadow.enabled, false)
  assert.notEqual(process.env.LIVE_TRADING_ENABLED, 'true')
})

test('02 — the school index lists the curriculum with mastery UNSEEN and a 0–9 data-growth band', () => {
  const s = api.schoolIndex()
  assert.ok(s.concepts.length >= 20)
  assert.ok(s.concepts.every((c) => c.mastery.level === 'UNSEEN'))
  assert.equal(s.dataGrowth.band, '0–9')
  assert.deepEqual(s.graph.dangling, [])
})

test('03 — a lesson in zero-data mode teaches from the concept and history, labels every section, and says NOT ENOUGH DATA for paper', () => {
  const l = api.schoolLesson('liquidity-sweep', NOW)
  assert.ok(l.sections.every((s) => s.evidenceLabel && s.provenance))
  assert.equal(l.paperEvidence!.status, 'NOT ENOUGH DATA')
  assert.ok(l.quiz.every((q) => !('answer' in q)))
})

test('04 — a quiz is graded on the server and counted as engagement, not skill', () => {
  const g = api.schoolQuiz({ conceptId: 'sample-size', answers: { 'ss-1': 1, 'ss-2': 2 } }, NOW)
  assert.equal(g.correct, 2)
  assert.match(g.note, /nothing about whether the concept makes money/)
  assert.equal(api.schoolIndex().concepts.find((c) => c.id === 'sample-size')!.mastery.level, 'PRACTISING')
})

test('05 — every case study passes the no-hindsight audit', () => {
  const all = api.allCases(NOW)
  assert.ok(all.length > 0, 'the stored candles yield case studies')
  for (const c of all) assert.deepEqual(hindsightFindings(c), [], c.id)
})

test('06 — counterexamples pair what went the concept\'s way with what did not, and the tally states no share under 10', () => {
  const cx = api.schoolCounterexamples(null, NOW)
  for (const p of cx.pairs) { assert.equal(p.example.after.wentExpectedWay, true); assert.equal(p.counterexample.after.wentExpectedWay, false) }
  const cases = api.schoolCases({}, NOW)
  for (const t of cases.tally) if (t.n < 10) assert.equal(t.share, null)
})

test('07 — a replay stop contains nothing from the event candle onward', () => {
  const r = api.schoolReplay(NOW)
  if (!r.lesson.stops.length) { assert.match(r.note, /NOT ENOUGH DATA/); return }
  const stop = api.schoolReplayStop(0, NOW)
  const raw = JSON.stringify(stop)
  assert.ok(!raw.includes('"answer"') && !raw.includes('"after"') && !raw.includes('"during"'))
  for (const a of stop.frame.annotations) assert.ok(a.knownAt <= stop.cursor)
})

test('08 — answering a replay stop reveals the engine\'s reading and the outcome, audited', () => {
  const r = api.schoolReplay(NOW)
  if (!r.lesson.stops.length) return
  const stop = api.schoolReplayStop(0, NOW)
  const ans = api.schoolReplayAnswer({ k: 0, choice: stop.stop.question.choices[0] }, NOW)
  assert.equal(typeof ans.correct, 'boolean')
  assert.deepEqual(ans.hindsight, [])
  assert.ok(ans.after.candles > 0)
})

test('09 — the market debate\'s judge is the fused decision, restated', () => {
  const steps = cs.stepEngine(api.historyCandles(2, NOW), 20)
  const last = steps[steps.length - 1]
  const m = api.schoolDebate({ candles: [], analysis: last.analysis, signal: last.analysis.signal, news: null, plan: null, engine: null, flow: null, state: null, strategyVotes: last.votes ?? [], decision: last.decision ?? null })
  assert.equal(m.judge.engineDecision, last.decision!.action)
  assert.equal(m.provenance, 'ENGINE')
})

test('10 — the teacher without a model returns the lesson\'s own text, cited; an inventing model is replaced', async () => {
  const a = await api.schoolTeach({ question: 'What is a sweep?', conceptId: 'liquidity-sweep' }, null, undefined, NOW)
  assert.equal(a.source, 'deterministic')
  assert.ok(a.citations.length >= 1)
  const b = await api.schoolTeach({ question: 'q', conceptId: 'liquidity-sweep' }, null, async () => 'Sweeps win 80% of the time, go long. [[section:What it is]]', NOW)
  assert.equal(b.source, 'deterministic')
  assert.ok(b.problems.length > 0)
})

test('11 — "why is this here" maps chart objects and strategies to concepts', () => {
  assert.ok(api.schoolWhy({ type: 'fvg-bullish' }).concepts.some((c) => c.id === 'fair-value-gap'))
  assert.ok(api.schoolWhy({ strategy: 'silver-bullet' }).concepts.some((c) => c.id === 'silver-bullet-window'))
})

test('12 — the research lab drafts no question from zero data', () => {
  const r = api.researchIndex(null, NOW)
  assert.deepEqual(r.questions, [])
  assert.equal(r.trials.total, 0)
})

test('13 — a hypothesis is drafted UNTESTED with every required field; banned words are refused', () => {
  assert.throws(() => api.researchCreateHypothesis({ question: 'Is London the best?', hypothesis: 'x', nullHypothesis: 'y', direction: 'positive' }, NOW), /best/)
  const h = api.researchCreateHypothesis({ question: 'Does London have a positive mean R?', hypothesis: 'London mean R is positive.', nullHypothesis: 'London mean R is zero.', direction: 'positive', cohortFilters: [{ dimension: 'session', values: ['london'] }], session: 'london' }, NOW)
  assert.equal(h.status, 'UNTESTED')
  assert.deepEqual([...H.HYPOTHESIS_STATUSES], ['UNTESTED', 'TESTING', 'INSUFFICIENT DATA', 'OBSERVED IN SAMPLE', 'NOT SUPPORTED', 'OOS SUPPORTED', 'UNDER REVIEW', 'STALE', 'REJECTED'])
})

test('14 — the out-of-sample check at zero trades is INSUFFICIENT DATA, never a number', () => {
  const h = api.researchHypotheses({})[0]
  const t = api.researchTestHypothesis({ id: h.id, stage: 'outOfSample' }, NOW)
  assert.equal(t.status, 'INSUFFICIENT DATA')
  assert.equal(t.outOfSample!.meanR, null)
})

test('15 — the overfitting detector says NOT ENOUGH DATA without a backtest and the deflation bar rises with trials', () => {
  const o = api.researchOverfitting(null)
  assert.equal(o.deflated, null)
  for (let i = 1; i < o.curve.length; i++) assert.ok(o.curve[i].benchmarkSharpe > o.curve[i - 1].benchmarkSharpe)
})

test('16 — the regime atlas is empty at zero data and the diffusion fit refuses under the minimum events', () => {
  assert.equal(api.researchAtlas({ dim: 'volatility' }).rows.length, 0)
  assert.equal(api.researchDiffusion(NOW).fit.status, 'INSUFFICIENT DATA')
})

test('17 — a proposal fails its gates at zero data and cannot be approved; a failed gate is named', () => {
  const p = api.researchCreateProposal({ kind: 'parameter-variant', strategyId: 'silver-bullet', title: 'RR 2.5', rationale: 'r', change: 'rr 2 → 2.5', params: { rr: 2.5 } }, NOW)
  assert.equal(p.status, 'GATES FAILED')
  assert.equal(p.requires, 'HUMAN APPROVAL')
  assert.throws(() => api.researchDecideProposal({ id: p.id, decision: 'APPROVED', by: 'gt', note: 'x' }, NOW), /only a PROPOSED proposal/)
})

test('18 — the knowledge vault, brief, end of day and weekly review all answer at zero data with labels', () => {
  assert.equal(api.knowledgeIndex({}).summary.total >= 0, true)
  assert.equal(api.knowledgeBrief(NOW).record.evidenceLabel, 'INSUFFICIENT DATA')
  assert.equal(api.knowledgeEndOfDay(NOW).trades.evidenceLabel, 'INSUFFICIENT DATA')
  assert.equal(api.knowledgeWeekly(NOW).record.evidenceLabel, 'INSUFFICIENT DATA')
})

test('19 — the living passport says NOT ENOUGH DATA and what would change that', () => {
  const p = api.knowledgePassport('silver-bullet', NOW)
  assert.ok('status' in p.paper && p.paper.status === 'NOT ENOUGH DATA')
  assert.ok(p.wouldChange.length >= 1)
})

test('20 — a simulated paper close runs the learning loop: a post-mortem in the vault, evidence counted, hypothesis untouched outside its cohort', () => {
  const closed: PaperPosition = { id: 'acc-1', openedAt: NOW - 3_600_000, dayKey: '2026-01-20', session: 'New York AM', setupKey: 'BTCUSDT|5m|silver-bullet|long', direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'acceptance', atr: 0.5, status: 'closed', filledAt: NOW - 3_300_000, strategyId: 'silver-bullet', regime: 'trending-up', closedAt: NOW - 600_000, exit: 99, exitReason: 'stop', rMultiple: -1, pnlUsd: -1, feesUsd: 0.01, outcome: 'LOSS', candlesHeld: 9, snapshot: { signalId: 'acc', symbol: 'BTCUSDT', interval: '5m', engineVersion: '2.3.0', featureVersion: 1, volatility: 'normal', fusedScore: 80, fusedAction: 'LONG', confirms: [], invalidates: [], contributors: [], evidence: [], riskChecks: [], riskVetoedBy: null, newsMinutes: null, inBlackout: false } }
  store().savePosition(closed)
  const bf = api.knowledgeBackfill(NOW)
  assert.equal(bf.observed, 1)
  const items = vault.listItems({ kind: 'lesson' })
  assert.equal(items.length, 1)
  assert.match(items[0].title, /loss-on-full-checklist/)
  assert.match(items[0].body, /Cannot conclude/)
  const h = api.researchHypotheses({})[0]
  assert.equal(h.status, 'INSUFFICIENT DATA', 'a New York trade is outside the London cohort; the hypothesis is untouched')
  assert.equal(api.knowledgeBackfill(NOW).observed, 0, 'idempotent')
})

test('21 — the reassessment expires what was not reviewed and deletes nothing', () => {
  const old = vault.addItem({ kind: 'regime-observation', title: 'Old', body: 'x', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER' }, now: NOW - 2 * vault.REVIEW.afterMs })
  const r = api.knowledgeReassess(NOW)
  assert.ok(r.staleItems.includes(old.id))
  assert.equal(vault.getItem(old.id)!.status, 'STALE')
  assert.ok(vault.getItem(old.id)!.history.some((h) => h.event === 'stale'))
})

test('22 — the vault remembers what did not work, and a review keeps the old body', () => {
  vault.addItem({ kind: 'failed-hypothesis', title: 'Turtle soup after equal highs', body: 'Not supported OOS.', evidenceLabel: 'SIMULATED', provenance: { source: 'BACKTEST' }, now: NOW })
  assert.ok(api.knowledgeIndex({}).summary.failed >= 1)
  const it = vault.listItems({ kind: 'failed-hypothesis' })[0]
  const revised = api.knowledgeReview({ id: it.id, outcome: 'REVISED', note: 'n', body: 'Still not supported; second window agrees.' }, NOW)
  assert.equal(revised.version, 2)
  assert.match(revised.history[revised.history.length - 1].detail, /previous body/)
})

test('23 — nothing in the engine changed: config identical, engine reads none of the learning stores, gates still off', () => {
  assert.equal(JSON.stringify(config), configBefore)
  assert.equal(config.live.enabled, false)
  assert.equal(config.shadow.enabled, false)
  const engineFiles = ['src/ictStrategy.ts', 'src/fusion.ts', 'src/riskEngine.ts', 'src/execution.ts', 'src/paperTrader.ts', 'src/live/trader.ts']
  for (const f of engineFiles) {
    const body = readFileSync(join(ROOT, f), 'utf8')
    assert.equal(/from '\.{1,2}\/(?:\.\.\/)*(school|research|knowledge|learning)\//.test(body), false, `${f} imports a learning layer`)
    assert.equal(/knowledge:|hypothesis:|proposal:|learning:|research:trials/.test(body), false, `${f} reads a learning store key`)
  }
})
