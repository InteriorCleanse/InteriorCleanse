/**
 * The stream client against a local WebSocket server that speaks the
 * exchange's message shapes: parsing, the documented order-book stitch,
 * resync on a broken sequence, reconnect after a drop, and the silence
 * watchdog.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startWsServer } from './wsServer.ts'
import type { WsTestServer } from './wsServer.ts'
import { klineMsg, tradeMsg, tickerMsg, depthMsg, SYM } from './fixtures/stream.ts'
import { MarketBus } from '../src/data/bus.ts'
import { BinanceStream, streamUrl, probeStream } from '../src/data/binanceStream.ts'
import type { DepthSnapshot } from '../src/data/binanceStream.ts'

let ws: WsTestServer
before(async () => { ws = await startWsServer() })
after(async () => { await ws.close() })

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(fn: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now()
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await wait(20) }
}

test('the combined stream URL subscribes to the four streams for the symbol', () => {
  assert.equal(streamUrl('wss://host', 'BTCUSDT', '5m'), 'wss://host/stream?streams=btcusdt@kline_5m/btcusdt@aggTrade/btcusdt@bookTicker/btcusdt@depth@100ms')
})

test('connects, parses klines, trades and the book ticker, and stitches the book from a snapshot', async () => {
  const bus = new MarketBus()
  const seen: string[] = []
  const closed: number[] = []
  bus.on('candle:update', () => seen.push('update'))
  bus.on('candle:closed', (c) => { seen.push('closed'); closed.push(c.openTime) })
  bus.on('trade', (t) => seen.push(`trade:${t.side}`))
  bus.on('bookTicker', () => seen.push('ticker'))
  let books = 0
  bus.on('book', () => books++)
  const snapshot: DepthSnapshot = { lastUpdateId: 100, bids: [['100', '1'], ['99', '2']], asks: [['101', '1'], ['102', '2']] }
  const s = new BinanceStream({ hosts: [ws.url], symbol: SYM, interval: '5m', bus, depthSnapshot: async () => snapshot, reconnectMinMs: 50, reconnectMaxMs: 100, staleAfterMs: 60_000 })
  const ups: string[] = []
  bus.on('stream:up', (h) => ups.push(h.host ?? ''))
  s.start()
  await until(() => ups.length === 1)
  assert.match(ws.paths[0], /btcusdt@kline_5m/)
  // Depth events that arrive before the snapshot is applied are buffered; 101..103 straddle and follow it.
  ws.send(depthMsg(95, 99, [[100, 5]], []))      // older than the snapshot — must be dropped
  ws.send(depthMsg(100, 101, [[100, 3]], [[101, 0]]))
  ws.send(depthMsg(102, 103, [[98, 1]], [[103, 4]]))
  ws.send(klineMsg(1_000_000, 100, 101, 99, 100.5, false))
  ws.send(klineMsg(1_000_000, 100, 101, 99, 100.7, true))
  ws.send(tradeMsg(1, 2000, 100.6, 0.5, false))
  ws.send(tradeMsg(2, 2001, 100.5, 0.5, true))
  ws.send(tickerMsg(100.5, 1, 100.6, 2))
  await until(() => seen.includes('ticker') && s.book().synced)
  assert.deepEqual(closed, [1_000_000])
  assert.ok(seen.includes('update') && seen.includes('trade:buy') && seen.includes('trade:sell'))
  const book = s.book()
  assert.equal(book.synced, true)
  assert.equal(book.lastUpdateId, 103)
  assert.deepEqual(book.bids, [{ price: 100, qty: 3 }, { price: 99, qty: 2 }, { price: 98, qty: 1 }], 'the stale delta (qty 5) was dropped; the later ones applied in order')
  assert.deepEqual(book.asks, [{ price: 102, qty: 2 }, { price: 103, qty: 4 }], 'a zero quantity removes the level')
  const h = s.health()
  assert.equal(h.connected, true)
  assert.equal(h.host, ws.url)
  assert.ok(h.lastMessageAt.kline && h.lastMessageAt.aggTrade && h.lastMessageAt.bookTicker && h.lastMessageAt.depth)

  // A skipped sequence number breaks the book: it must be flagged and rebuilt from a fresh snapshot.
  const gaps: string[] = []
  bus.on('stream:gap', (what) => gaps.push(what))
  snapshot.lastUpdateId = 200
  snapshot.bids = [['100', '9']]
  ws.send(depthMsg(110, 111, [[100, 7]], []))
  await until(() => gaps.length === 1)
  assert.match(gaps[0], /depth sequence broke/)
  ws.send(depthMsg(201, 202, [[97, 1]], []))
  await until(() => s.book().synced && s.book().lastUpdateId === 202)
  assert.deepEqual(s.book().bids, [{ price: 100, qty: 9 }, { price: 97, qty: 1 }])
  s.stop()
})

test('reconnects on its own after the server drops the line, and reports the reconnect', async () => {
  const bus = new MarketBus()
  const s = new BinanceStream({ hosts: [ws.url], symbol: SYM, interval: '5m', bus, depthSnapshot: async () => ({ lastUpdateId: 1, bids: [], asks: [] }), reconnectMinMs: 30, reconnectMaxMs: 60, staleAfterMs: 60_000 })
  let ups = 0, downs = 0, reason = ''
  bus.on('stream:up', () => ups++)
  bus.on('stream:down', (_h, r) => { downs++; reason = r })
  const before = ws.connections
  s.start()
  await until(() => ups === 1)
  ws.dropAll()
  await until(() => ups === 2, 4000)
  assert.equal(ws.connections, before + 2)
  assert.equal(downs, 1)
  assert.match(reason, /socket closed/)
  assert.equal(s.health().reconnects, 1)
  assert.equal(s.health().connected, true)
  s.stop()
  assert.equal(s.health().connected, false)
})

test('silence longer than staleAfterMs triggers a reconnect', async () => {
  const bus = new MarketBus()
  const s = new BinanceStream({ hosts: [ws.url], symbol: SYM, interval: '5m', bus, depthSnapshot: async () => ({ lastUpdateId: 1, bids: [], asks: [] }), reconnectMinMs: 30, reconnectMaxMs: 60, staleAfterMs: 300 })
  let ups = 0
  const reasons: string[] = []
  bus.on('stream:up', () => ups++)
  bus.on('stream:down', (_h, r) => reasons.push(r))
  s.start()
  await until(() => ups === 1)
  await until(() => ups === 2, 4000)
  assert.ok(reasons.some((r) => /no message for/.test(r)), reasons.join('|'))
  s.stop()
})

test('a host that refuses is skipped for the next one', async () => {
  const bus = new MarketBus()
  const s = new BinanceStream({ hosts: ['ws://127.0.0.1:1', ws.url], symbol: SYM, interval: '5m', bus, depthSnapshot: async () => ({ lastUpdateId: 1, bids: [], asks: [] }), reconnectMinMs: 30, reconnectMaxMs: 60, staleAfterMs: 60_000 })
  let host = ''
  bus.on('stream:up', (h) => { host = h.host ?? '' })
  s.start()
  await until(() => host !== '', 5000)
  assert.equal(host, ws.url)
  s.stop()
})

test('probeStream says yes to a host that talks and no to one that does not', async () => {
  const probe = probeStream([ws.url], SYM, '5m', 2000)
  await wait(150)
  ws.send(tickerMsg(1, 1, 2, 2))
  const ok = await probe
  assert.equal(ok.ok, true)
  assert.equal(ok.host, ws.url)
  const bad = await probeStream(['ws://127.0.0.1:1'], SYM, '5m', 1500)
  assert.equal(bad.ok, false)
})
