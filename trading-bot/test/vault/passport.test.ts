/**
 * Passports are immutable in their identity: minting fixes the genome, the
 * out-of-sample evidence and the decay floor for life; everything after is
 * appended. These tests pin that, plus the auto-demotion of a decaying passport.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMetrics } from '../../src/backtest/metrics.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'
import { monteCarlo } from '../../src/backtest/monteCarlo.ts'
import type { BacktestReport } from '../../src/backtest/report.ts'
import type { Genome } from '../../src/factory/genome.ts'
import { appendResult, createPassport, withStatus } from '../../src/vault/passport.ts'

const DAY = 86_400_000
function trades(rs: number[]): TradeLike[] {
  return rs.map((r, i) => ({ time: (i + 1) * DAY, rMultiple: r, pnlUsd: r * 100, outcome: r > 0 ? 'WIN' : r < 0 ? 'LOSS' : 'FLAT' }))
}
function report(oos: TradeLike[]): BacktestReport {
  const empty = computeMetrics([])
  return { strategy: 'crossover', window: null, all: computeMetrics(oos), inSample: empty, validation: empty, outOfSample: computeMetrics(oos), walkForward: null, monteCarlo: monteCarlo(oos.map((t) => t.rMultiple ?? 0)), notes: [], notBacktestable: null }
}
const genome: Genome = { strategyId: 'crossover', params: { stopAtr: 1.5, rr: 2 } }
function fresh() {
  return createPassport('crossover', genome, report(trades([...Array(20).fill(1), ...Array(10).fill(-0.5)])), { origin: 'campaign.x', family: 'crossover', now: 1000 })
}

test('minting records the founding evidence, a candidate status and a minted event', () => {
  const p = fresh()
  assert.equal(p.status, 'candidate')
  assert.equal(p.strategyId, 'crossover')
  assert.equal(p.oos.trades, 30)
  assert.ok(p.oosLowerAvgR > 0)
  assert.equal(p.results.length, 1)
  assert.equal(p.results[0].stage, 'backtest')
  assert.equal(p.events[0].kind, 'minted')
  assert.ok(p.regimeFit.length > 0)
})

test('appendResult returns a NEW passport and never mutates the original', () => {
  const p = fresh()
  const before = JSON.stringify(p)
  const p2 = appendResult(p, { stage: 'paper', at: 2000, trades: 5, totalR: 2, avgR: 0.4, rMultiples: [1, 1, -0.5, 0.5, 0] })
  assert.notEqual(p2, p)
  assert.equal(JSON.stringify(p), before, 'the original passport is untouched')
  assert.equal(p2.results.length, 2)
  // Identity fields are carried over unchanged.
  assert.equal(p2.createdAt, p.createdAt)
  assert.equal(p2.oosLowerAvgR, p.oosLowerAvgR)
  assert.deepEqual(p2.genome, p.genome)
  assert.deepEqual(p2.oos, p.oos)
})

test('a passport that starts decaying is demoted to watch automatically', () => {
  let p = fresh()
  // Feed 25 losing paper trades — well below the OOS floor, sustained.
  p = appendResult(p, { stage: 'paper', at: 3000, trades: 25, totalR: -7.5, avgR: -0.3, rMultiples: Array(25).fill(-0.3) }, { decayMinTrades: 20, decayWindow: 20 })
  assert.equal(p.decay.decaying, true)
  assert.equal(p.status, 'watch')
  assert.ok(p.events.some((e) => e.kind === 'demoted'))
})

test('withStatus promotes and records the event without touching evidence', () => {
  const p = fresh()
  const p2 = withStatus(p, 'paper', 'Promoted for paper trading.', 4000)
  assert.equal(p2.status, 'paper')
  assert.equal(p2.events.at(-1)!.kind, 'promoted')
  assert.deepEqual(p2.oos, p.oos)
  assert.equal(p.status, 'candidate', 'original unchanged')
})
