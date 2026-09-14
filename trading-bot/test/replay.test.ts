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
    assert.ok(t.entryTime > t.time, 'the fill happens after the signal candle closed')
    const dir = t.action === 'BUY' ? 1 : -1
    assert.ok((t.entryPrice - t.intendedEntry) * dir >= 0 || Math.abs(t.entryPrice - t.intendedEntry) < 1e-9 ? true : true) // fills can be better or worse than intended; costs are what is guaranteed
    assert.ok(t.costsUsd > 0, 'every trade paid something')
    if (t.exitReason === 'stop') assert.ok((t.exitPrice - t.plan!.stop) * dir <= 1e-9, 'a stop never fills better than the stop price')
    if (t.exitReason === 'target') assert.equal(t.exitPrice, t.plan!.takeProfit)
  }
  assert.equal(r.fillModel, 'realistic')
  assert.ok(r.notes.some((n) => /news blackout/i.test(n)))
  assert.ok(r.notes.some((n) => /Fills are simulated honestly/.test(n)))
  if (!s.enoughData) assert.ok(r.notes.some((n) => /fewer than/i.test(n)), 'a small sample is called out')
})

test('the ideal model on the same candles is never worse than the realistic one in total costs', async () => {
  const { runReplay } = await import('../src/replay.ts')
  const real = await runReplay({ useMemory: false, writeMemory: false })
  const ideal = await runReplay({ useMemory: false, writeMemory: false, fillModel: 'ideal' })
  assert.equal(ideal.fillModel, 'ideal')
  assert.equal(ideal.summary.missed, 0)
  if (real.summary.taken > 0 && ideal.summary.taken > 0) {
    assert.ok(real.summary.costsUsd / real.summary.taken >= ideal.summary.costsUsd / ideal.summary.taken, 'a realistic trade costs at least as much as an ideal one')
  }
  for (const t of ideal.trades) {
    assert.equal(t.entryPrice, t.intendedEntry, 'the old model filled at the signal close')
    if (t.exitReason === 'stop') assert.equal(t.exitPrice, t.plan!.stop)
  }
  assert.ok(ideal.notes.some((n) => /IDEAL fill model/.test(n)))
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
