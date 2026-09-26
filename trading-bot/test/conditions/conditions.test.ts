/**
 * MARKET CONDITIONS — trading hours and the conditions reading.
 * Every candle series here is a SYNTHETIC TEST FIXTURE built in the test.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { marketHours, usMarketHolidays, usEarlyCloses } from '../../src/conditions/hours.ts'
import { assessOne, assessConditions, currencyStrength, currenciesOf, type MarketInput } from '../../src/conditions/model.ts'
import type { Candle } from '../../src/types.ts'

const at = (iso: string) => Date.parse(iso)
const HOUR = 3_600_000

/** SYNTHETIC: a gently wandering hourly series ending just before `end`. */
function series(n: number, end: number, base = 100, amp = 0.2, vol = 1000): Candle[] {
  const out: Candle[] = []
  let p = base
  for (let i = 0; i < n; i++) {
    const t = end - (n - i) * HOUR
    const o = p, c = p + Math.sin(i * 0.7) * amp
    out.push({ openTime: t, closeTime: t + HOUR - 1, open: o, high: Math.max(o, c) + amp * 0.3, low: Math.min(o, c) - amp * 0.3, close: c, volume: vol })
    p = c
  }
  return out
}
const mk = (over: Partial<MarketInput> & { candles: Candle[] }): MarketInput => ({ key: 'crypto:BTCUSDT', label: 'BTC/USDT', kind: 'crypto', symbol: 'BTCUSDT', feed: 'live', provenance: 'TEST FIXTURE', changePct24h: 0, ...over })

test('US market holidays follow the exchange rules (Good Friday, observed dates, the New Year exception)', () => {
  const h26 = usMarketHolidays(2026)
  for (const d of ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']) assert.ok(h26.has(d), d)
  assert.equal(h26.size, 10)
  const h27 = usMarketHolidays(2027)
  for (const d of ['2027-03-26', '2027-06-18', '2027-07-05', '2027-12-24']) assert.ok(h27.has(d), d)
  // 2022-01-01 was a Saturday: NYSE did not close on Friday 2021-12-31.
  assert.equal(usMarketHolidays(2021).has('2021-12-31'), false)
  assert.ok(usEarlyCloses(2026).has('2026-11-27'))
})

test('options trade the regular session only; stocks have pre and after hours', () => {
  const afterBell = at('2026-09-28T21:30:00Z') // Monday 17:30 ET
  assert.equal(marketHours('option', afterBell).open, false)
  assert.equal(marketHours('stock', afterBell).phase, 'after-hours')
  const midday = at('2026-09-28T16:00:00Z')
  assert.equal(marketHours('option', midday).open, true)
  assert.equal(marketHours('option', at('2026-11-26T16:00:00Z')).open, false, 'Thanksgiving')
})

test('futures pause 17:00–18:00 ET; forex and futures close for the weekend; crypto never closes', () => {
  assert.equal(marketHours('future', at('2026-09-28T21:30:00Z')).phase, 'maintenance')
  assert.equal(marketHours('future', at('2026-09-28T22:30:00Z')).open, true)
  const saturday = at('2026-09-26T16:00:00Z')
  assert.equal(marketHours('forex', saturday).open, false)
  assert.equal(marketHours('future', saturday).open, false)
  assert.equal(marketHours('crypto', saturday).open, true)
  assert.equal(marketHours('forex', at('2026-09-27T22:30:00Z')).open, true, 'Sunday evening reopen')
  assert.equal(marketHours('forex', at('2026-09-28T21:00:00Z')).phase, 'rollover')
})

test('a calm market reads good; a shock candle reads poor', () => {
  const now = at('2026-09-28T16:00:00Z')
  const calm = assessOne(mk({ candles: series(200, now) }), [], now)
  assert.equal(calm.grade === 'good' || calm.grade === 'caution', true)
  assert.equal(calm.readings.some((r) => r.level === 'poor'), false)
  const shocked = series(200, now)
  const l = shocked[shocked.length - 1]
  shocked[shocked.length - 1] = { ...l, high: l.open + 6, low: l.open - 6, close: l.open - 5 }
  const r = assessOne(mk({ candles: shocked }), [], now)
  assert.equal(r.grade, 'poor')
  assert.ok(r.readings.find((x) => x.key === 'shock')!.level === 'poor')
})

test('a high-impact release for the market\'s currency puts it in the event window', () => {
  const now = at('2026-09-28T12:35:00Z')
  const cal = [{ time: at('2026-09-28T12:30:00Z'), country: 'USD', impact: 'High', title: 'CPI m/m' }]
  const eur = assessOne(mk({ key: 'forex:EURUSD', label: 'EUR/USD', kind: 'forex', symbol: 'EURUSD', candles: series(200, now, 1.08, 0.0005) }), cal, now)
  assert.equal(eur.grade, 'poor')
  assert.deepEqual(currenciesOf({ kind: 'forex', symbol: 'USDJPY' }), ['USD', 'JPY'])
  const gbpOnly = [{ time: at('2026-09-28T12:30:00Z'), country: 'GBP', impact: 'High', title: 'CPI y/y' }]
  const jpy = assessOne(mk({ key: 'forex:USDJPY', label: 'USD/JPY', kind: 'forex', symbol: 'USDJPY', candles: series(200, now, 148, 0.05) }), gbpOnly, now)
  assert.notEqual(jpy.readings.find((x) => x.key === 'news')!.level, 'poor', 'a GBP release is not a USD/JPY event')
})

test('a stale feed or thin history is NOT ENOUGH DATA, and a closed market says closed', () => {
  const now = at('2026-09-28T16:00:00Z')
  assert.equal(assessOne(mk({ candles: series(20, now) }), [], now).grade, 'blind')
  assert.equal(assessOne(mk({ candles: series(200, now), feed: 'stale' }), [], now).grade, 'blind')
  const sat = at('2026-09-26T16:00:00Z')
  assert.equal(assessOne(mk({ key: 'stock:AAPL', label: 'Apple', kind: 'stock', symbol: 'AAPL', candles: series(200, sat) }), [], sat).grade, 'closed')
})

test('currency strength ranks the majors against each other from the USD pairs', () => {
  const now = at('2026-09-28T16:00:00Z')
  const fx = (symbol: string, ch: number): MarketInput => mk({ key: `forex:${symbol}`, label: symbol, kind: 'forex', symbol, candles: series(200, now), changePct24h: ch })
  const s = currencyStrength([fx('EURUSD', 0.5), fx('USDJPY', 0.4), fx('GBPUSD', -0.2)])!
  assert.equal(s[0].ccy, 'EUR')
  assert.equal(s[s.length - 1].ccy, 'JPY', 'USD/JPY up means the yen weakened')
  assert.ok(Math.abs(s.reduce((a, x) => a + x.score, 0)) < 1e-9, 'centred on the average')
  assert.equal(currencyStrength([fx('EURUSD', 0.5)]), null)
})

test('the verdict: POOR when the engine\'s market is poor, NOT ENOUGH DATA when it cannot be read', () => {
  const now = at('2026-09-28T16:00:00Z')
  const calm = mk({ candles: series(200, now) })
  const ok = assessConditions({ markets: [calm], calendar: [], now, engineKey: 'crypto:BTCUSDT' })
  assert.notEqual(ok.verdict, 'POOR')
  assert.equal(ok.wouldStop, false)
  const shocked = series(200, now); const l = shocked[shocked.length - 1]
  shocked[shocked.length - 1] = { ...l, high: l.open + 6, low: l.open - 6 }
  const bad = assessConditions({ markets: [mk({ candles: shocked })], calendar: [], now, engineKey: 'crypto:BTCUSDT' })
  assert.equal(bad.verdict, 'POOR')
  assert.equal(bad.wouldStop, true)
  const blind = assessConditions({ markets: [mk({ candles: series(10, now) })], calendar: [], now, engineKey: 'crypto:BTCUSDT' })
  assert.equal(blind.verdict, 'NOT ENOUGH DATA')
  assert.equal(blind.wouldStop, false)
  assert.equal(bad.label, 'READING')
  assert.equal(bad.assets.length, 5, 'crypto, forex, stocks, options, futures')
})
