/**
 * Decay detection: it must stay quiet on small samples and on a normal wobble,
 * and it must fire only when the rolling expectancy has fallen below the
 * out-of-sample floor AND the CUSUM confirms a sustained shift.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectDecay, lowerCusum, oosLowerBound, rollingExpectancy } from '../../src/vault/decay.ts'
import { computeMetrics } from '../../src/backtest/metrics.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'

const DAY = 86_400_000
function trades(rs: number[]): TradeLike[] {
  return rs.map((r, i) => ({ time: (i + 1) * DAY, rMultiple: r, pnlUsd: r * 100, outcome: r > 0 ? 'WIN' : r < 0 ? 'LOSS' : 'FLAT' }))
}

test('the OOS lower bound sits below the point estimate and is conservative', () => {
  const m = computeMetrics(trades([...Array(20).fill(1), ...Array(10).fill(-0.5)])) // avg 0.5R
  const lb = oosLowerBound(m)
  assert.ok(lb < (m.avgR ?? 0), 'lower bound is below the mean')
  assert.ok(lb > 0, 'a real positive edge keeps a positive floor')
})

test('the lower bound refuses to promise a positive floor without a measured edge', () => {
  const flat = computeMetrics(trades([1, -1, 1, -1])) // avg 0, sharpe ~0
  assert.ok(oosLowerBound(flat) <= 0)
})

test('rolling expectancy averages the last window only', () => {
  assert.equal(rollingExpectancy([1, 1, 1, -1, -1], 2), -1)
  assert.equal(rollingExpectancy([1], 5), null)
})

test('the lower CUSUM accumulates sustained downside and resets on upside', () => {
  assert.equal(lowerCusum([1, 1, 1], 0.5, 0.1), 0) // all above target → no accumulation
  assert.ok(lowerCusum([-0.3, -0.3, -0.3], 0.5, 0.1) > 2) // sustained below → piles up
})

test('decay stays quiet below the minimum sample size', () => {
  const d = detectDecay(trades([-1, -1, -1]).map((t) => t.rMultiple!), 0.2, { minTrades: 20, expectedAvgR: 0.5 })
  assert.equal(d.decaying, false)
  assert.match(d.reason, /before judging decay/)
})

test('decay stays quiet while the edge holds up', () => {
  const rs = Array(25).fill(0.5)
  const d = detectDecay(rs, 0.2, { minTrades: 20, window: 20, expectedAvgR: 0.5 })
  assert.equal(d.decaying, false)
  assert.ok((d.rollingExpectancy ?? 0) >= 0.2)
})

test('decay FIRES when rolling expectancy falls below the floor and the CUSUM confirms', () => {
  const rs = Array(25).fill(-0.3) // well below a 0.2 floor, sustained
  const d = detectDecay(rs, 0.2, { minTrades: 20, window: 20, expectedAvgR: 0.5, cusumSlack: 0.1, cusumThreshold: 3 })
  assert.equal(d.decaying, true)
  assert.match(d.reason, /below the out-of-sample floor/)
  assert.ok(d.cusumLow > 3)
})

test('a dip below the floor that the CUSUM has not confirmed is watched, not flagged', () => {
  // 20 trades a touch below the floor, but only a hair below the expected R, so
  // the CUSUM never piles up past the threshold.
  const rs = Array(20).fill(0.05)
  const d = detectDecay(rs, 0.1, { minTrades: 20, window: 20, expectedAvgR: 0.2, cusumSlack: 0.1, cusumThreshold: 3 })
  assert.equal(d.decaying, false)
  assert.match(d.reason, /not confirmed a sustained shift|watching/)
})
