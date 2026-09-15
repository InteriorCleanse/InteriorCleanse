/**
 * The market feed end to end: the REST heartbeat as the whole feed when
 * the stream is off, the stream writing closed candles to the store, and
 * a candle never being announced twice whichever path brought it.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startMockFeeds, tempDataDir } from './helpers.ts'
import type { MockFeeds } from './helpers.ts'
import { startWsServer } from './wsServer.ts'
import type { WsTestServer } from './wsServer.ts'
import { klineMsg, tickerMsg } from './fixtures/stream.ts'

const tmp = tempDataDir('mrcash-feed-')
process.env.MRCASH_DATA_DIR = tmp.dir
let feeds: MockFeeds
let ws: WsTestServer
before(async () => { feeds = await startMockFeeds({ days: 3 }); ws = await startWsServer(); process.env.MRCASH_MARKET_URL = feeds.url; process.env.MRCASH_STREAM_URL = ws.url })
after(async () => { await feeds.close(); await ws.close(); tmp.cleanup() })

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(fn: () => boolean, ms = 4000): Promise<void> { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await wait(20) } }

test('with the stream off, the heartbeat IS the feed: it fills the store over REST and announces the closes once', async () => {
  const { MarketFeed } = await import('../src/data/feed.ts')
  const { bus } = await import('../src/data/bus.ts')
  const cs = await import('../src/data/candleStore.ts')
  const { config } = await import('../config.ts')
  const feed = new MarketFeed()
  const announced: Array<{ openTime: number; source: string }> = []
  const off = bus.on('candle:closed', (c) => announced.push({ openTime: c.openTime, source: c.source }))
  feed.start({ stream: false, heartbeatMs: 60_000 })
  try {
  assert.equal(feed.health().mode, 'rest')
  const filled = await feed.runHeartbeat()
  assert.ok(filled >= 1, 'an empty store means the heartbeat fetches the latest candles')
  assert.ok(announced.length >= 1)
  assert.ok(announced.every((a) => a.source === 'rest'))
  assert.equal(cs.lastStoredCandle(config.symbol, config.interval)!.openTime, cs.lastClosedOpenTime(config.interval))
  const again = await feed.runHeartbeat()
  assert.equal(again, 0, 'nothing new: nothing announced')
  assert.equal(feed.health().lastClosed?.via, 'rest')
  assert.equal(feed.health().heartbeat?.filled, 0)
  } finally { off(); feed.stop() }
})

test('with the stream on, a closed kline is stored and announced, and the heartbeat then has nothing to add', async () => {
  const { MarketFeed } = await import('../src/data/feed.ts')
  const { bus } = await import('../src/data/bus.ts')
  const cs = await import('../src/data/candleStore.ts')
  const { config } = await import('../config.ts')
  const feed = new MarketFeed()
  const announced: Array<{ openTime: number; source: string }> = []
  const off = bus.on('candle:closed', (c) => announced.push({ openTime: c.openTime, source: c.source }))
  let up = false
  bus.once('stream:up', () => { up = true })
  feed.start({ stream: true, heartbeatMs: 60_000 })
  try {
  await until(() => up)
  assert.equal(feed.health().mode, 'stream')
  ws.send(tickerMsg(100.5, 1, 100.6, 2))
  await until(() => feed.health().price !== null)
  assert.ok(Math.abs((feed.health().price ?? 0) - 100.55) < 1e-9)
  // Pretend the exchange just closed the candle after the last one on disk.
  const last = cs.lastStoredCandle(config.symbol, config.interval)!
  const t = last.openTime + 300_000
  ws.send(klineMsg(t, 1, 2, 0.5, 1.5, false))
  ws.send(klineMsg(t, 1, 2, 0.5, 1.7, true))
  await until(() => announced.some((a) => a.openTime === t))
  assert.equal(announced.filter((a) => a.openTime === t).length, 1)
  assert.equal(cs.lastStoredCandle(config.symbol, config.interval)!.openTime, t)
  assert.equal(feed.health().lastClosed?.via, 'stream')
  const filled = await feed.runHeartbeat(t + 300_000 + 1000)
  assert.equal(filled, 0, 'the stream already delivered it; REST adds nothing and does not re-announce')
  assert.match(feed.describe(), /live stream/)
  } finally { off(); feed.stop() }
  assert.equal(feed.health().mode, 'off')
})
