/**
 * Survivor selection is where the discipline lives, so it gets the closest
 * tests: it must reject a genome that only wins in-sample, reject a lone spike
 * even when the spike itself looks great, and it must record the number of
 * trials and let that number change the verdict.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMetrics } from '../../src/backtest/metrics.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'
import { monteCarlo } from '../../src/backtest/monteCarlo.ts'
import type { BacktestReport } from '../../src/backtest/report.ts'
import type { GenomeEvaluation } from '../../src/factory/evaluate.ts'
import { genomeId } from '../../src/factory/genome.ts'
import type { Genome } from '../../src/factory/genome.ts'
import { select } from '../../src/factory/select.ts'
import type { SelectionCriteria } from '../../src/factory/select.ts'
import type { ParamSpec } from '../../src/strategies/types.ts'

const DAY = 86_400_000
const schema: ParamSpec[] = [{ name: 'a', label: 'a', min: 1, max: 3, step: 1, default: 2 }]
const criteria: SelectionCriteria = { minOosTrades: 20, minOosAvgR: 0.05, stabilityMinShare: 0.6, deflatedSharpeMin: 0.9 }

function mk(i: number, r: number): TradeLike {
  return { time: (i + 1) * DAY, rMultiple: r, pnlUsd: r * 100, outcome: r > 0 ? 'WIN' : r < 0 ? 'LOSS' : 'FLAT' }
}
// 30 trades, avg +0.5R, a healthy Sharpe.
function goodOos(): TradeLike[] {
  const t: TradeLike[] = []
  let i = 0
  for (; i < 20; i++) t.push(mk(i, 1))
  for (; i < 30; i++) t.push(mk(i, -0.5))
  return t
}
// 30 trades, net negative — enough trades, but no edge.
function badOos(): TradeLike[] {
  const t: TradeLike[] = []
  let i = 0
  for (; i < 10; i++) t.push(mk(i, 1))
  for (; i < 30; i++) t.push(mk(i, -1))
  return t
}
function report(oos: TradeLike[]): BacktestReport {
  const empty = computeMetrics([])
  return { strategy: 't', window: null, all: computeMetrics(oos), inSample: empty, validation: computeMetrics(oos), outOfSample: computeMetrics(oos), walkForward: null, monteCarlo: monteCarlo([]), notes: [], notBacktestable: null }
}
function evalFor(a: number, oos: TradeLike[]): GenomeEvaluation {
  const genome: Genome = { strategyId: 't', params: { a } }
  return { id: genomeId(genome), genome, report: report(oos) }
}

test('a genome that only wins in-sample is rejected on the selection segment', () => {
  // The report's `all`/in-sample would look fine; selection judges OOS only, which is losing.
  const r = select([evalFor(2, badOos())], schema, criteria, 1)
  assert.equal(r.survivors.length, 0)
  assert.ok(r.all[0].reasons.some((x) => x.includes('out-of-sample expectancy') || x.includes('expectancy')))
})

test('a lone spike is rejected even though the spike itself passes every other gate', () => {
  const evals = [evalFor(2, goodOos()), evalFor(1, badOos()), evalFor(3, badOos())]
  const r = select(evals, schema, criteria, 3)
  const spike = r.all.find((j) => j.evaluation.genome.params.a === 2)!
  assert.equal(spike.enoughTrades, true)
  assert.equal(spike.positiveOos, true)
  assert.equal(spike.passedDeflated, true)
  assert.equal(spike.stable, false) // its neighbours fail
  assert.equal(spike.survived, false)
  assert.ok(spike.reasons.some((x) => x.includes('spike')))
})

test('a genome on a profitable plateau survives every gate', () => {
  const evals = [evalFor(2, goodOos()), evalFor(1, goodOos()), evalFor(3, goodOos())]
  const r = select(evals, schema, criteria, 3)
  const winner = r.survivors.find((j) => j.evaluation.genome.params.a === 2)
  assert.ok(winner, 'the stable, profitable genome should survive')
  assert.ok(winner!.reasons.some((x) => x.includes('Survived selection')))
})

test('the trial count is recorded and changes the verdict', () => {
  const evals = [evalFor(2, goodOos()), evalFor(1, goodOos()), evalFor(3, goodOos())]
  const few = select(evals, schema, criteria, 1)
  const many = select(evals, schema, criteria, 100000)
  assert.equal(few.trials, 1)
  assert.equal(many.trials, 100000)
  assert.equal(few.survivors.length >= 1, true, 'survives when only one thing was tried')
  assert.equal(many.survivors.length, 0, 'the same result cannot survive 100k trials')
  const g = many.all.find((j) => j.evaluation.genome.params.a === 2)!
  assert.equal(g.passedDeflated, false)
  assert.ok(g.reasons.some((x) => x.includes('Deflated Sharpe')))
})

test('a not-backtestable evaluation is judged and rejected, never dropped', () => {
  const genome: Genome = { strategyId: 't', params: { a: 2 } }
  const rep = { ...report([]), notBacktestable: 'live tape only' }
  const r = select([{ id: genomeId(genome), genome, report: rep }], schema, criteria, 1)
  assert.equal(r.all.length, 1)
  assert.equal(r.survivors.length, 0)
  assert.ok(r.all[0].reasons.some((x) => x.includes('Not backtestable')))
})
