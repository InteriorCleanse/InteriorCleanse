/** Exchange filters: step/tick rounding and the minimum notional. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { roundToStep, roundToTick, meetsMinNotional, applyFilters } from '../src/risk/filters.ts'

test('a quantity rounds DOWN to a whole number of steps, and 0 means no rounding', () => {
  assert.equal(roundToStep(1.2345, 0.01), 1.23)
  assert.equal(roundToStep(1.2399, 0.01), 1.23, 'never rounds up')
  assert.equal(roundToStep(0.7, 0), 0.7, 'step 0 is a no-op')
  assert.ok(Math.abs(roundToStep(0.30000000004, 0.1) - 0.3) < 1e-9, 'floating dust does not drop a step')
})

test('a price rounds to the nearest tick; 0 is a no-op', () => {
  assert.ok(Math.abs(roundToTick(100.037, 0.05) - 100.05) < 1e-9)
  assert.equal(roundToTick(100.037, 0), 100.037)
})

test('the minimum notional is a floor on order value; 0 disables it', () => {
  assert.equal(meetsMinNotional(0.001, 100_000, 10), true)
  assert.equal(meetsMinNotional(0.00001, 100_000, 10), false)
  assert.equal(meetsMinNotional(0.00001, 100_000, 0), true)
})

test('applyFilters is a no-op with everything at 0, and vetoes a too-small order otherwise', () => {
  const off = applyFilters(0.123456, 100_000, { tickSize: 0, stepSize: 0, minNotionalUsd: 0 })
  assert.equal(off.quantity, 0.123456)
  assert.equal(off.ok, true)
  const rounded = applyFilters(0.123456, 100_000, { tickSize: 0.01, stepSize: 0.001, minNotionalUsd: 10 })
  assert.equal(rounded.quantity, 0.123)
  assert.equal(rounded.ok, true)
  const tooSmall = applyFilters(0.00004, 100_000, { tickSize: 0, stepSize: 0.001, minNotionalUsd: 0 })
  assert.equal(tooSmall.ok, false, 'rounds to zero → cannot place')
  const belowMin = applyFilters(0.00005, 100_000, { tickSize: 0, stepSize: 0.00001, minNotionalUsd: 100 })
  assert.equal(belowMin.ok, false, 'worth $5, under the $100 minimum')
})
