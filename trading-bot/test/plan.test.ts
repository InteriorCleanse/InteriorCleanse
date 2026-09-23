import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from './helpers.ts'

const tmp = tempDataDir('mrcash-plan-')
process.env.MRCASH_DATA_DIR = tmp.dir
const p = await import('../src/plan.ts')
after(() => tmp.cleanup())

test('a plan is read back exactly, only counts for its own day, and can be cleared twice', () => {
  assert.equal(p.readPlan(), null)
  const plan = { dayKey: '2026-01-15', armedAt: 1, allow: 'long' as const, riskPerTradePercent: 0.5, maxTrades: 1, notes: 'n', proposal: 'p' }
  p.writePlan(plan)
  assert.deepEqual(p.readPlan(), plan)
  assert.deepEqual(p.planFor('2026-01-15'), plan)
  assert.equal(p.planFor('2026-01-16'), null)
  p.clearPlan(); p.clearPlan()
  assert.equal(p.readPlan(), null)
})
