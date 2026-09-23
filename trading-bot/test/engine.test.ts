/**
 * The engine on hand-built days: the fixture day fires exactly once with
 * the documented evidence, the quiet day never fires, the risk module
 * sizes from the stop, and the session clock survives the DST switch.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from './helpers.ts'
import { setupDay, noSetupDay, bothHitCandle, dstFallBackCandles, mk } from './fixtures/candles.ts'
import { IctEngine } from '../src/ictStrategy.ts'
import { checkRisk } from '../src/risk.ts'
import { toET, tradingDayKey, sessionAt } from '../src/sessions.ts'
import type { PaperPosition } from '../src/paperTrader.ts'
import type { Signal } from '../src/types.ts'
import { config } from '../config.ts'

// Isolate the data directory before loading anything that captures DATA_DIR.
// Static imports are hoisted, so the assignment must precede a dynamic import.
const tmp = tempDataDir('mrcash-engine-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { evaluateExit } = await import('../src/paperTrader.ts')
after(() => tmp.cleanup())

test('the setup day produces exactly one BUY, at the retest candle, with the full evidence list', () => {
  const { candles, retestAt } = setupDay()
  const engine = new IctEngine(candles)
  const actions: string[] = []
  let buy: Signal | null = null
  for (let i = 0; i < candles.length; i++) {
    const a = engine.step(i)
    actions.push(a.signal.action)
    if (a.signal.action === 'BUY') buy = a.signal
  }
  assert.equal(actions.filter((x) => x === 'BUY').length, 1)
  assert.equal(actions.indexOf('BUY'), retestAt)
  assert.ok(buy && buy.plan)
  assert.deepEqual(buy!.evidence.map((e) => e.step), ['Trading day', 'Killzone', 'Asia range', 'Liquidity sweep', 'Displacement', 'Inversion FVG', 'Retest', 'Stop & target', 'News', 'Daily limits', 'Your plan'])
  assert.ok(buy!.evidence.every((e) => e.passed))
  assert.equal(buy!.plan!.direction, 'long')
  assert.ok(buy!.plan!.stop < buy!.plan!.entry && buy!.plan!.takeProfit > buy!.plan!.entry)
  assert.ok(buy!.plan!.rr >= config.ict.minRR)
  assert.match(buy!.setupKey, /^BTCUSDT\|5m\|ICT\|london\|long\|asia-low\|IFVG$/)
  // Regression value for the baseline scorer on this day: 50 base + 15 structure shift + 10 inverted gap + 10 bias agrees.
  assert.equal(buy!.quality, 85)
})

test('the same engine records its own trade and then obeys the daily limits', () => {
  const { candles } = setupDay()
  const engine = new IctEngine(candles)
  let dayKey = ''
  for (let i = 0; i < candles.length; i++) dayKey = engine.step(i).dayKey
  for (let k = 0; k < config.ict.maxTradesPerDay; k++) engine.recordTrade(dayKey, -1)
  const extra = mk(candles[candles.length - 1].openTime + 300_000, 103.9, 104.2, 103.4, 103.9)
  const engine2 = new IctEngine([...candles, extra])
  for (let k = 0; k < config.ict.maxTradesPerDay; k++) engine2.recordTrade(dayKey, -1)
  const last = engine2.step(candles.length)
  assert.equal(last.tradesToday, config.ict.maxTradesPerDay)
  assert.notEqual(last.signal.action, 'BUY')
})

test('a quiet day never fires and explains what it is waiting for', () => {
  const candles = noSetupDay()
  const engine = new IctEngine(candles)
  let last = engine.step(0)
  for (let i = 1; i < candles.length; i++) last = engine.step(i)
  assert.equal(last.signal.action, 'HOLD')
  const firstFail = last.signal.evidence.find((e) => !e.passed)
  assert.ok(firstFail, 'a HOLD always names the step it is waiting on')
  assert.ok(['Killzone', 'Liquidity sweep'].includes(firstFail!.step), firstFail!.step)
})

test('the risk module sizes from the stop and never exceeds the caps', () => {
  const sig = (entry: number, stop: number, tp: number): Signal => ({ action: 'BUY', reason: '', price: entry, time: 0, setupKey: 'T', evidence: [], plan: { direction: 'long', entry, stop, takeProfit: tp, rr: (tp - entry) / (entry - stop), entryLabel: '', stopLabel: '', targetLabel: '' } })
  const r = checkRisk(sig(100, 99.5, 101))
  assert.equal(r.approved, true)
  assert.ok(r.positionValueUsd <= Math.min(config.maxPositionValueUsd, config.accountSizeUsd) + 1e-9)
  assert.ok(r.riskUsd <= config.accountSizeUsd * config.riskPerTradePercent / 100 + 1e-9)
  assert.equal(checkRisk({ ...sig(100, 99, 102), action: 'HOLD' }).finalAction, 'HOLD')
  assert.equal(checkRisk(sig(100, 100, 102)).approved, false, 'stop on the entry')
  assert.equal(checkRisk(sig(100, 96, 110)).approved, false, 'stop wider than 3 %')
})

test('a candle that hits both stop and target counts as a stop (pessimistic), filled a little worse than the stop', () => {
  const t = Date.UTC(2026, 0, 15, 14, 0)
  const pos: PaperPosition = { id: 't', openedAt: t - 1, dayKey: '', session: '', setupKey: 'T', direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1, quality: 0, reason: '', atr: 1, status: 'open', filledAt: t }
  const e = evaluateExit(pos, [bothHitCandle(t)])
  assert.equal(e?.reason, 'stop')
  assert.ok((e?.exit ?? 100) <= 99)
})

test('the session clock survives the November fall-back and the day rolls at 18:00 ET', () => {
  const cs = dstFallBackCandles()
  const clocks = cs.map((c) => toET(c.openTime).clock)
  assert.equal(clocks[0], '00:00')
  assert.equal(clocks.filter((c) => c === '01:00').length, 2, 'one o\'clock happens twice that night')
  // 00:00–02:00 ET is between sessions; London opens at 02:00 ET (now EST) and the clock, not the UTC offset, decides.
  for (const c of cs) {
    const et = toET(c.openTime)
    assert.equal(sessionAt(c.openTime), et.minutesOfDay < 120 ? null : 'london', `${et.clock}`)
  }
  const before = Date.UTC(2026, 0, 15, 22, 59) // 17:59 ET
  const after = Date.UTC(2026, 0, 15, 23, 0) // 18:00 ET
  assert.equal(tradingDayKey(before), '2026-01-15')
  assert.equal(tradingDayKey(after), '2026-01-16')
})
