/**
 * THE STOCK DATA LAYER under failure: rate limits, server errors, malformed
 * bodies, dropped connections, truncated pages, duplicates, stale data and a
 * restart. Every response here is a SYNTHETIC TEST FIXTURE served by a fake
 * fetch; nothing reaches a real data provider.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Candle } from '../../src/types.ts'

const { fetchStockBars } = await import('../../src/markets/sources.ts')
const { StockDesk } = await import('../../src/stocks/desk.ts')
const { store } = await import('../../src/store.ts')

const NOW = Date.parse('2026-09-28T15:00:00Z')
const DAY = 86_400_000
type Reply = { status: number; body?: unknown; retryAfter?: string } | 'network'

function withKeys<T>(fn: () => Promise<T>): Promise<T> {
  const prev = { k: process.env.MRCASH_ALPACA_KEY, s: process.env.MRCASH_ALPACA_SECRET }
  process.env.MRCASH_ALPACA_KEY = 'TESTFIXTUREKEY'; process.env.MRCASH_ALPACA_SECRET = 'TESTFIXTURESECRET'
  return fn().finally(() => {
    if (prev.k === undefined) delete process.env.MRCASH_ALPACA_KEY; else process.env.MRCASH_ALPACA_KEY = prev.k
    if (prev.s === undefined) delete process.env.MRCASH_ALPACA_SECRET; else process.env.MRCASH_ALPACA_SECRET = prev.s
  })
}
/** A fake fetch that answers from a script per feed and records what was asked. */
function scripted(script: Record<'sip' | 'iex', Reply[]>) {
  const calls: string[] = []
  const fetchImpl = async (url: string) => {
    const feed = (new URL(url).searchParams.get('feed') ?? 'sip') as 'sip' | 'iex'
    calls.push(feed)
    const r = script[feed].length > 1 ? script[feed].shift()! : script[feed][0]
    if (r === 'network') throw new Error('socket hang up')
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, headers: { get: (n: string) => (n === 'retry-after' ? r.retryAfter ?? null : null) } }
  }
  return { fetchImpl, calls }
}
const bars = (sym: string, days: number[]) => ({ bars: { [sym]: days.map((d) => ({ t: new Date(NOW - d * DAY - DAY).toISOString(), o: 100, h: 101, l: 99, c: 100.5, v: 1_000_000 })) } })
const waits: number[] = []
const wait = async (ms: number) => { waits.push(ms) }

test('a rate limit is retried, honouring Retry-After, and the SIP feed still answers', async () => withKeys(async () => {
  waits.length = 0
  const { fetchImpl, calls } = scripted({ sip: [{ status: 429, retryAfter: '2' }, { status: 200, body: bars('NVDA', [3, 2, 1]) }], iex: [{ status: 500 }] })
  const r = await fetchStockBars(['NVDA'], '1Day', NOW - 10 * DAY, NOW, fetchImpl, ['sip', 'iex'], wait)
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.feed, 'sip'); assert.equal(r.bars.NVDA.length, 3) }
  assert.deepEqual(waits, [2000])
  assert.deepEqual(calls, ['sip', 'sip'])
}))

test('server errors are retried three times, then the IEX feed is used; a dropped connection is retried too', async () => withKeys(async () => {
  waits.length = 0
  const { fetchImpl, calls } = scripted({ sip: [{ status: 503 }], iex: ['network', { status: 200, body: bars('NVDA', [1]) }] })
  const r = await fetchStockBars(['NVDA'], '1Day', NOW - 10 * DAY, NOW, fetchImpl, ['sip', 'iex'], wait)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.feed, 'iex')
  assert.deepEqual(calls, ['sip', 'sip', 'sip', 'iex', 'iex'])
  assert.ok(waits.every((w) => w <= 10_000))
}))

test('a malformed body on every feed is a clear failure, never a guess', async () => withKeys(async () => {
  const { fetchImpl } = scripted({ sip: [{ status: 200, body: { nonsense: true } }], iex: [{ status: 200, body: 'not json at all' }] })
  const r = await fetchStockBars(['NVDA'], '1Day', NOW - 10 * DAY, NOW, fetchImpl, ['sip', 'iex'], wait)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.reason, /unexpected Alpaca response/)
}))

test('data that would arrive incomplete (pages that never end) is refused', async () => withKeys(async () => {
  const page = { ...bars('NVDA', [1]), next_page_token: 'more' }
  const { fetchImpl } = scripted({ sip: [{ status: 200, body: page }], iex: [{ status: 200, body: page }] })
  const r = await fetchStockBars(['NVDA'], '1Day', NOW - 10 * DAY, NOW, fetchImpl, ['sip', 'iex'], wait)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.reason, /more pages than expected/)
}))

test('the same bar served twice across pages is kept once', async () => withKeys(async () => {
  const { fetchImpl } = scripted({ sip: [{ status: 200, body: { ...bars('NVDA', [2, 1]), next_page_token: 'p2' } }, { status: 200, body: bars('NVDA', [1]) }], iex: [{ status: 500 }] })
  const r = await fetchStockBars(['NVDA'], '1Day', NOW - 10 * DAY, NOW, fetchImpl, ['sip', 'iex'], wait)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.bars.NVDA.length, 2)
}))

/** SYNTHETIC daily history ending `endDaysAgo` days before NOW. */
function daily(endDaysAgo: number, n = 60): Candle[] {
  return Array.from({ length: n }, (_, k) => { const t = NOW - (endDaysAgo + n - k) * DAY; return { openTime: t, closeTime: t + DAY - 1, open: 100, high: 101, low: 99, close: 100 + k * 0.1, volume: 2_000_000 } })
}

test('stale daily data is refused: nothing is evaluated against an old close', async () => {
  store().setJson('stocks:state', {})
  const names = ['SPY', 'QQQ', 'XLK', 'SMH', 'NVDA']
  const desk = new StockDesk({ now: () => NOW, headlines: async () => [], fetchBars: async (_s, tf) => ({ ok: true, feed: 'sip', bars: tf === '1Day' ? Object.fromEntries(names.map((s) => [s, daily(9)])) : {} }) })
  const c = await desk.cycle(false)
  assert.ok(c.lines.some((l) => /stock data is stale/.test(l)), c.lines.join(' | '))
  assert.equal(desk.snapshot().positions.length, 0)
})

test('after a restart the paper book, its positions and their stops carry on', async () => {
  store().setJson('stocks:state', {})
  const first = new StockDesk({ now: () => NOW, headlines: async () => [], fetchBars: async () => ({ ok: false, reason: 'offline' }) })
  first.setPaused(true)
  // A SYNTHETIC open position written the way the desk writes one, then a fresh desk reads it back.
  const state = store().getJson<Record<string, unknown>>('stocks:state') ?? {}
  store().setJson('stocks:state', { ...state, cash: 7_500, positions: [{ symbol: 'NVDA', theme: 'ai-chips', qty: 25, entry: 100, stop: 97, initialStop: 97, target: 106, openedAt: NOW - DAY, thesisLevel: null, trimmed: false, setup: 'TEST FIXTURE' }] })
  const second = new StockDesk({ now: () => NOW, headlines: async () => [], fetchBars: async () => ({ ok: false, reason: 'offline' }) })
  const s = second.snapshot()
  assert.equal(s.paused, true, 'pause survives a restart')
  assert.equal(s.positions.length, 1)
  assert.equal(s.positions[0].stop, 97, 'the stop survives a restart')
  assert.equal(s.account.cash, 7_500)
})
