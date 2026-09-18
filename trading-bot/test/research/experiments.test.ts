/**
 * THE EXPERIMENT REGISTRY, RUNNER, CHALLENGER AND SANDBOX — frozen before
 * computed, one row per experiment whatever is retried, a baseline on every
 * comparison, robustness on every run, the challenger on every result, and
 * a sandbox that changes nothing in production.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import type { EvidenceRecord } from '../../src/analyst/records.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { ReplayTrade } from '../../src/types.ts'

const tmp = tempDataDir('mrcash-exp-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const X = await import('../../src/research/experiments.ts')
const C = await import('../../src/research/challenger.ts')
const S = await import('../../src/research/sandbox.ts')
const H = await import('../../src/research/hypotheses.ts')
const O = await import('../../src/research/overfitting.ts')
const rec = await import('../../src/analyst/records.ts')
after(() => tmp.cleanup())

const T0 = Date.UTC(2026, 0, 1, 13, 30)
const DAY = 86_400_000
function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function r(i: number, over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: `x${i}`, source: 'PAPER', strategyId: 'silver-bullet', family: 'session', symbol: 'BTCUSDT', interval: '5m', session: 'london', regime: i % 2 ? 'trending-up' : 'ranging', volatility: 'normal',
    direction: 'long', decidedAt: T0 + i * 6 * 3_600_000, filledAt: T0 + i * 6 * 3_600_000 + 300_000, closedAt: T0 + i * 6 * 3_600_000 + 1_800_000, hourET: 8, weekdayET: 2,
    intendedEntry: 100, entry: 100, stop: 99, target: 102, exit: 101, exitReason: 'take-profit', rMultiple: 1, outcome: 'WIN', missed: false,
    quality: 85, fusedScore: 80, mtfAligned: null, newsMinutes: null, spreadPct: null, durationMs: 1_500_000,
    mae: { r: -0.3, status: 'OBSERVED', note: '' }, mfe: { r: 1.2, status: 'OBSERVED', note: '' },
    engineVersion: '2.3.0', featureVersion: 1, missing: [], corrupt: false, corruptReason: null, ...over,
  }
}
/** 120 records over 30 days: London mean +0.5R, Asia mean −0.1R, both noisy. */
function population(seed = 3): EvidenceRecord[] {
  const g = rng(seed)
  const out: EvidenceRecord[] = []
  for (let i = 0; i < 120; i++) {
    const london = i % 2 === 0
    const base = london ? 0.5 : -0.1
    const rm = base + (g() - 0.5) * 2
    out.push(r(i, { session: london ? 'london' : 'asia', rMultiple: rm, outcome: rm > 0 ? 'WIN' : 'LOSS', exit: 100 + rm }))
  }
  return out
}
const london = { dimension: 'session' as const, values: ['london'] }

test('an experiment is frozen before it runs, its id is content-addressed, and registering it twice is one row', () => {
  const d = rec.datasetOf(population())
  const spec = { hypothesisId: null, kind: 'cohort' as const, strategyId: 'silver-bullet', source: 'PAPER' as const, filters: [london], direction: 'positive' as const }
  const a = X.registerExperiment(spec, d, T0 + 40 * DAY)
  const b = X.registerExperiment(spec, d, T0 + 41 * DAY)
  assert.equal(a.isNew, true); assert.equal(b.isNew, false)
  assert.equal(a.experiment.experimentId, b.experiment.experimentId)
  assert.equal(a.experiment.status, 'REGISTERED')
  assert.equal(a.experiment.result, 'NOT RUN')
  assert.ok(a.experiment.datasetHash.startsWith('paper-120-'))
  assert.equal(a.experiment.strategyVersion.includes('/f'), true)
  assert.ok(a.experiment.splitAt !== null && a.experiment.splitAt > T0)
  assert.equal(a.experiment.baseline.kind, 'complement')
  const other = X.registerExperiment({ ...spec, filters: [{ dimension: 'session', values: ['asia'] }] }, d, T0)
  assert.notEqual(other.experiment.experimentId, a.experiment.experimentId)
  assert.equal(X.datasetHash(d), X.datasetHash(rec.datasetOf([...population()].reverse())), 'order does not change the dataset hash')
  assert.notEqual(X.datasetHash(d), X.datasetHash(rec.datasetOf(population().slice(1))))
})

test('the runner compares treatment to its baseline with a Welch interval, runs robustness, records a trial, updates the hypothesis, and is reproducible', async () => {
  const d = rec.datasetOf(population())
  const h = H.createHypothesis({ question: 'Is London positive?', observation: 'o', hypothesis: 'London mean R is positive.', nullHypothesis: 'zero', direction: 'positive', dataset: { source: 'PAPER', label: 'PAPER' }, cohortFilters: [london], method: 'm', session: 'london', now: T0 })
  const trialsBefore = O.trialsFor('silver-bullet')
  const reg = X.registerExperiment({ hypothesisId: h.id, kind: 'cohort', strategyId: 'silver-bullet', source: 'PAPER', filters: [london], direction: 'positive' }, d, T0 + 40 * DAY)
  const e = await X.runExperiment(reg.experiment.experimentId, { dataset: d, now: T0 + 40 * DAY, challenge: (x) => C.challenge(x, { oosTreatment: d.records.filter((q) => x.oosResult!.recordIds.includes(q.id)), hypothesesOnRecord: 1, draftedFromObservation: true, now: T0 + 40 * DAY }) })
  assert.equal(e.status, 'DONE')
  assert.ok(e.inSampleResult!.trades >= 10 && e.oosResult!.trades >= 10)
  assert.equal(e.baselineOos!.trades > 0, true)
  assert.ok(e.comparison.oos && e.comparison.oos.verdict !== 'TOO FEW')
  assert.ok(['OOS SUPPORTED', 'OBSERVED IN SAMPLE', 'INCONCLUSIVE'].includes(e.result), e.result)
  assert.ok(e.walkForwardResult && e.monteCarloResult && e.robustnessResult)
  assert.equal(O.trialsFor('silver-bullet'), trialsBefore + 1, 'every run counts as a trial')
  assert.ok(e.multipleTestingContext.trials >= 1)
  assert.ok(e.nextTest === T0 + 40 * DAY + X.REASSESS_MS)
  const ch = e.challenge as { attacks: Array<{ question: string; verdict: string }>; overall: string }
  assert.ok(ch.attacks.length >= 12)
  assert.ok(ch.attacks.some((a) => /selected after seeing results/.test(a.question) && a.verdict === 'WEAKENED'), 'a hypothesis drafted from its own observation is flagged')
  assert.ok(ch.attacks.some((a) => /different symbols/.test(a.question) && a.verdict === 'UNTESTABLE'))
  assert.notEqual(ch.overall, 'SURVIVES', 'with a weakened attack the overall verdict cannot be SURVIVES')
  const updated = H.getHypothesis(h.id)!
  assert.ok(updated.inSample && updated.outOfSample, 'the hypothesis received both stages from the experiment')
  assert.ok(updated.robustness)
  assert.ok(updated.version >= 4)
  // Reproducible: running again returns the same finished record, no new trial.
  const again = await X.runExperiment(e.experimentId, { dataset: d, now: T0 + 50 * DAY })
  assert.equal(again.finishedAt, e.finishedAt)
  assert.equal(O.trialsFor('silver-bullet'), trialsBefore + 1)
  assert.match(X.renderExperiment(e), /EXPERIMENT exp-cohort-/)
})

test('a cohort that is worse out of sample is NOT SUPPORTED with counterevidence; a tiny cohort is INSUFFICIENT DATA', async () => {
  const d = rec.datasetOf(population(9))
  const asia = { dimension: 'session' as const, values: ['asia'] }
  const reg = X.registerExperiment({ hypothesisId: null, kind: 'cohort', strategyId: 'silver-bullet', source: 'PAPER', filters: [asia], direction: 'positive' }, d, T0)
  const e = await X.runExperiment(reg.experiment.experimentId, { dataset: d, now: T0 })
  assert.ok(['NOT SUPPORTED', 'INCONCLUSIVE'].includes(e.result), e.result)
  assert.ok(e.counterevidence.length >= 1)
  const few = rec.datasetOf(population(9).slice(0, 8))
  const reg2 = X.registerExperiment({ hypothesisId: null, kind: 'cohort', strategyId: 'silver-bullet', source: 'PAPER', filters: [london], direction: 'positive' }, few, T0)
  const e2 = await X.runExperiment(reg2.experiment.experimentId, { dataset: few, now: T0 })
  assert.equal(e2.result, 'INSUFFICIENT DATA')
  assert.equal(e2.comparison.oos!.verdict, 'TOO FEW')
})

test('the challenger never passes an attack it cannot run, and its overall is the worst attack', () => {
  const d = rec.datasetOf(population(5).slice(0, 12))
  const reg = X.registerExperiment({ hypothesisId: null, kind: 'cohort', strategyId: 'unicorn', source: 'PAPER', filters: [london], direction: 'positive' }, d, T0)
  const c = C.challenge(reg.experiment, { oosTreatment: [], hypothesesOnRecord: 0, draftedFromObservation: false, now: T0 })
  assert.ok(c.untestable >= 6)
  assert.equal(c.disproved, 0)
  assert.ok(c.attacks.every((a) => a.detail.length > 0))
  assert.match(c.note, /not a pass/)
})

function pos(i: number, over: Partial<PaperPosition> = {}): PaperPosition {
  const openedAt = T0 + i * 6 * 3_600_000
  return {
    id: `sp${i}`, openedAt, dayKey: '2026-01-01', session: i % 2 ? 'London' : 'Asia', setupKey: 'BTCUSDT|5m|silver-bullet|long', direction: 'long',
    intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'test', atr: 0.5, status: 'closed',
    filledAt: openedAt + 300_000, strategyId: 'silver-bullet', regime: 'trending-up', closedAt: openedAt + 1_800_000, exit: i % 3 ? 101.5 : 99, exitReason: i % 3 ? 'target' : 'stop', rMultiple: i % 3 ? 1.5 : -1, outcome: i % 3 ? 'WIN' : 'LOSS', candlesHeld: 5,
    snapshot: { signalId: `s${i}`, symbol: 'BTCUSDT', interval: '5m', engineVersion: '2.3.0', featureVersion: 1, volatility: 'normal', fusedScore: 80, fusedAction: 'LONG', confirms: [], invalidates: [], contributors: [], evidence: [], riskChecks: [], riskVetoedBy: null, newsMinutes: null, inBlackout: false },
    ...over,
  }
}

test('SANDBOX — a session restriction is an experiment over the paper record; production is untouched; a duplicate request returns the finished record', async () => {
  const closed = Array.from({ length: 60 }, (_, i) => pos(i))
  const cfgBefore = JSON.stringify(config)
  const a = await S.runSandbox({ kind: 'session-restriction', strategyId: 'silver-bullet', source: 'PAPER', values: ['london'] }, closed, { now: T0 + 30 * DAY })
  assert.equal(a.isNew, true)
  assert.equal(a.experiment.kind, 'filter')
  assert.equal(a.experiment.status, 'DONE')
  assert.deepEqual(a.experiment.features, ['strategyId=silver-bullet', 'session=london'])
  assert.equal(a.experiment.baseline.kind, 'excluded-trades')
  assert.ok(a.experiment.challenge)
  const b = await S.runSandbox({ kind: 'session-restriction', strategyId: 'silver-bullet', source: 'PAPER', values: ['london'] }, closed, { now: T0 + 31 * DAY })
  assert.equal(b.isNew, false)
  assert.equal(b.experiment.finishedAt, a.experiment.finishedAt)
  assert.equal(JSON.stringify(config), cfgBefore)
  assert.throws(() => S.sandboxSpec({ kind: 'regime-restriction', strategyId: 'silver-bullet', source: 'PAPER', values: [] }), /values to keep/)
  assert.throws(() => S.sandboxSpec({ kind: 'parameter', strategyId: 'silver-bullet', source: 'BACKTEST', params: { nope: 1 } }), /not a tunable parameter/)
  assert.throws(() => S.sandboxSpec({ kind: 'parameter', strategyId: 'zzz', source: 'BACKTEST', params: { rr: 2 } }), /unknown strategy/)
})

test('SANDBOX — a parameter variant runs the backtester scoped to the run, counts two trials, and a second variant is a second experiment', async () => {
  const g = rng(7)
  const mkTrades = (bias: number): ReplayTrade[] => Array.from({ length: 80 }, (_, i) => { const rm = bias + (g() - 0.5) * 2; return { id: `bt${bias}-${i}`, time: T0 + i * 4 * 3_600_000, entryTime: T0 + i * 4 * 3_600_000, exitTime: T0 + i * 4 * 3_600_000 + 1_800_000, direction: 'long', entry: 100, stop: 99, target: 102, exit: 100 + rm, exitReason: rm > 0 ? 'target' : 'stop', rMultiple: rm, pnlPercent: rm, pnlUsd: rm, outcome: rm > 0 ? 'WIN' : 'LOSS', setupKey: 'k', quality: 80, session: 'london', regime: 'trending-up', candlesHeld: 6 } as unknown as ReplayTrade })
  const backtest = async (_id: string, params: Record<string, number> | null) => ({ trades: mkTrades(params ? 0.3 : 0.1) })
  const before = O.trialsFor('silver-bullet')
  const a = await S.runSandbox({ kind: 'parameter', strategyId: 'silver-bullet', source: 'BACKTEST', params: { rr: 2.5 } }, [], { backtest, now: T0 + 30 * DAY })
  assert.equal(a.experiment.kind, 'parameter')
  assert.equal(a.experiment.status, 'DONE')
  assert.deepEqual(a.experiment.parameterSnapshot, { rr: 2.5 })
  assert.equal(a.experiment.baseline.kind, 'defaults')
  assert.equal(O.trialsFor('silver-bullet'), before + 2, 'variant and baseline backtests are both trials')
  const b = await S.runSandbox({ kind: 'parameter', strategyId: 'silver-bullet', source: 'BACKTEST', params: { rr: 3 } }, [], { backtest, now: T0 + 30 * DAY })
  assert.notEqual(b.experiment.experimentId, a.experiment.experimentId)
  assert.equal(O.trialsFor('silver-bullet'), before + 4, 'trying another value is another experiment and two more trials — there is no free search')
  assert.ok(a.experiment.multipleTestingContext.trials >= 1)
  const view = S.championChallengerView('silver-bullet', [])
  assert.equal(view.champion, null)
  assert.ok(view.challengers.some((c) => c.kind === 'experiment' && c.id === a.experiment.experimentId))
  assert.ok(view.notes.some((n) => /Nothing promotes automatically|de-facto champion/.test(n)))
  assert.equal(view.paperCohort.meanR, null)
})
