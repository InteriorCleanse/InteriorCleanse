/**
 * The statistics behind the multiple-testing discipline: the normal helpers,
 * and the deflated Sharpe whose bar rises with the number of trials.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflatedSharpe, expectedMaxZ, invNorm, normCdf } from '../../src/factory/stats.ts'

test('normCdf hits its known values', () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-6)
  assert.ok(Math.abs(normCdf(1.645) - 0.95) < 2e-3)
  assert.ok(Math.abs(normCdf(-1.645) - 0.05) < 2e-3)
})

test('invNorm is the inverse of normCdf', () => {
  for (const p of [0.1, 0.25, 0.5, 0.8, 0.975]) {
    assert.ok(Math.abs(normCdf(invNorm(p)) - p) < 1e-3, `round-trip at ${p}`)
  }
})

test('the expected best-of-N grows with the number of trials', () => {
  assert.equal(expectedMaxZ(1), 0)
  assert.ok(expectedMaxZ(10) > 1)
  assert.ok(expectedMaxZ(1000) > expectedMaxZ(10))
  assert.ok(expectedMaxZ(100000) > expectedMaxZ(1000))
})

test('deflated Sharpe: the same result is less convincing the more you tried', () => {
  const sharpe = 0.5, n = 40
  const one = deflatedSharpe(sharpe, n, 1)
  const many = deflatedSharpe(sharpe, n, 100000)
  assert.ok(one.probability > many.probability, 'more trials → lower confidence')
  assert.ok(many.benchmark > one.benchmark, 'more trials → higher bar')
  assert.ok(one.probability > 0.9, 'with one trial a real edge should read as convincing')
  assert.ok(many.probability < 0.5, 'after 100k trials the same result is inside chance')
})

test('too few trades cannot support any confidence', () => {
  const d = deflatedSharpe(2, 1, 1)
  assert.equal(d.probability, 0)
})
