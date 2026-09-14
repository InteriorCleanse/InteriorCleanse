/**
 * The look-back test on the stand-in feed: deterministic, honest about
 * its own limits, and never writes memory when told not to.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startMockFeeds, tempDataDir } from './helpers.ts'
import type { MockFeeds } from './helpers.ts'

const tmp = tempDataDir('mrcash-replay-')
process.env.MRCASH_DATA_DIR = tmp.dir
let feeds: MockFeeds
before(async () => { feeds = await startMockFeeds({ days: 12 }); process.env.MRCASH_MARKET_URL = feeds.url; process.env.MRCASH_NEWS_URL = feeds.url })
after(async () => { await feeds.close(); tmp.cleanup() })

test('the same candles replay to the same trade list twice', async () => {
  const { runReplay } = await import('../src/replay.ts')
  const a = await runReplay({ useMemory: false, writeMemory: false })
  const b = await runReplay({ useMemory: false, writeMemory: false })
  assert.deepEqual(a.trades, b.trades)
  assert.deepEqual(a.summary, b.summary)
  assert.equal(a.strategy, 'ict')
  assert.ok(a.candlesUsed > 288 * 10)
})

test('the scoreboard adds up and every trade has a recognised exit', async () => {
  const { runReplay } = await import('../src/replay.ts')
  const r = await runReplay({ useMemory: false, writeMemory: false })
  const s = r.summary
  assert.equal(s.taken, s.wins + s.losses + s.flat)
  assert.equal(s.taken, r.trades.filter((t) => !t.blockedByMemory).length)
  for (const t of r.trades) {
    assert.ok(['target', 'stop', 'time'].includes(t.exitReason), t.exitReason)
    assert.ok(t.plan, 'every ICT trade carries its plan')
    assert.equal(t.action === 'BUY', t.plan!.direction === 'long')
    if (t.exitReason === 'stop') assert.equal(t.exitPrice, t.plan!.stop, 'a stop fills at the stop price (idealised until Phase 4)')
    if (t.exitReason === 'target') assert.equal(t.exitPrice, t.plan!.takeProfit)
  }
  assert.ok(r.notes.some((n) => /news blackout/i.test(n)))
  if (!s.enoughData) assert.ok(r.notes.some((n) => /fewer than/i.test(n)), 'a small sample is called out')
})

test('writeMemory:false leaves the ledger untouched; writeMemory:true records outcomes', async () => {
  const { runReplay } = await import('../src/replay.ts')
  const { LEDGER_PATH, readLedger } = await import('../src/memory.ts')
  await runReplay({ useMemory: false, writeMemory: false })
  const before = existsSync(LEDGER_PATH) ? readLedger().length : 0
  assert.equal(before, 0)
  const r = await runReplay({ useMemory: false, writeMemory: true })
  const rows = readLedger()
  assert.equal(rows.length, r.trades.length)
  for (const row of rows) assert.equal(row.mode, 'replay-raw')
  if (rows.length) assert.match(readFileSync(LEDGER_PATH, 'utf8'), /replay-raw/)
})

test('a memory replay on the recorded outcomes never blocks more setups than exist', async () => {
  const { runReplay, scoreSkippedTrades } = await import('../src/replay.ts')
  const r = await runReplay({ useMemory: true, writeMemory: false })
  assert.ok(r.summary.skipped <= r.summary.totalSetups)
  const score = scoreSkippedTrades(r)
  assert.equal(score.count, r.trades.filter((t) => t.blockedByMemory).length)
  assert.ok(score.avoidedLoss >= 0 && score.missedProfit >= 0)
})
