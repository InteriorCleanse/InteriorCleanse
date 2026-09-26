/**
 * SCALP DESK — the break-even arithmetic every scalper lives by, and a reading
 * of conditions that says stand aside when costs, the spread or the news
 * clock are against you. Never a signal, never an order.
 *
 * SYNTHETIC / TEST FIXTURE: every candle, book and calendar entry is made up.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Candle, CalendarEvent } from '../../src/types.ts'
import { breakEven, breakEvenCurve, roundTrip, scalpConditions } from '../../src/scalp/model.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const COSTS = { spreadBps: 1, feeBpsPerSide: 10, slippageBpsPerSide: 2 }
const CHEAP = { spreadBps: 0.5, feeBpsPerSide: 1, slippageBpsPerSide: 0.5 }

/** SYNTHETIC: 5-minute candles with a given per-candle range in bps and drift. */
function candles(n: number, rangeBps: number, drift = 0, start = Date.parse('2026-09-22T14:00:00Z')): Candle[] {
  let p = 80_000
  return Array.from({ length: n }, (_, i) => {
    const o = p, c = p * (1 + drift + (i % 2 ? 1 : -1) * rangeBps / 40_000)
    p = c
    const hi = Math.max(o, c) * (1 + rangeBps / 20_000), lo = Math.min(o, c) * (1 - rangeBps / 20_000)
    return { openTime: start + i * 300_000, closeTime: start + (i + 1) * 300_000 - 1, open: o, high: hi, low: lo, close: c, volume: 10 }
  })
}
const session = { name: 'New York AM', killzone: true, weekend: false, nextKillzoneMin: null, nextKillzoneLabel: null }

test('round trip: spread once, fee and slippage on both sides', () => {
  assert.equal(roundTrip(COSTS), 1 + 20 + 4)
})

test('break-even: the textbook formula, then the costs on top', () => {
  const b = breakEven(20, 20, { spreadBps: 10, feeBpsPerSide: 0, slippageBpsPerSide: 0 })
  assert.equal(b.rawBreakEven, 0.5)
  assert.equal(b.breakEven, 0.75, 'win nets 10, loss costs 30: 30 / 40')
  assert.equal(b.verdict, 'cost trap')
  const trap = breakEven(20, 20, COSTS)
  assert.equal(trap.breakEven, null, 'a 25 bps round trip on a 20 bps target: no win rate breaks even')
  assert.match(trap.note, /No win rate breaks even/)
  const ok = breakEven(100, 50, CHEAP)
  assert.equal(ok.verdict, 'workable')
  assert.ok(ok.breakEven! > ok.rawBreakEven)
  assert.throws(() => breakEven(0, 10, COSTS))
})

test('the curve falls as the target grows: small targets need very high win rates', () => {
  const c = breakEvenCurve(1, COSTS, [30, 60, 120, 240])
  const be = c.map((p) => p.breakEven!)
  for (let i = 1; i < be.length; i++) assert.ok(be[i] < be[i - 1])
  for (const p of c) assert.equal(p.rawBreakEven, 0.5)
})

test('conditions: stand aside when costs eat the move', () => {
  const r = scalpConditions({ candles: candles(60, 20), book: null, tape: null, session, calendar: [], blackoutNow: false, now: Date.parse('2026-09-22T19:00:00Z'), costs: COSTS, intervalMinutes: 5 })
  assert.equal(r.verdict, 'stand aside')
  assert.equal(r.readings.find((x) => x.key === 'costs')!.status, 'bad')
  assert.match(r.playbook[0], /Stand aside/)
})

test('conditions: stand aside inside the news window, whatever else is true', () => {
  const now = Date.parse('2026-09-22T19:00:00Z')
  const cal: CalendarEvent[] = [{ title: 'CPI', country: 'USD', time: now + 8 * 60_000, impact: 'High', forecast: '', previous: '' }]
  const r = scalpConditions({ candles: candles(60, 120, 0.001), book: null, tape: null, session, calendar: cal, blackoutNow: false, now, costs: CHEAP, intervalMinutes: 5 })
  assert.equal(r.verdict, 'stand aside')
  assert.match(r.readings.find((x) => x.key === 'news')!.text, /in 8 minutes/)
})

test('conditions: good with a liquid session, room over costs, a clean trend and a clear calendar', () => {
  const now = Date.parse('2026-09-22T19:00:00Z')
  const book = { time: now, price: 80_000, bestBid: 79_999.5, bestAsk: 80_000.5, spreadPct: 0.00125, bidUsd1pct: 1e6, askUsd1pct: 1e6, imbalance: 0.5, walls: [], levelsRead: 100 }
  const cal: CalendarEvent[] = [{ title: 'Jobless claims', country: 'USD', time: now + 5 * 3_600_000, impact: 'High', forecast: '', previous: '' }]
  const r = scalpConditions({ candles: candles(60, 120, 0.002), book, tape: null, session, calendar: cal, blackoutNow: false, now, costs: CHEAP, intervalMinutes: 5 })
  assert.equal(r.verdict, 'good', JSON.stringify(r.readings.map((x) => [x.key, x.status])))
  assert.ok(r.shape && r.shape.targetBps >= r.shape.stopBps)
  assert.match(r.note, /not a signal/)
})

test('too few candles: NOT ENOUGH DATA', () => {
  assert.equal(scalpConditions({ candles: candles(10, 50), book: null, tape: null, session, calendar: [], blackoutNow: false, now: 0, costs: COSTS, intervalMinutes: 5 }).verdict, 'NOT ENOUGH DATA')
})

test('walled off: the engine never imports the scalp desk; no network, no orders, no profitability words', () => {
  for (const f of ['watch.ts', 'fusion.ts', 'riskEngine.ts', 'paperTrader.ts']) assert.doesNotMatch(readFileSync(join(ROOT, 'src', f), 'utf8'), /scalp\//, f)
  const src = readFileSync(join(ROOT, 'src', 'scalp', 'model.ts'), 'utf8')
  assert.doesNotMatch(src, /\bfetch\(|placeOrder|submitOrder|Date\.now\(/)
  assert.doesNotMatch(src, /\b(profitable|proven|guaranteed?|superior)\b|edge established|expected return/i)
  const server = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8')
  assert.match(server, /path === '\/api\/scalp'/)
  assert.match(server, /path === '\/api\/scalp\/breakeven'/)
})
