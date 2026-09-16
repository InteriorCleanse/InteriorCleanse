/**
 * The researcher proposes campaigns as data — a fresh search where there is no
 * vetted instance, a replacement search where a champion is decaying — and it
 * proposes nothing for a family with a healthy champion. It never runs anything.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proposeCampaigns } from '../../src/ai/researcher.ts'
import type { Passport } from '../../src/vault/passport.ts'

function passport(strategyId: string, opts: { decaying?: boolean } = {}): Passport {
  return {
    id: `pass.${strategyId}#x`, strategyId, genome: { strategyId, params: { rr: 2 } }, createdAt: 1, origin: 'test', status: 'paper',
    oos: { trades: 30, avgR: 0.3, totalR: 9, sharpeR: 0.5, maxDrawdownR: 2, walkForward: null, monteCarlo: null }, oosLowerAvgR: 0.1,
    regimeFit: [], results: [], events: [],
    decay: { decaying: !!opts.decaying, reason: '', rollingExpectancy: null, cusumLow: 0, trades: 0 },
    reason: 'test',
  }
}

test('a strategy with no passport gets a full grid search', () => {
  const specs = proposeCampaigns({ tunableStrategyIds: ['crossover'], passports: [] })
  assert.equal(specs.length, 1)
  assert.equal(specs[0].strategyId, 'crossover')
  assert.equal(specs[0].method, 'grid')
  assert.match(specs[0].rationale, /No passport/)
})

test('a decaying champion with nothing healthy behind it gets an evolve search', () => {
  const specs = proposeCampaigns({ tunableStrategyIds: ['breakout'], passports: [passport('breakout', { decaying: true })] })
  assert.equal(specs.length, 1)
  assert.equal(specs[0].method, 'evolve')
  assert.match(specs[0].rationale, /decaying/)
})

test('a family with a healthy champion gets no proposal', () => {
  const specs = proposeCampaigns({ tunableStrategyIds: ['breakout'], passports: [passport('breakout')] })
  assert.equal(specs.length, 0)
})

test('proposals are deterministic and ordered by priority', () => {
  const a = proposeCampaigns({ tunableStrategyIds: ['crossover', 'breakout'], passports: [passport('breakout', { decaying: true })] })
  const b = proposeCampaigns({ tunableStrategyIds: ['crossover', 'breakout'], passports: [passport('breakout', { decaying: true })] })
  assert.deepEqual(a, b)
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].priority >= a[i].priority)
})

test('the researcher returns specs only — nothing here runs a campaign', () => {
  const specs = proposeCampaigns({ tunableStrategyIds: ['crossover'], passports: [] })
  // A spec is inert data: strategyId + method + seed + maxGenomes + rationale.
  assert.deepEqual(Object.keys(specs[0]).sort(), ['maxGenomes', 'method', 'priority', 'rationale', 'seed', 'strategyId'])
})
