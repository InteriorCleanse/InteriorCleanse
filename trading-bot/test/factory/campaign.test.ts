/**
 * A campaign must be deterministic for a seed and resumable: stop it and start
 * it again and it picks up where it left off, never re-scoring a genome it has
 * already scored. It also must refuse strategies it cannot honestly breed.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMetrics } from '../../src/backtest/metrics.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'
import { monteCarlo } from '../../src/backtest/monteCarlo.ts'
import type { BacktestReport } from '../../src/backtest/report.ts'
import type { BacktestFn } from '../../src/factory/evaluate.ts'
import { runCampaign } from '../../src/factory/campaign.ts'
import type { CampaignPersist, CampaignRecord } from '../../src/factory/campaign.ts'

const DAY = 86_400_000
function mk(i: number, r: number): TradeLike {
  return { time: (i + 1) * DAY, rMultiple: r, pnlUsd: r * 100, outcome: r > 0 ? 'WIN' : r < 0 ? 'LOSS' : 'FLAT' }
}
function report(oos: TradeLike[]): BacktestReport {
  const empty = computeMetrics([])
  return { strategy: 'crossover', window: null, all: computeMetrics(oos), inSample: empty, validation: empty, outOfSample: computeMetrics(oos), walkForward: null, monteCarlo: monteCarlo([]), notes: [], notBacktestable: null }
}
// A deterministic scorer: one sweet spot performs, everything else loses.
function makeStub(): { fn: BacktestFn; calls: () => number } {
  let n = 0
  const fn: BacktestFn = async (_id, params) => {
    n++
    const sweet = params.stopAtr === 1.5 && params.rr === 2
    const near = Math.abs((params.stopAtr ?? 0) - 1.5) <= 0.5 && Math.abs((params.rr ?? 0) - 2) <= 0.5
    const trades: TradeLike[] = []
    for (let i = 0; i < 30; i++) trades.push(mk(i, sweet ? (i < 20 ? 1 : -0.5) : near ? (i < 16 ? 1 : -0.8) : (i < 8 ? 1 : -1)))
    return report(trades)
  }
  return { fn, calls: () => n }
}
function memoryPersist(): CampaignPersist & { snapshot: () => CampaignRecord | null } {
  let saved: CampaignRecord | null = null
  return {
    load: () => (saved ? JSON.parse(JSON.stringify(saved)) : null),
    save: (rec) => { saved = JSON.parse(JSON.stringify(rec)) },
    snapshot: () => saved,
  }
}

test('a campaign is deterministic for a seed', async () => {
  const a = await runCampaign({ strategyId: 'crossover', method: 'random', seed: 7, maxGenomes: 6 }, { backtest: makeStub().fn, persist: null })
  const b = await runCampaign({ strategyId: 'crossover', method: 'random', seed: 7, maxGenomes: 6 }, { backtest: makeStub().fn, persist: null })
  assert.deepEqual(a.evaluated.map((e) => e.id), b.evaluated.map((e) => e.id))
  assert.deepEqual(a.selection?.survivors.map((s) => s.id), b.selection?.survivors.map((s) => s.id))
})

test('a grid campaign finds and keeps the profitable plateau, records the trial count', async () => {
  const rec = await runCampaign({ strategyId: 'crossover', method: 'grid', seed: 1 }, { backtest: makeStub().fn, persist: null })
  assert.ok(rec.done)
  assert.ok(rec.selection)
  assert.ok(rec.selection!.trials >= rec.evaluated.length - 1) // trials = distinct genomes tried
  // The stub's sweet spot sits on a profitable plateau, so it should survive.
  const survivors = rec.selection!.survivors
  assert.ok(survivors.length >= 1, 'the plateau should yield at least one survivor')
  assert.ok(survivors.some((s) => s.evaluation.genome.params.stopAtr === 1.5 && s.evaluation.genome.params.rr === 2), 'the sweet spot survives')
  for (const s of survivors) assert.ok(s.stable, 'every survivor is on a stable plateau')
})

test('a campaign resumes without re-scoring anything it already scored', async () => {
  const persist = memoryPersist()
  const first = makeStub()
  await runCampaign({ strategyId: 'crossover', method: 'grid', seed: 1 }, { backtest: first.fn, persist })
  const firstCalls = first.calls()
  assert.ok(firstCalls > 0)

  const second = makeStub()
  const rec = await runCampaign({ strategyId: 'crossover', method: 'grid', seed: 1 }, { backtest: second.fn, persist })
  assert.equal(second.calls(), 0, 'a resumed campaign scores nothing again')
  assert.ok(rec.done)
})

test('the factory refuses a strategy with no tunable parameters', async () => {
  await assert.rejects(() => runCampaign({ strategyId: 'session-ifvg' }, { persist: null }), /no tunable parameters/)
})

test('the factory refuses an order-flow strategy (not backtestable on candles)', async () => {
  await assert.rejects(() => runCampaign({ strategyId: 'orderflow-momentum' }, { persist: null }), /no tunable parameters|not backtestable/i)
})

test('an unknown strategy is refused', async () => {
  await assert.rejects(() => runCampaign({ strategyId: 'nope' }, { persist: null }), /Unknown strategy/)
})
