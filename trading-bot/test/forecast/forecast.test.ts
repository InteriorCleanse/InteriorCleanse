/**
 * THE CALL DESK — up or down over each window, forecast from candles closed
 * by the window's start, settled against the real close, scored against a
 * coin flip. Never with hindsight, never an order.
 *
 * SYNTHETIC / TEST FIXTURE: every candle below is a seeded random walk.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Candle } from '../../src/types.ts'
import { forecastWindow, settle, tally, backtestWindows, MIN_CALLS } from '../../src/forecast/model.ts'
import { CallDesk } from '../../src/forecast/service.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const STEP = 300_000, W = 900_000
const T0 = Date.parse('2026-09-20T00:00:00Z')

/** SYNTHETIC: a seeded 5-minute random walk starting at T0. */
function walk(n: number, seed = 7, start = T0): Candle[] {
  let s = seed, p = 80_000
  const rnd = () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31 }
  return Array.from({ length: n }, (_, i) => {
    const o = p, c = p * (1 + (rnd() - 0.5) * 0.004)
    p = c
    return { openTime: start + i * STEP, closeTime: start + (i + 1) * STEP - 1, open: o, high: Math.max(o, c) * (1 + rnd() * 0.001), low: Math.min(o, c) * (1 - rnd() * 0.001), close: c, volume: 10 + rnd() * 20 }
  })
}

test('a forecast reads only candles closed by the window start', () => {
  const c = walk(300)
  const start = T0 + 200 * STEP
  const f = forecastWindow(c, start, W)!
  assert.ok(f)
  const changed = c.map((k, i) => (k.openTime >= start ? { ...k, close: k.close * (i % 2 ? 1.5 : 0.5), high: k.high * 2 } : k))
  assert.deepEqual(forecastWindow(changed, start, W), f, 'later candles cannot change the call')
  assert.equal(f.open, c[199].close)
  assert.equal(forecastWindow(walk(40), T0 + 40 * STEP, W), null, 'too little history: no forecast')
})

test('probability, call and line agree; readings explain the push', () => {
  for (const f of backtestWindows(walk(900, 3), W)) {
    assert.ok(f.pUp >= 0.2 && f.pUp <= 0.8)
    assert.equal(f.call, f.pUp >= 0.58 ? 'up' : f.pUp <= 0.42 ? 'down' : 'flat')
    assert.ok(f.difficulty >= 0 && f.difficulty <= 4)
    assert.equal(f.readings.length, 6)
    for (const r of f.readings) assert.ok(r.text.length > 0)
  }
})

test('settling: right, wrong, passed and void, with the Brier score', () => {
  const base = forecastWindow(walk(300), T0 + 200 * STEP, W)!
  const up = { ...base, pUp: 0.7, call: 'up' as const }
  assert.equal(settle(up, up.open + 1).result, 'right')
  assert.equal(settle(up, up.open + 1).brier, 0.09)
  assert.equal(settle(up, up.open - 1).result, 'wrong')
  assert.equal(settle({ ...up, call: 'flat' }, up.open + 1).result, 'passed')
  assert.equal(settle(up, up.open).result, 'void')
})

test('tally: hit rate over calls only, skill against a coin flip, NOT ENOUGH DATA below the minimum', () => {
  const rows = backtestWindows(walk(900, 5), W)
  const t = tally(rows)
  assert.equal(t.calls, t.right + t.wrong)
  assert.equal(t.forecasts, t.calls + t.passed)
  if (t.brier !== null) assert.equal(t.skill, Math.round((1 - t.brier / 0.25) * 1000) / 1000)
  assert.equal(t.status, t.calls >= MIN_CALLS ? 'OK' : 'NOT ENOUGH DATA')
  assert.equal(t.calibration.reduce((s, b) => s + b.count, 0), t.forecasts)
  assert.equal(tally([]).status, 'NOT ENOUGH DATA')
})

test('the desk forecasts the open window once, never a window already over, then settles and saves', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'desk-'))
  const all = walk(400, 9)
  let now = T0 + 300 * STEP + 60_000 // one minute into the window that opens at candle 300
  let have = all.slice(0, 300) // candles closed by then
  const desk = new CallDesk({ symbol: 'TSTUSDT', dir, now: () => now, candles: async () => have })
  const s1 = await desk.tick()
  assert.equal(s1.kind, 'PAPER FORECAST')
  assert.equal(s1.execution, 'NONE')
  assert.ok(s1.current, 'a forecast for the open window')
  assert.equal(s1.current!.windowStart, T0 + 300 * STEP)
  const again = await desk.tick()
  assert.deepEqual(again.current!.pUp, s1.current!.pUp, 'one forecast per window')
  // The window closes and its candles arrive: settled against the real close.
  now = T0 + 303 * STEP + 30_000; have = all.slice(0, 303)
  const s2 = await desk.tick()
  assert.equal(s2.log.length, 1)
  assert.equal(s2.log[0].close, all[302].close)
  assert.ok(existsSync(join(dir, 'forecasts.json')))
  assert.doesNotMatch(readFileSync(join(dir, 'forecasts.json'), 'utf8'), /order|size|qty/i)
  // A restart keeps the record.
  const reborn = new CallDesk({ symbol: 'TSTUSDT', dir, now: () => now, candles: async () => have })
  assert.equal((await reborn.tick()).log.length, 1)
  // No hindsight: with candles only up to an older window, nothing is back-filled.
  const late = new CallDesk({ symbol: 'TSTUSDT', dir: mkdtempSync(join(tmpdir(), 'desk-')), now: () => T0 + 390 * STEP, candles: async () => all.slice(0, 350) })
  const s3 = await late.tick()
  assert.equal(s3.current, null)
  assert.equal(s3.log.length, 0)
  assert.match(s3.status, /STALE CANDLES|WAITING FOR CANDLES/)
  assert.equal(s3.backtest?.label, 'BACKTEST', 'the history is shown separately, as a backtest')
})

test('walled off: the engine never imports the desk, and the desk has no network or order path', () => {
  for (const f of ['watch.ts', 'fusion.ts', 'riskEngine.ts', 'paperTrader.ts']) assert.doesNotMatch(readFileSync(join(ROOT, 'src', f), 'utf8'), /forecast\//, f)
  for (const f of ['model.ts', 'service.ts']) {
    const src = readFileSync(join(ROOT, 'src', 'forecast', f), 'utf8')
    assert.doesNotMatch(src, /\bfetch\(|placeOrder|submitOrder|paperTrader|ledger/i, f)
    assert.doesNotMatch(src, /\b(profitable|proven|guaranteed?|superior)\b|edge established|expected return/i, f)
  }
  assert.match(readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8'), /path === '\/api\/forecast'/)
})
