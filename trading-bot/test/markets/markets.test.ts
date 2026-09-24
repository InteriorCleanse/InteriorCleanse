/**
 * Market watch: parsers, the scan, the service's isolation and alerts, and the
 * read-only guarantee. Every candle here is a TEST FIXTURE (SYNTHETIC).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Candle } from '../../src/types.ts'
import { parseKrakenOhlc, parseAlpacaBars, parseWatchlist, safeReason, fetchStocks, fetchForex } from '../../src/markets/sources.ts'
import { scanMarket } from '../../src/markets/scan.ts'
import { MarketWatch } from '../../src/markets/service.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const H = 3_600_000
// TEST FIXTURE: a Wednesday, 2026-09-23 00:00 UTC.
const T0 = Date.UTC(2026, 8, 23, 0, 0, 0)

/** SYNTHETIC hourly candles, oldest first. */
function candles(n: number, start: number, price = (i: number) => 100 + Math.sin(i / 5)): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const p = price(i)
    return { openTime: start + i * H, closeTime: start + (i + 1) * H - 1, open: p, high: p + 0.5, low: p - 0.5, close: p + 0.1, volume: 10 }
  })
}

test('watchlist: parsed from the env string, malformed entries skipped, never guessed', () => {
  const w = parseWatchlist('crypto:btcusdt, forex:EURUSD,stock:AAPL,index:SPY,nonsense,shares:XYZ,crypto:BTCUSDT')
  assert.deepEqual(w.map((x) => `${x.kind}:${x.symbol}:${x.source}`), ['crypto:BTCUSDT:binance', 'forex:EURUSD:kraken', 'stock:AAPL:alpaca', 'index:SPY:alpaca'])
  assert.equal(w.find((x) => x.symbol === 'SPY')!.label, 'S&P 500 (via SPY)', 'an index is watched through its ETF and says so')
  assert.ok(parseWatchlist().length >= 8, 'the default list covers crypto, stocks, forex and indexes')
})

test('Kraken OHLC: rows parsed, the still-forming last candle dropped, errors surfaced', () => {
  const body = { error: [], result: { ZEURZUSD: [[1790000000, '1.0850', '1.0870', '1.0840', '1.0860', '1.0855', '120.5', 40], [1790003600, '1.0860', '1.0880', '1.0850', '1.0875', '1.0866', '98.1', 31], [1790007200, '1.0875', '1.0876', '1.0870', '1.0871', '1.0873', '3.2', 2]], last: 1790007200 } }
  const c = parseKrakenOhlc(body)
  assert.equal(c.length, 2)
  assert.equal(c[0].openTime, 1790000000 * 1000)
  assert.equal(c[1].close, 1.0875)
  assert.throws(() => parseKrakenOhlc({ error: ['EQuery:Unknown asset pair'] }), /Unknown asset pair/)
})

test('Alpaca bars: per-symbol candles, sorted, the forming bar excluded', () => {
  const now = Date.parse('2026-09-23T15:30:00Z')
  const body = { bars: { AAPL: [{ t: '2026-09-23T14:00:00Z', o: 190, h: 191, l: 189.5, c: 190.5, v: 1000 }, { t: '2026-09-23T13:00:00Z', o: 189, h: 190.2, l: 188.8, c: 190, v: 900 }, { t: '2026-09-23T15:00:00Z', o: 190.5, h: 190.9, l: 190.1, c: 190.7, v: 300 }] } }
  const c = parseAlpacaBars(body, now).AAPL
  assert.equal(c.length, 2)
  assert.ok(c[0].openTime < c[1].openTime)
})

test('stocks without keys say NOT CONNECTED rather than inventing a price', async () => {
  const prev = { k: process.env.MRCASH_ALPACA_KEY, s: process.env.MRCASH_ALPACA_SECRET }
  delete process.env.MRCASH_ALPACA_KEY; delete process.env.MRCASH_ALPACA_SECRET
  try {
    const r = await fetchStocks(['AAPL'], Date.now(), async () => { throw new Error('must not be called') })
    assert.equal(r.AAPL.ok, false)
    assert.match((r.AAPL as { reason: string }).reason, /not connected/)
  } finally {
    if (prev.k) process.env.MRCASH_ALPACA_KEY = prev.k
    if (prev.s) process.env.MRCASH_ALPACA_SECRET = prev.s
  }
})

test('keys and long tokens are redacted from anything that reaches the page', () => {
  assert.equal(safeReason(new Error('bad key PKABCDEFGHIJKLMNOPQRSTUV in header')), 'bad key [redacted] in header')
  const src = readFileSync(join(ROOT, 'src', 'markets', 'sources.ts'), 'utf8')
  assert.equal(/console\.(log|error)\([^)]*(key|secret)/i.test(src), false, 'keys are never logged')
})

test('a feed failure is reported, not hidden', async () => {
  const r = await fetchForex('EURUSD', async () => ({ ok: false, status: 503, json: async () => ({}) }))
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /503/)
})

test('scan: price, 24h move and range come straight from the candles', () => {
  const c = candles(72, T0)
  const now = c[71].closeTime + 60_000
  const s = scanMarket(c, 'crypto', 'TESTUSDT', now)
  assert.equal(s.price, c[71].close)
  assert.equal(s.status, 'live')
  const win = c.filter((x) => x.openTime > c[71].closeTime - 24 * H)
  assert.equal(s.high24h, Math.max(...win.map((x) => x.high)))
  assert.ok(Math.abs(s.changePct24h! - ((c[71].close - win[0].open) / win[0].open) * 100) < 1e-9)
  assert.equal(s.spark.length, 48)
})

test('scan: too few candles is NOT ENOUGH DATA, never an estimate', () => {
  const s = scanMarket([], 'stock', 'TEST', T0)
  assert.equal(s.price, null)
  assert.equal(s.statusText, 'NOT ENOUGH DATA')
  const few = scanMarket(candles(3, T0), 'crypto', 'TEST', T0 + 3 * H)
  assert.equal(few.changePct24h, null)
  assert.equal(few.trend, null)
})

test('scan: a raid on yesterday\'s high is noted once; an old stock bar reads as closed, not live', () => {
  // Yesterday (UTC) trades between 99.5 and 100.5; today the last candle wicks to 101 and closes at 100.2.
  const c = candles(48, T0 - 24 * H, () => 100)
  const last = c[c.length - 1]
  Object.assign(last, { high: 101, close: 100.2 })
  const s = scanMarket(c, 'crypto', 'TESTUSDT', last.closeTime + 1000)
  assert.ok(s.prevDay)
  const raid = s.notes.filter((x) => x.kind === 'swept-high')
  assert.equal(raid.length, 1)
  assert.match(raid[0].text, /yesterday's high/)
  const old = scanMarket(c, 'stock', 'TEST', last.closeTime + 20 * H)
  assert.equal(old.status, 'closed')
})

test('service: one feed failing does not blank the others; each observation alerts once', async () => {
  const alerts: string[] = []
  let now = T0 + 72 * H
  const crypto = candles(72, T0, () => 100)
  const w = new MarketWatch({
    watchlist: parseWatchlist('crypto:TESTUSDT,forex:EURUSD,stock:AAPL'),
    alert: (t) => alerts.push(t),
    now: () => now,
    fetchers: {
      crypto: async () => ({ ok: true, candles: crypto }),
      forex: async () => { throw new Error('boom') },
      stocks: async () => ({ AAPL: { ok: false, reason: 'not connected: add keys' } }),
    },
  })
  const snap = await w.refresh()
  assert.equal(snap.execution, 'READ-ONLY')
  const by = Object.fromEntries(snap.rows.map((r) => [r.symbol, r]))
  assert.equal(by.TESTUSDT.provenance, 'LIVE DATA')
  assert.equal(by.EURUSD.provenance, 'UNAVAILABLE')
  assert.equal(by.AAPL.provenance, 'NOT CONNECTED')
  assert.equal(by.EURUSD.scan.price, null)
  assert.equal(alerts.length, 0, 'the first pass learns the board without replaying it into the bell')

  // A fresh raid on yesterday's high appears on the next pass: one alert, then silence.
  const next = candles(73, T0, () => 100)
  Object.assign(next[72], { high: 101, close: 100.2 })
  crypto.splice(0, crypto.length, ...next)
  now = next[72].closeTime + 1000
  await w.refresh()
  await w.refresh()
  assert.equal(alerts.filter((a) => /swept high/.test(a)).length, 1)
})

test('the market watch has no order path: reads only, and never touches the engine', () => {
  const dir = join(ROOT, 'src', 'markets')
  for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), 'utf8')
    assert.equal(/\/v2\/orders|\/order\b|AddOrder|CancelOrder|method:\s*['"](POST|PUT|DELETE|PATCH)/i.test(src), false, `${f} must not reach an order endpoint`)
    assert.equal(/paperTrader|riskEngine|live\/|execution\.ts|placeOrder|submitOrder/.test(src), false, `${f} must not reach the paper book, risk engine or execution`)
  }
})
