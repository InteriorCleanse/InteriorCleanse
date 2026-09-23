import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startMockFeeds, tempDataDir } from './helpers.ts'
import type { MockFeeds } from './helpers.ts'

const tmp = tempDataDir('mrcash-watch-')
process.env.MRCASH_DATA_DIR = tmp.dir
let feeds: MockFeeds
before(async () => { feeds = await startMockFeeds({ days: 6 }); process.env.MRCASH_MARKET_URL = feeds.url; process.env.MRCASH_NEWS_URL = feeds.url })
after(async () => { await feeds.close(); tmp.cleanup() })

test('the event log numbers events, keeps the last 300, answers since(), and persists each one', async () => {
  const { EventLog } = await import('../src/watch.ts')
  const log = new EventLog()
  for (let i = 0; i < 305; i++) log.push('info', `e${i}`, 'body', 'info')
  assert.equal(log.events.length, 300)
  assert.equal(log.latest(2).length, 2)
  assert.equal(log.since(303).length, 2)
  const file = join(tmp.dir, 'events.jsonl')
  assert.equal(existsSync(file), true)
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 305)
})

test('the watch loop runs a cycle when a candle closes on the bus, one at a time, and the timer is only a safety net', async () => {
  const { startWatch } = await import('../src/watch.ts')
  const { bus } = await import('../src/data/bus.ts')
  const w = startWatch(60)
  await new Promise((r) => setTimeout(r, 50))
  const t0 = Date.now()
  while (w.stats().cycles < 1) { if (Date.now() - t0 > 30_000) throw new Error('start cycle did not run'); await new Promise((r) => setTimeout(r, 50)) }
  assert.equal(w.stats().lastTrigger, 'start')
  const before = w.stats().cycles
  const c = { openTime: 0, closeTime: 1, open: 1, high: 1, low: 1, close: 1, volume: 0, complete: true, receivedAt: Date.now(), source: 'rest' as const }
  bus.emit('candle:closed', c)
  bus.emit('candle:closed', c) // a second close during the cycle queues exactly one more, not two
  bus.emit('candle:closed', c)
  const t1 = Date.now()
  while (w.stats().cycles < before + 2) { if (Date.now() - t1 > 30_000) throw new Error('candle cycles did not run'); await new Promise((r) => setTimeout(r, 50)) }
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(w.stats().cycles, before + 2, 'three closes during one cycle ran two cycles, not three')
  assert.equal(w.stats().lastTrigger, 'candle')
  w.stop()
})

test('one watch cycle on the stand-in feed produces a snapshot, opens nothing while the kill switch is on, and repeats cleanly', async () => {
  const { watchOnce, eventLog } = await import('../src/watch.ts')
  const { stop, resume } = await import('../src/killswitch.ts')
  const { readPositions } = await import('../src/paperTrader.ts')
  stop('watch test')
  const first = await watchOnce(null)
  assert.ok(first.snap.analysis, 'ICT analysis present')
  assert.ok(first.snap.state)
  assert.equal(readPositions().open.length, 0)
  const second = await watchOnce(first)
  assert.ok(second.at >= first.at)
  assert.ok(eventLog.events.every((e) => typeof e.title === 'string' && e.id > 0))
  resume()
})
