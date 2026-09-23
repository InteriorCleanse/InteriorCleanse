/**
 * The runner's honesty rule: an order-flow strategy reads the live tape, which
 * candles cannot reconstruct, so it is reported "not backtestable" — never
 * quietly scored on a candle approximation. (The full candle-replay paths are
 * exercised end-to-end elsewhere; here we pin the refusal, which needs no feed.)
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import { runBacktest } from '../../src/backtest/runner.ts'

// Isolate the data directory before loading anything that captures DATA_DIR.
// Static imports are hoisted, so the assignment must precede a dynamic import.
const tmp = tempDataDir('mrcash-backtest-runner-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { metaById, strategyIds } = await import('../../src/strategies/registry.ts')
after(() => tmp.cleanup())

test('an unknown id is rejected before any replay is attempted', async () => {
  await assert.rejects(() => runBacktest('no-such-strategy'), /Unknown strategy/)
})

test('order-flow strategies are reported not backtestable, with no fabricated number', async () => {
  const tapeId = strategyIds().find((id) => metaById().get(id)?.needsTape)
  assert.ok(tapeId, 'there should be at least one order-flow strategy')
  const r = await runBacktest(tapeId!)
  assert.ok(r.notBacktestable, 'should carry the not-backtestable reason')
  assert.match(r.notBacktestable!, /tape/i)
  // No edge is quoted: every window is empty.
  assert.equal(r.all.trades, 0)
  assert.equal(r.outOfSample.trades, 0)
  assert.equal(r.walkForward, null)
})
