/**
 * THE HYPOTHESIS ENGINE — status is derived from results, never set to
 * something flattering; the banned words are refused; every change is versioned.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'

const tmp = tempDataDir('mrcash-hyp-')
process.env.MRCASH_DATA_DIR = tmp.dir
const H = await import('../../src/research/hypotheses.ts')
after(() => tmp.cleanup())

const T0 = Date.UTC(2026, 0, 13, 13, 30)
const input = (over: Partial<Parameters<typeof H.makeHypothesis>[0]> = {}): Parameters<typeof H.makeHypothesis>[0] => ({
  question: 'Does Silver Bullet behave differently in London?',
  observation: 'Observed mean +0.30R over 18 PAPER trades in London.',
  hypothesis: 'Silver Bullet trades decided in London have a positive mean R.',
  nullHypothesis: 'The mean R of Silver Bullet trades in London is zero.',
  direction: 'positive',
  dataset: { source: 'PAPER', label: 'SOURCE: PAPER · TRADES: 18' },
  cohortFilters: [{ dimension: 'strategyId', values: ['silver-bullet'] }, { dimension: 'session', values: ['london'] }],
  method: 'cohort mean with 95% t-interval',
  strategy: 'silver-bullet', session: 'london', now: T0, ...over,
})
const mk = (over: Partial<Parameters<typeof H.makeHypothesis>[0]> = {}) => H.makeHypothesis(input(over))
const result = (over: Partial<Parameters<typeof H.recordStage>[2]> = {}): Parameters<typeof H.recordStage>[2] => ({
  at: T0, source: 'PAPER', dataType: 'LIVE MARKET / SIMULATED EXECUTION', trades: 40, sampleStatus: 'EARLY SAMPLE',
  meanR: 0.6, ci95: { lo: 0.2, hi: 1.0 }, method: 'cohort mean with 95% t-interval', recordIds: ['p1'], note: 'in sample', ...over,
})

test('a hypothesis is created UNTESTED with every required field and a review date', () => {
  const h = mk()
  assert.equal(h.status, 'UNTESTED')
  assert.equal(h.version, 1)
  assert.equal(h.nextReview, T0 + H.HYPOTHESIS_REVIEW_MS)
  for (const k of ['question', 'observation', 'hypothesis', 'nullHypothesis', 'dataset', 'markets', 'timeframes', 'dateRange', 'strategy', 'regime', 'session', 'sampleSize', 'method', 'inSample', 'outOfSample', 'walkForward', 'robustness', 'counterevidence', 'limitations', 'status', 'version', 'created', 'lastReviewed', 'nextReview']) {
    assert.ok(k in h, `missing field ${k}`)
  }
  assert.match(H.renderHypothesis(h), /NULL HYPOTHESIS/)
})

test('the banned words are refused in any text field', () => {
  for (const w of ['proven', 'guaranteed', 'certain', 'best', 'perfect', 'fail-proof', 'failproof']) {
    assert.throws(() => mk({ hypothesis: `Silver Bullet is ${w} in London.` }), /is not a word a hypothesis may use/, w)
  }
  assert.throws(() => H.recordStage(mk(), 'inSample', result({ note: 'a proven result' }), T0), /proven/)
  assert.throws(() => H.reject(mk(), 'the best idea', T0), /best/)
  assert.deepEqual([...H.HYPOTHESIS_STATUSES], ['UNTESTED', 'TESTING', 'INSUFFICIENT DATA', 'OBSERVED IN SAMPLE', 'NOT SUPPORTED', 'OOS SUPPORTED', 'UNDER REVIEW', 'STALE', 'REJECTED'])
})

test('status is derived from the results: insufficient → observed in sample → OOS supported, or NOT SUPPORTED', () => {
  let h = mk()
  h = H.recordStage(h, 'inSample', result({ trades: 6, sampleStatus: 'INSUFFICIENT SAMPLE', ci95: { lo: -0.5, hi: 1.5 } }), T0)
  assert.equal(h.status, 'INSUFFICIENT DATA')
  h = H.recordStage(h, 'inSample', result(), T0 + 1)
  assert.equal(h.status, 'OBSERVED IN SAMPLE')
  const supported = H.recordStage(h, 'outOfSample', result({ source: 'BACKTEST', dataType: 'SIMULATED', trades: 60, sampleStatus: 'DEVELOPING DATASET', meanR: 0.4, ci95: { lo: 0.1, hi: 0.7 } }), T0 + 2)
  assert.equal(supported.status, 'OOS SUPPORTED')
  const refuted = H.recordStage(h, 'outOfSample', result({ source: 'BACKTEST', dataType: 'SIMULATED', trades: 60, meanR: -0.5, ci95: { lo: -0.9, hi: -0.1 } }), T0 + 2)
  assert.equal(refuted.status, 'NOT SUPPORTED')
  assert.equal(refuted.counterevidence.length, 1, 'a contradicting result is recorded as counterevidence, not dropped')
  const straddling = H.recordStage(h, 'outOfSample', result({ source: 'BACKTEST', dataType: 'SIMULATED', trades: 60, meanR: 0.1, ci95: { lo: -0.2, hi: 0.4 } }), T0 + 2)
  assert.equal(straddling.status, 'OBSERVED IN SAMPLE', 'an OOS interval that includes zero neither supports nor refutes; the in-sample observation stands as what it is')
  assert.equal(supported.version, 4, 'created v1 → in-sample v2 → in-sample v3 → out-of-sample v4')
  assert.equal(supported.sampleSize, 60)
})

test('direction matters: a negative hypothesis is supported by a negative interval', () => {
  const h = H.recordStage(mk({ direction: 'negative', hypothesis: 'Mean R in Asia is negative.' }), 'inSample', result({ meanR: -0.4, ci95: { lo: -0.7, hi: -0.1 } }), T0)
  assert.equal(h.status, 'OBSERVED IN SAMPLE')
  assert.equal(H.verdictOf({ direction: 'positive' }, result({ meanR: -0.4, ci95: { lo: -0.7, hi: -0.1 } })), 'contradicts')
  assert.equal(H.verdictOf({ direction: 'difference' }, result({ ci95: { lo: -0.7, hi: -0.1 } })), 'supports')
  assert.equal(H.verdictOf({ direction: 'positive' }, null), 'insufficient')
})

test('new evidence flags UNDER REVIEW; a review re-derives; stale expires; rejected is final', () => {
  let h = H.recordStage(mk(), 'inSample', result(), T0)
  h = H.flagForReview(h, '12 new paper trades closed in this cohort.', T0 + 5)
  assert.equal(h.status, 'UNDER REVIEW')
  assert.equal(H.deriveStatus(h, T0 + 5), 'UNDER REVIEW', 'a review flag is not overwritten by derivation')
  const reviewed = H.reviewHypothesis(h, 'Re-ran the cohort.', T0 + 10)
  assert.equal(reviewed.status, 'OBSERVED IN SAMPLE')
  assert.equal(reviewed.nextReview, T0 + 10 + H.HYPOTHESIS_REVIEW_MS)
  const stale = H.markStale(reviewed, T0 + 10 + H.HYPOTHESIS_REVIEW_MS)
  assert.equal(stale.status, 'STALE')
  assert.equal(H.deriveStatus(reviewed, T0 + 10 + H.HYPOTHESIS_REVIEW_MS), 'STALE')
  const rejected = H.reject(reviewed, 'Cohort was cherry-picked after the fact.', T0 + 20)
  assert.equal(rejected.status, 'REJECTED')
  assert.equal(H.flagForReview(rejected, 'x', T0 + 30).status, 'REJECTED')
  assert.equal(H.deriveStatus(rejected, T0 + 30), 'REJECTED')
})

test('robustness and counterevidence append and version; the store round-trips and sweeps', () => {
  let h = H.createHypothesis(input({ now: T0 }))
  h = H.saveHypothesis(H.recordRobustness(h, { at: T0, walkForward: { folds: 4, trades: 80, combinedOosAvgR: 0.2 }, monteCarlo: { samples: 2000, totalRp5: -3, totalRp95: 25, profitableShare: 0.82 }, note: 'walk-forward and Monte Carlo from the backtest report' }, T0))
  h = H.saveHypothesis(H.addCounterevidence(h, 'The 2025-11 window showed the opposite sign.', T0))
  const back = H.getHypothesis(h.id)!
  assert.equal(back.walkForward!.folds, 4)
  assert.equal(back.counterevidence.length, 1)
  assert.ok(back.version >= 3)
  assert.equal(H.listHypotheses({ strategy: 'silver-bullet' }).length, 1)
  const old = H.saveHypothesis(H.recordStage(mk({ question: 'An old one?', now: T0 - 2 * H.HYPOTHESIS_REVIEW_MS }), 'inSample', result({ at: T0 - 2 * H.HYPOTHESIS_REVIEW_MS }), T0 - 2 * H.HYPOTHESIS_REVIEW_MS))
  const swept = H.sweepStaleHypotheses(T0)
  assert.ok(swept.some((s) => s.id === old.id && s.status === 'STALE'))
})
