/**
 * The candle store: store-first reads, REST only for what is missing,
 * gap detection and back-fill, known gaps remembered, stream candles
 * recorded once.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startMockFeeds, tempDataDir } from './helpers.ts'
import type { MockFeeds } from './helpers.ts'

const tmp = tempDataDir('mrcash-candles-')
process.env.MRCASH_DATA_DIR = tmp.dir
let feeds: MockFeeds
before(async () => { feeds = await startMockFeeds({ days: 5 }); process.env.MRCASH_MARKET_URL = feeds.url })
after(async () => { await feeds.close(); tmp.cleanup() })

const STEP = 300_000

test('findGaps groups missing open times into ranges', async () => {
  const { findGaps } = await import('../src/data/candleStore.ts')
  assert.deepEqual(findGaps([0, STEP, 3 * STEP, 6 * STEP], STEP, 0, 6 * STEP), [{ from: 2 * STEP, to: 2 * STEP }, { from: 4 * STEP, to: 5 * STEP }])
  assert.deepEqual(findGaps([], STEP, 0, 2 * STEP), [{ from: 0, to: 2 * STEP }])
  assert.deepEqual(findGaps([0, STEP], STEP, 0, STEP), [])
})

test('the first read fills the store from REST; the second read touches no network', async () => {
  const cs = await import('../src/data/candleStore.ts')
  const { config } = await import('../config.ts')
  const a = await cs.getCandles(config.symbol, config.interval, 300)
  assert.equal(a.length, 300)
  assert.equal(a[299].openTime - a[0].openTime, 299 * STEP)
  const hits = feeds.hits['/api/v3/klines']
  const b = await cs.getCandles(config.symbol, config.interval, 300)
  assert.deepEqual(b, a)
  assert.equal(feeds.hits['/api/v3/klines'], hits, 'served from disk')
  assert.equal(cs.storedCandleCount(config.symbol, config.interval), 300)
})

test('a hole in the middle is noticed, fetched, announced as a gap, and only the hole is fetched', async () => {
  const cs = await import('../src/data/candleStore.ts')
  const { store } = await import('../src/store.ts')
  const { bus } = await import('../src/data/bus.ts')
  const { config } = await import('../config.ts')
  const all = await cs.getCandles(config.symbol, config.interval, 300)
  const victim = all[150]
  store().db.prepare('DELETE FROM candles WHERE open_time = ?').run(victim.openTime)
  assert.equal(cs.storedCandleCount(config.symbol, config.interval), 299)
  const gaps: string[] = []
  const off = bus.on('stream:gap', (what) => gaps.push(what))
  const hits = feeds.hits['/api/v3/klines']
  const again = await cs.getCandles(config.symbol, config.interval, 300)
  off()
  assert.equal(again.length, 300)
  assert.equal(again[150].openTime, victim.openTime)
  assert.equal(feeds.hits['/api/v3/klines'], hits + 1, 'one request for the one hole')
  assert.equal(gaps.length, 1)
  assert.match(gaps[0], /Back-filled 1 candle/)
})

test('a range the exchange has no data for becomes a KNOWN gap and is not requested again', async () => {
  const cs = await import('../src/data/candleStore.ts')
  const { config } = await import('../config.ts')
  const first = feeds.rows[0][0]
  const before = first - 20 * STEP
  const hits = feeds.hits['/api/v3/klines']
  const rows = await cs.ensureRange(config.symbol, config.interval, before, first + 2 * STEP)
  assert.equal(rows[0].openTime, first, 'nothing before the exchange history exists')
  assert.ok(feeds.hits['/api/v3/klines'] > hits)
  const hits2 = feeds.hits['/api/v3/klines']
  await cs.ensureRange(config.symbol, config.interval, before, first + 2 * STEP)
  assert.equal(feeds.hits['/api/v3/klines'], hits2, 'the known gap is remembered')
})

test('a closed candle from the stream is recorded once and served on the next read', async () => {
  const cs = await import('../src/data/candleStore.ts')
  const { config } = await import('../config.ts')
  const last = cs.lastStoredCandle(config.symbol, config.interval)!
  const next = { openTime: last.openTime + STEP, closeTime: last.openTime + 2 * STEP - 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 3, complete: true, receivedAt: Date.now(), source: 'stream' as const }
  assert.equal(cs.recordClosedCandle(config.symbol, config.interval, next), true)
  assert.equal(cs.recordClosedCandle(config.symbol, config.interval, next), false, 'already there')
  assert.equal(cs.recordClosedCandle(config.symbol, config.interval, { ...next, openTime: next.openTime + STEP, complete: false }), false, 'a forming candle is never stored')
  assert.equal(cs.lastStoredCandle(config.symbol, config.interval)!.openTime, next.openTime)
})

test('getCandlesSince returns everything from a start time, store-first', async () => {
  const cs = await import('../src/data/candleStore.ts')
  const { config } = await import('../config.ts')
  const now = Date.now()
  const rows = await cs.getCandlesSince(config.symbol, config.interval, now - 86_400_000, now)
  assert.ok(rows.length >= 280 && rows.length <= 289)
  assert.ok(rows.every((c, i) => i === 0 || c.openTime - rows[i - 1].openTime === STEP), 'contiguous')
})
