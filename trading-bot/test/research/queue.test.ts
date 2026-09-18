/**
 * THE RESEARCH QUEUE, MATURITY, RECOMMENDATIONS AND THE REVIEW QUEUE —
 * items are content-addressed and regenerate in place, maturity is derived,
 * priority never reads the size of an edge, recommendations say why / what
 * exists / what is missing / what would answer, and approval changes nothing.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import type { EvidenceRecord } from '../../src/analyst/records.ts'

const tmp = tempDataDir('mrcash-queue-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const Q = await import('../../src/research/queue.ts')
const R = await import('../../src/research/recommend.ts')
const V = await import('../../src/research/review.ts')
const X = await import('../../src/research/experiments.ts')
const H = await import('../../src/research/hypotheses.ts')
const L = await import('../../src/research/lab.ts')
const ev = await import('../../src/observer/events.ts')
const rec = await import('../../src/analyst/records.ts')
after(() => tmp.cleanup())

const T0 = Date.UTC(2026, 0, 1, 13, 30)
const DAY = 86_400_000
function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function r(i: number, over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: `q${i}`, source: 'PAPER', strategyId: 'silver-bullet', family: 'session', symbol: 'BTCUSDT', interval: '5m', session: 'london', regime: i % 2 ? 'trending-up' : 'ranging', volatility: 'normal',
    direction: 'long', decidedAt: T0 + i * 6 * 3_600_000, filledAt: T0 + i * 6 * 3_600_000 + 300_000, closedAt: T0 + i * 6 * 3_600_000 + 1_800_000, hourET: 8, weekdayET: 2,
    intendedEntry: 100, entry: 100, stop: 99, target: 102, exit: 101, exitReason: 'take-profit', rMultiple: 1, outcome: 'WIN', missed: false,
    quality: 85, fusedScore: 80, mtfAligned: null, newsMinutes: null, spreadPct: null, durationMs: 1_500_000,
    mae: { r: -0.3, status: 'OBSERVED', note: '' }, mfe: { r: 1.2, status: 'OBSERVED', note: '' },
    engineVersion: '2.3.0', featureVersion: 1, missing: [], corrupt: false, corruptReason: null, ...over,
  }
}
function population(seed = 3): EvidenceRecord[] {
  const g = rng(seed)
  return Array.from({ length: 120 }, (_, i) => { const london = i % 2 === 0; const rm = (london ? 0.5 : -0.1) + (g() - 0.5) * 2; return r(i, { session: london ? 'london' : 'asia', rMultiple: rm, outcome: rm > 0 ? 'WIN' : 'LOSS', exit: 100 + rm }) })
}
const paper = rec.datasetOf(population())

test('maturity is derived from the hypothesis and its experiments, in the one lifecycle', () => {
  assert.equal(Q.maturityOf(null, []), 'QUESTION')
  const h = H.makeHypothesis({ question: 'q?', observation: 'o', hypothesis: 'h', nullHypothesis: 'n', direction: 'positive', dataset: { source: 'PAPER', label: 'PAPER' }, cohortFilters: [], method: 'm', now: T0 })
  assert.equal(Q.maturityOf(h, []), 'HYPOTHESIS')
  const base = { status: 'DONE', finishedAt: T0, nextTest: T0 + X.REASSESS_MS, robustnessResult: { verdict: 'ROBUST', notes: [] } } as never
  assert.equal(Q.maturityOf(h, [{ ...(base as object), result: 'INSUFFICIENT DATA' } as never], T0), 'INSUFFICIENT DATA')
  assert.equal(Q.maturityOf(h, [{ ...(base as object), result: 'OBSERVED IN SAMPLE' } as never], T0), 'OBSERVED IN SAMPLE')
  assert.equal(Q.maturityOf(h, [{ ...(base as object), result: 'INCONCLUSIVE' } as never], T0), 'OOS TESTING')
  assert.equal(Q.maturityOf(h, [{ ...(base as object), result: 'OOS SUPPORTED' } as never], T0), 'OOS SUPPORTED')
  assert.equal(Q.maturityOf(h, [{ ...(base as object), result: 'OOS SUPPORTED', robustnessResult: { verdict: 'UNTESTED', notes: [] } } as never], T0), 'ROBUSTNESS REVIEW')
  assert.equal(Q.maturityOf(h, [{ ...(base as object), result: 'OOS SUPPORTED' } as never], T0 + X.REASSESS_MS + 1), 'REASSESSMENT')
  assert.equal(Q.maturityOf({ ...h, status: 'UNDER REVIEW' }, [], T0), 'UNDER REVIEW')
  assert.deepEqual([...Q.MATURITY], ['OBSERVATION', 'QUESTION', 'HYPOTHESIS', 'TESTING', 'INSUFFICIENT DATA', 'OBSERVED IN SAMPLE', 'OOS TESTING', 'OOS SUPPORTED', 'ROBUSTNESS REVIEW', 'UNDER REVIEW', 'REASSESSMENT'])
  assert.ok(!Q.MATURITY.some((m) => /PROVEN|GUARANTEED|BEST/.test(m)))
})

test('the queue regenerates in place: cohort questions from the record, content-addressed ids, priorities with reasons, and no profitability input', () => {
  const g1 = Q.generateQueue({ paper, now: T0 + 40 * DAY })
  assert.ok(g1.created >= 1)
  const london = g1.items.find((q) => q.origin === 'cohort' && q.dataset.filters.some((f) => f.dimension === 'session' && f.values.includes('london')))!
  assert.ok(london, 'the London cohort question is queued')
  assert.equal(london.status, 'QUEUED')
  assert.equal(london.maturity, 'QUESTION')
  assert.ok(london.requiredData.have >= 50)
  assert.ok(london.priorityReasons.some((x) => /not a priority input/.test(x)))
  assert.ok(london.priorityReasons.some((x) => /data available/.test(x)))
  const g2 = Q.generateQueue({ paper, now: T0 + 41 * DAY })
  assert.equal(g2.created, 0, 'regeneration creates nothing new')
  assert.ok(g2.updated >= g1.created)
  assert.equal(Q.getQueueItem(london.id)!.createdAt, london.createdAt)
  assert.equal(Q.queueId('Does X?', 'PAPER', []), Q.queueId('does x', 'PAPER', []), 'ids ignore case and punctuation')
})

test('hand hypotheses, observation clusters and due experiments all enter the queue; untestable observation questions are BLOCKED with what is missing', async () => {
  const h = H.createHypothesis({ question: 'Are ranging-regime trades different?', observation: 'o', hypothesis: 'h', nullHypothesis: 'n', direction: 'difference', dataset: { source: 'PAPER', label: 'PAPER' }, cohortFilters: [{ dimension: 'regime', values: ['ranging'] }], method: 'm', now: T0 })
  for (let i = 0; i < 4; i++) {
    ev.recordObservation(ev.makeObservation({ time: T0 + i * DAY, availableAt: T0 + i * DAY, session: 'london', regime: 'breakout', volatility: 'wild', type: 'STRATEGY REJECTION', source: 'strategy-votes', detail: 'd', direction: null, evidence: [{ field: 'x', value: 1 }], caseKind: 'strategy-rejection', recordId: null, significance: { score: 70, selected: true, reasons: ['r'], basis: {}, note: 'n' }, before: { structureTrend: null, liquidity: null, regime: 'breakout', session: 'london', strategiesActive: 0, strategiesNear: 1, risk: null, price: null }, refId: `rej${i}` }))
    ev.recordObservation(ev.makeObservation({ time: T0 + i * DAY + 1000, availableAt: T0 + i * DAY + 1000, session: 'london', regime: 'breakout', volatility: 'wild', type: 'UNUSUAL MAE', source: 'paper-trader', detail: 'd', direction: 'long', evidence: [{ field: 'x', value: 1 }], caseKind: 'exceptional-mae', recordId: `q${i}`, significance: { score: 70, selected: true, reasons: ['r'], basis: {}, note: 'n' }, before: { structureTrend: null, liquidity: null, regime: 'breakout', session: 'london', strategiesActive: 0, strategiesNear: 0, risk: null, price: null }, refId: `mae${i}` }))
  }
  const reg = X.registerExperiment({ hypothesisId: h.id, kind: 'cohort', strategyId: 'silver-bullet', source: 'PAPER', filters: h.cohortFilters, direction: 'difference' }, paper, T0 + 40 * DAY)
  await X.runExperiment(reg.experiment.experimentId, { dataset: paper, now: T0 + 40 * DAY })
  const g = Q.generateQueue({ paper, now: T0 + 40 * DAY + X.REASSESS_MS + 1 })
  const manual = g.items.find((q) => q.hypothesisId === h.id)!
  assert.ok(manual, 'the hand hypothesis is queued')
  assert.equal(manual.maturity, 'REASSESSMENT', 'its experiment is past its reassessment date')
  assert.ok(manual.experimentIds.includes(reg.experiment.experimentId))
  const untestable = g.items.find((q) => q.origin === 'observation' && /STRATEGY REJECTION/.test(q.question))!
  assert.ok(untestable)
  assert.equal(untestable.status, 'BLOCKED')
  assert.ok(untestable.requiredData.missing.some((m) => /resolved case studies/.test(m)))
  const testable = g.items.find((q) => q.origin === 'observation' && /paper trades decided in volatility "wild"/.test(q.question))!
  assert.ok(testable)
  assert.equal(testable.direction, 'difference')
  const next = Q.nextTestable(T0 + 41 * DAY)
  assert.ok(next && next.requiredData.have >= next.requiredData.minTrades && next.status === 'QUEUED')
  const s = Q.queueSummary()
  assert.ok(s.total >= 4 && s.byOrigin.cohort >= 1 && s.byOrigin.observation >= 2)
  assert.equal(Q.setQueueStatus(manual.id, 'PARKED', 'parked by test')!.status, 'PARKED')
  assert.equal(Q.setQueueStatus('nope', 'PARKED'), null)
})

test('recommendations answer why / what exists / what is missing / what would answer, and are empty-but-honest at zero data', () => {
  const zero = R.recommendations({ paper: rec.datasetOf([]), now: T0 })
  assert.ok(zero.items.every((i) => i.why && i.dataExists && i.missing && i.wouldAnswer))
  assert.ok(zero.items.some((i) => i.topic === 'missing evidence'), 'with nothing traded, the missing evidence is every strategy')
  const withDrift = R.recommendations({ paper, drift: [{ dimension: 'session', value: 'london', verdict: 'DIFFERENT', note: 'paper London mean differs from the historical population' }], now: T0 + 40 * DAY })
  assert.ok(withDrift.items.some((i) => i.topic === 'paper/backtest drift' && /london/i.test(i.question)))
  assert.ok(withDrift.items.some((i) => i.topic === 'contradictory findings'), 'the reassessed hypothesis carries counterevidence')
  assert.ok(withDrift.items.every((i) => !/buy|sell|go long|go short/i.test(i.wouldAnswer)), 'a recommendation is research, never a trade')
  assert.match(withDrift.note, /None is a trade idea/)
})

test('the review queue shows the whole case; REQUEST MORE RESEARCH queues a question; APPROVE advances the workflow and changes nothing', () => {
  const g = rng(5)
  const strong = Array.from({ length: 200 }, () => 0.6 + (g() - 0.5) * 1.5)
  const critique = L.critiqueCohort({ name: 'x', filters: [], provenance: paper.provenance, stats: { n: 250 } as never, recordIds: [], composition: { regime: { 'trending-up': 100, ranging: 100, breakout: 50 } } } as never, { source: 'PAPER' })
  const h = H.listHypotheses()[0]
  const p = L.saveProposal(L.makeProposal({ kind: 'parameter-variant', strategyId: 'silver-bullet', title: 'RR 2.5', rationale: 'holds OOS', change: 'rr 2.0 → 2.5', params: { rr: 2.5 }, evidence: { hypothesisIds: [h.id] }, oosRs: strong, paperTrades: 30, walkForwardPositiveShare: 0.8, hypothesisStatuses: ['OOS SUPPORTED'], critique, trials: 20, now: T0 }))
  assert.equal(p.status, 'PROPOSED')
  const card = V.reviewCard(p.id, T0 + 1)!
  assert.equal(card.canDecide, true)
  assert.equal(card.original.strategyId, 'silver-bullet')
  assert.ok('rr' in card.original.parameters)
  assert.deepEqual(card.proposed.parameters, { rr: 2.5 })
  assert.ok(card.evidence.length >= 1, 'the linked hypothesis\'s experiment is shown as evidence')
  assert.ok(card.evidence[0].oos && card.evidence[0].walkForward && card.evidence[0].monteCarlo && card.evidence[0].robustness)
  assert.ok(card.researchHistory.length >= 3)
  assert.match(card.note, /changes no production parameter/)
  const q = V.reviewQueue(T0 + 1)
  assert.equal(q.awaiting.length, 1)
  const cfgBefore = JSON.stringify(config)
  const more = V.decideReview(p.id, 'REQUEST MORE RESEARCH', 'gt', 'show me the regime split', T0 + 2)
  assert.equal(more.stage, 'MORE RESEARCH REQUESTED')
  assert.ok(more.researchQueueItemId && Q.getQueueItem(more.researchQueueItemId)!.origin === 'manual')
  assert.equal(L.getProposal(p.id)!.status, 'PROPOSED', 'the proposal stays open')
  const approved = V.decideReview(p.id, 'APPROVE FOR PAPER TEST', 'gt', 'run it on paper', T0 + 3)
  assert.equal(approved.stage, 'APPROVED FOR PAPER TEST')
  assert.equal(L.getProposal(p.id)!.status, 'APPROVED')
  assert.equal(JSON.stringify(config), cfgBefore, 'approval applies nothing')
  assert.throws(() => V.decideReview(p.id, 'REJECT', 'gt', 'x', T0 + 4), /only a PROPOSED proposal/)
  assert.equal(V.reviewQueue(T0 + 5).awaiting.length, 0)
  assert.throws(() => V.decideReview('nope', 'REJECT', 'gt', 'x'), /no such proposal/)
})
