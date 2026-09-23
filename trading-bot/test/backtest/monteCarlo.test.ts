/**
 * Monte Carlo. Two properties matter: it is deterministic for a seed, and
 * resampling with replacement leaves the mean of the simulated totals on the
 * real total (in expectation), so the mean of the distribution reproduces the
 * input's sum — the spread around it is what we actually learn.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monteCarlo } from '../../src/backtest/monteCarlo.ts'

test('same seed gives byte-identical results; different seed differs', () => {
  const rs = [1, -1, 2, -1, 1, -1, 2, -0.5]
  const a = monteCarlo(rs, 1000, 42)
  const b = monteCarlo(rs, 1000, 42)
  const c = monteCarlo(rs, 1000, 99)
  assert.deepEqual(a, b)
  assert.notEqual(a.totalR.mean, c.totalR.mean)
})

test('the mean of the resampled totals reproduces the input total', () => {
  // Each resampled run has n draws, each with expected value = mean(rs);
  // so E[total] = n * mean(rs) = sum(rs). With many samples the empirical
  // mean lands very close.
  const rs = [2, -1, 3, -1, 2, -1, 1, -1, 2, -1] // sum = 5
  const inputTotal = rs.reduce((a, b) => a + b, 0)
  const mc = monteCarlo(rs, 20000, 7)
  assert.ok(Math.abs(mc.totalR.mean - inputTotal) < 0.25, `mean ${mc.totalR.mean} should sit near ${inputTotal}`)
})

test('the per-trade mean of the distribution matches the input mean', () => {
  const rs = [1, 1, 1, -2, 1, 1, 1, -2] // mean = 0.25
  const inputMean = rs.reduce((a, b) => a + b, 0) / rs.length
  const mc = monteCarlo(rs, 20000, 3)
  assert.ok(Math.abs(mc.totalR.mean / rs.length - inputMean) < 0.05)
})

test('percentiles are ordered p5 ≤ median ≤ p95 and bracket the mean', () => {
  const mc = monteCarlo([2, -1, 3, -1, 1, -1, 2, -1], 5000, 11)
  assert.ok(mc.totalR.p5 <= mc.totalR.median)
  assert.ok(mc.totalR.median <= mc.totalR.p95)
  assert.ok(mc.totalR.min <= mc.totalR.p5)
  assert.ok(mc.totalR.max >= mc.totalR.p95)
})

test('an all-winning input is profitable in every run', () => {
  const mc = monteCarlo([1, 2, 1, 3], 1000, 5)
  assert.equal(mc.profitableShare, 1)
})

test('drawdown distribution is non-negative and worst ≥ p95', () => {
  const mc = monteCarlo([1, -2, 1, -2, 3, -1], 3000, 13)
  assert.ok(mc.maxDrawdownR.p95 >= 0)
  assert.ok(mc.maxDrawdownR.worst >= mc.maxDrawdownR.p95)
})

test('empty input yields a zeroed, non-crashing result', () => {
  const mc = monteCarlo([], 1000, 1)
  assert.equal(mc.samples, 0)
  assert.equal(mc.totalR.mean, 0)
  assert.equal(mc.profitableShare, 0)
})
