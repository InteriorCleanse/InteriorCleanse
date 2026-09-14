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
