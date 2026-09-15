/**
 * The runner's honesty rule: an order-flow strategy reads the live tape, which
 * candles cannot reconstruct, so it is reported "not backtestable" — never
 * quietly scored on a candle approximation. (The full candle-replay paths are
 * exercised end-to-end elsewhere; here we pin the refusal, which needs no feed.)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBacktest } from '../../src/backtest/runner.ts'
import { metaById, strategyIds } from '../../src/strategies/registry.ts'

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
