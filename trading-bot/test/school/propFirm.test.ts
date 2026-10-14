/**
 * Prop Firm Academy rules engine: every rule shape breaches, waits or passes
 * where the arithmetic says it should. Trades here are TEST FIXTURE values.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEMPLATES, evaluateChallenge, firmDayKey, riskRoom, sanitiseRules, simulatePass, todayRoom } from '../../src/school/propFirm.ts'
import type { ChallengeRules, ChallengeTrade } from '../../src/school/propFirm.ts'

const DAY = 86_400_000
const t0 = Date.UTC(2026, 0, 5, 15) // Monday 15:00 UTC
const rules = (phases: ChallengeRules['phases'], size = 100_000): ChallengeRules => ({ label: 'test', accountSize: size, dayResetTz: 'UTC', dayResetHour: 0, phases })
const base = { profitTargetPct: 8, maxDailyLossPct: 5, maxLossPct: 10, drawdownMode: 'static' as const, trailStopsAtStart: false, minTradingDays: 0, maxCalendarDays: null, consistencyMaxDayPct: null }

test('daily loss limit closes the account on the day it is hit', () => {
  const trades: ChallengeTrade[] = [{ at: t0, pnl: -3000 }, { at: t0 + 60_000, pnl: -2000 }]
  const r = evaluateChallenge(rules([{ name: 'P1', ...base }]), trades).phases[0]
  assert.equal(r.status, 'FAILED')
  assert.equal(r.breach?.rule, 'daily-loss')
})

test('losses spread over days dodge the daily limit but hit the static max loss', () => {
  const trades = Array.from({ length: 5 }, (_, i) => ({ at: t0 + i * DAY, pnl: -2000 }))
  const r = evaluateChallenge(rules([{ name: 'P1', ...base }]), trades).phases[0]
  assert.equal(r.status, 'FAILED')
  assert.equal(r.breach?.rule, 'max-loss')
  assert.equal(r.trades, 5)
})

test('target waits for the minimum trading days, then passes into the next phase fresh', () => {
  const p = rules([{ name: 'P1', ...base, minTradingDays: 3 }, { name: 'P2', ...base, profitTargetPct: 5 }])
  const trades = [{ at: t0, pnl: 9000 }, { at: t0 + DAY, pnl: 100 }, { at: t0 + 2 * DAY, pnl: 100 }, { at: t0 + 3 * DAY, pnl: 1000 }]
  const res = evaluateChallenge(p, trades)
  assert.equal(res.phases[0].status, 'PASSED')
  assert.equal(res.phases[0].trades, 3)
  assert.equal(res.phases[1].status, 'IN PROGRESS')
  assert.equal(res.phases[1].balance, 101_000)
})

test('consistency rule holds the pass while one day carries the profit', () => {
  const p = rules([{ name: 'P1', ...base, consistencyMaxDayPct: 50 }])
  const r1 = evaluateChallenge(p, [{ at: t0, pnl: 8500 }]).phases[0]
  assert.equal(r1.status, 'IN PROGRESS')
  assert.match(r1.waitingOn.join(' '), /consistency/)
  const r2 = evaluateChallenge(p, [{ at: t0, pnl: 4500 }, { at: t0 + DAY, pnl: 4500 }]).phases[0]
  assert.equal(r2.status, 'PASSED')
})

test('end-of-day trailing floor rises with closing highs and stops at the start', () => {
  const p = rules([{ name: 'E', ...base, profitTargetPct: 50, maxDailyLossPct: null, maxLossPct: 4, drawdownMode: 'trailing-eod', trailStopsAtStart: true }], 50_000)
  // Day 1 closes +1500 → floor 48,000 + 1,500 = 49,500. Day 2 drops 1,600 → 49,900 > floor; another −500 → 49,400 ≤ 49,500.
  const trades = [{ at: t0, pnl: 1500 }, { at: t0 + DAY, pnl: -1600 }, { at: t0 + DAY + 60_000, pnl: -500 }]
  const r = evaluateChallenge(p, trades).phases[0]
  assert.equal(r.status, 'FAILED')
  assert.equal(r.breach?.rule, 'max-loss')
  // Once the high passes start + max loss the floor locks at the start.
  const r2 = evaluateChallenge(p, [{ at: t0, pnl: 5000 }, { at: t0 + DAY, pnl: 1 }]).phases[0]
  assert.equal(r2.floor, 50_000)
})

test('intraday trailing uses the open-profit peak when known', () => {
  const p = rules([{ name: 'E', ...base, profitTargetPct: 50, maxDailyLossPct: null, maxLossPct: 5, drawdownMode: 'trailing-intraday', trailStopsAtStart: false }], 50_000)
  // Peak +2,000 open, closed at −600: floor 52,000 − 2,500 = 49,500; balance 49,400 breaches.
  const r = evaluateChallenge(p, [{ at: t0, pnl: -600, peakPnl: 2000 }]).phases[0]
  assert.equal(r.status, 'FAILED')
})

test('the firm day follows its reset hour and time zone', () => {
  const at = Date.UTC(2026, 0, 6, 21, 30) // 16:30 New York, before the 17:00 reset
  assert.equal(firmDayKey(at, 'America/New_York', 17), '2026-01-05')
  assert.equal(firmDayKey(at + 60 * 60_000, 'America/New_York', 17), '2026-01-06')
})

test('risk room counts straight losses honestly', () => {
  const room = riskRoom(TEMPLATES[0], 1)
  assert.equal(room[0].lossesToDailyLimit, 5)
  assert.equal(room[0].lossesToMaxLoss, 10)
  assert.equal(room[0].winnersToTarget, 8)
  assert.match(riskRoom(TEMPLATES[0], 3)[0].verdict, /Too big/)
})

test('sanitiseRules clamps hostile input and refuses empty phases', () => {
  assert.throws(() => sanitiseRules({ phases: [] }))
  const r = sanitiseRules({ accountSize: 1e12, dayResetTz: 'Not/AZone', phases: [{ maxLossPct: 500, drawdownMode: 'nonsense', name: 'x'.repeat(200) }] })
  assert.equal(r.accountSize, 2_000_000)
  assert.equal(r.dayResetTz, 'America/New_York')
  assert.equal(r.phases[0].maxLossPct, 90)
  assert.equal(r.phases[0].drawdownMode, 'static')
  assert.equal(r.phases[0].name.length, 40)
})

test('Monte Carlo is SIMULATED, repeatable, and its outcomes add up', () => {
  const a = simulatePass(TEMPLATES[0], { winRatePct: 45, rewardR: 1.5, riskPct: 0.5, runs: 300, seed: 11 })
  const b = simulatePass(TEMPLATES[0], { winRatePct: 45, rewardR: 1.5, riskPct: 0.5, runs: 300, seed: 11 })
  assert.equal(a.provenance, 'SIMULATED')
  assert.deepEqual(a, b)
  assert.ok(Math.abs(a.passFirstPhase + a.failDaily + a.failMaxLoss + a.unfinished - 1) < 1e-9)
})

test("today's room says stop when one more loss breaches", () => {
  const p = rules([{ name: 'P1', ...base }])
  const res = evaluateChallenge(p, [{ at: t0, pnl: -4200 }])
  const room = todayRoom(res, 1, t0 + 60_000)
  assert.ok(room)
  assert.equal(room.tradesAtRisk, 0)
  assert.match(room.message, /Stop for today/)
})

test('no trades: nothing invented', () => {
  const res = evaluateChallenge(TEMPLATES[0], [])
  assert.equal(res.phases[0].status, 'NOT STARTED')
  assert.match(res.summary, /No closed trades/)
})
