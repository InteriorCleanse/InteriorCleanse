/**
 * Champion-challenger: a challenger takes the crown only when it beats the
 * champion out-of-sample AND on paper, with enough paper trades, and while
 * healthy — and automatic promotion never reaches live.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMetrics } from '../../src/backtest/metrics.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'
import { monteCarlo } from '../../src/backtest/monteCarlo.ts'
import type { BacktestReport } from '../../src/backtest/report.ts'
import type { Genome } from '../../src/factory/genome.ts'
import { appendResult, createPassport, withStatus } from '../../src/vault/passport.ts'
import type { Passport, PassportStatus } from '../../src/vault/passport.ts'
import { compareChallenger, nextStage } from '../../src/vault/promotion.ts'

const DAY = 86_400_000
function report(avgR: number): BacktestReport {
  // Build an OOS trade list with roughly the requested average.
  const rs: number[] = []
  for (let i = 0; i < 30; i++) rs.push(i < 20 ? avgR + 0.5 : avgR - 1.0)
  const trades: TradeLike[] = rs.map((r, i) => ({ time: (i + 1) * DAY, rMultiple: r, pnlUsd: r * 100, outcome: r > 0 ? 'WIN' : 'LOSS' }))
  const empty = computeMetrics([])
  return { strategy: 'crossover', window: null, all: computeMetrics(trades), inSample: empty, validation: empty, outOfSample: computeMetrics(trades), walkForward: null, monteCarlo: monteCarlo(rs), notes: [], notBacktestable: null }
}
let counter = 0
function passport(oosAvg: number, status: PassportStatus, paper?: { avgR: number; trades: number }): Passport {
  const genome: Genome = { strategyId: 'crossover', params: { stopAtr: 1.5, rr: 2, _u: counter++ } }
  let p = createPassport('crossover', genome, report(oosAvg), { family: 'crossover' })
  p = withStatus(p, status, 'set for test')
  if (paper) p = appendResult(p, { stage: 'paper', at: Date.now(), trades: paper.trades, totalR: paper.avgR * paper.trades, avgR: paper.avgR, rMultiples: Array(paper.trades).fill(paper.avgR) }, { decayMinTrades: 999 })
  return p
}

test('nextStage climbs the ladder but never reaches live automatically', () => {
  assert.equal(nextStage('candidate'), 'paper')
  assert.equal(nextStage('paper'), 'shadow')
  assert.equal(nextStage('shadow'), null) // the step to live is a human decision
  assert.equal(nextStage('watch'), null)
})

test('a challenger that beats the champion on BOTH OOS and paper is promoted', () => {
  const champ = passport(0.3, 'shadow', { avgR: 0.3, trades: 30 })
  const chal = passport(0.5, 'paper', { avgR: 0.5, trades: 30 })
  const d = compareChallenger(champ, chal, { edgeR: 0.02, minPaperTrades: 20 })
  assert.equal(d.promote, true)
  assert.equal(d.to, 'shadow')
})

test('a challenger that wins OOS but not paper is NOT promoted', () => {
  const champ = passport(0.3, 'shadow', { avgR: 0.5, trades: 30 })
  const chal = passport(0.6, 'paper', { avgR: 0.3, trades: 30 }) // better OOS, worse paper
  const d = compareChallenger(champ, chal)
  assert.equal(d.promote, false)
  assert.match(d.reason, /not on paper|where it counts/)
})

test('a challenger that wins paper but not OOS is NOT promoted', () => {
  const champ = passport(0.6, 'shadow', { avgR: 0.3, trades: 30 })
  const chal = passport(0.3, 'paper', { avgR: 0.6, trades: 30 }) // worse OOS, better paper
  const d = compareChallenger(champ, chal)
  assert.equal(d.promote, false)
})

test('a challenger without enough paper trades is not judged', () => {
  const champ = passport(0.3, 'shadow', { avgR: 0.3, trades: 30 })
  const chal = passport(0.9, 'paper', { avgR: 0.9, trades: 5 })
  const d = compareChallenger(champ, chal, { minPaperTrades: 20 })
  assert.equal(d.promote, false)
  assert.match(d.reason, /paper trade/)
})

test('a decaying challenger cannot be promoted', () => {
  let chal = passport(0.5, 'paper')
  chal = appendResult(chal, { stage: 'paper', at: Date.now(), trades: 25, totalR: -7.5, avgR: -0.3, rMultiples: Array(25).fill(-0.3) }, { decayMinTrades: 20, decayWindow: 20 })
  assert.equal(chal.decay.decaying, true)
  const d = compareChallenger(passport(0.3, 'shadow', { avgR: 0.3, trades: 30 }), chal)
  assert.equal(d.promote, false)
  assert.match(d.reason, /decaying/)
})

test('with no champion yet, a challenger that clears the paper bar is promoted', () => {
  const chal = passport(0.5, 'candidate', { avgR: 0.4, trades: 25 })
  const d = compareChallenger(null, chal, { minPaperTrades: 20 })
  assert.equal(d.promote, true)
  assert.equal(d.to, 'paper')
})

test('a shadow challenger is never auto-promoted to live', () => {
  const chal = passport(0.9, 'shadow', { avgR: 0.9, trades: 40 })
  const d = compareChallenger(null, chal)
  assert.equal(d.promote, false)
  assert.match(d.reason, /human decision/)
})
