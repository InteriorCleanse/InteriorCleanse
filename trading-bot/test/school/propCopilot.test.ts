/**
 * Challenge copilot: sizes round down to what the platform accepts, a
 * USD-base pair is converted at the entry, a stop too wide for the risk is
 * refused, every rule breach turns the verdict to NO, and Kestrel's setups are
 * sized once and only on a Bitcoin instrument. Prices, balances, signals and
 * news here are TEST FIXTURE values.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as c from '../../src/school/propCopilot.ts'
import { TEMPLATES } from '../../src/school/propFirm.ts'
import type { ChallengeRules } from '../../src/school/propFirm.ts'
import { propCopilotOnCycle, readCopilotSetups, schoolPropCopilotSaveProfile } from '../../src/learning/api.ts'
import type { Snapshot } from '../../src/bot.ts'
import { store } from '../../src/store.ts'

const NOW = Date.parse('2026-10-14T15:00:00Z')
const inst = (id: string) => c.instrumentById(id) as c.Instrument
const twoStep = TEMPLATES.find((t) => t.id === 'two-step') as ChallengeRules
const oneStep = TEMPLATES.find((t) => t.id === 'one-step') as ChallengeRules
const profile = (p: Partial<c.CopilotProfile> = {}, rules = twoStep) => ({ ...c.sanitiseProfile({}, rules.accountSize, NOW), ...p })
const line = (chk: c.CopilotCheck, id: string) => chk.lines.find((l) => l.id === id)

test('futures size in whole contracts and commission counts against the risk', () => {
  const s = c.sizeTrade(inst('MBT'), { entry: 60_000, stop: 59_000, target: 62_000, riskUsd: 500 })
  assert.equal(s.size, 5, '$1,000 stop × 0.1 BTC = $100 a contract')
  assert.equal(s.actualRiskUsd, 500)
  assert.equal(s.rr, 2)
  assert.equal(s.rewardUsd, 1000)
  const withFees = c.sizeTrade(inst('MBT'), { entry: 60_000, stop: 59_000, riskUsd: 500, commission: 2 })
  assert.equal(withFees.size, 4, '$102 a contract rounds down to 4')
  assert.equal(withFees.actualRiskUsd, 408)
})

test('forex lots round down to 0.01 and a USD-base pair is converted at the entry', () => {
  assert.equal(c.sizeTrade(inst('EURUSD'), { entry: 1.1, stop: 1.095, riskUsd: 500 }).size, 1, '50 pips × $10 = $500 a lot')
  assert.equal(c.sizeTrade(inst('EURUSD'), { entry: 1.1, stop: 1.0967, riskUsd: 500 }).size, 1.51, '$330 a lot, never rounded up')
  const jpy = c.sizeTrade(inst('USDJPY'), { entry: 150, stop: 149.5, riskUsd: 500 })
  assert.equal(Math.round(jpy.valuePerPoint * 100) / 100, 666.67)
  assert.equal(jpy.size, 1.5)
})

test('a stop too wide for the risk is refused, the firm maximum caps the size, and a typed point value wins', () => {
  const wide = c.sizeTrade(inst('MBT'), { entry: 60_000, stop: 50_000, riskUsd: 500 })
  assert.equal(wide.tooSmall, true)
  assert.equal(wide.size, 0)
  assert.equal(wide.minRiskUsd, 1000)
  const capped = c.sizeTrade(inst('EURUSD'), { entry: 1.1, stop: 1.099, riskUsd: 500, maxSize: 2 })
  assert.equal(capped.size, 2)
  assert.equal(capped.cappedByMaxSize, true)
  const own = c.sizeTrade(inst('US500'), { entry: 5000, stop: 4990, riskUsd: 500, pointValueOverride: 10 })
  assert.equal(own.size, 5)
  assert.match(own.specNote, /your value of \$10/)
  assert.throws(() => c.sizeTrade(inst('MBT'), { entry: 60_000, stop: 60_000, riskUsd: 500 }), /away from the entry/)
  assert.throws(() => c.sizeTrade(inst('MBT'), { entry: 0, stop: 1, riskUsd: 500 }), /above zero/)
})

test('the profile is cleaned: risk never above 5%, unknown instruments fall back, the high-water mark is never under the balance', () => {
  const p = c.sanitiseProfile({ instrumentId: 'NOPE', riskPct: 40, phaseIndex: 9, balance: 101_000, highWater: 99_000, pointValueOverride: '', maxSize: '' }, 100_000, NOW)
  assert.equal(p.instrumentId, 'MBT')
  assert.equal(p.riskPct, 5)
  assert.equal(p.phaseIndex, 3)
  assert.equal(p.highWater, 101_000)
  assert.equal(p.pointValueOverride, null)
  assert.equal(p.maxSize, null)
  assert.equal(p.updatedAt, NOW)
  assert.equal(c.sanitiseProfile({}, 50_000, NOW).balance, 50_000)
})

test('floors: fixed from the start, trailing from the high-water mark, locked at the start when the firm says so', () => {
  assert.equal(c.floorFor(twoStep, 0, 120_000), 90_000)
  assert.equal(c.floorFor(oneStep, 0, 103_000), 97_000)
  assert.equal(c.floorFor(oneStep, 0, 110_000), 100_000, 'stops rising at the starting balance')
  const unlocked = { ...oneStep, phases: [{ ...oneStep.phases[0], trailStopsAtStart: false }] }
  assert.equal(c.floorFor(unlocked, 0, 110_000), 104_000)
})

test('a clean trade on a fresh account is GO; each breach turns it to NO with the reason', () => {
  const s = c.sizeTrade(inst('MBT'), { entry: 60_000, stop: 59_000, target: 62_000, riskUsd: 500 })
  const trade = { direction: 'long' as const, entry: 60_000, stop: 59_000, target: 62_000 }
  const go = c.checkTrade(twoStep, profile(), trade, s, { now: NOW })
  assert.equal(go.verdict, 'GO')
  assert.equal(go.dailyRoom, 5000)
  assert.equal(go.floor, 90_000)

  const near = c.checkTrade(twoStep, profile({ balance: 95_800, dayStartBalance: 100_000 }), trade, s, { now: NOW })
  assert.equal(near.verdict, 'CAUTION')
  assert.equal(line(near, 'daily')?.level, 'warn')
  const broke = c.checkTrade(twoStep, profile({ balance: 95_400, dayStartBalance: 100_000 }), trade, s, { now: NOW })
  assert.equal(broke.verdict, 'NO')
  assert.match(line(broke, 'daily')?.detail ?? '', /would break today's limit/)

  const trail = c.checkTrade(oneStep, profile({ balance: 97_300, dayStartBalance: 97_300, highWater: 103_000 }, oneStep), trade, s, { now: NOW })
  assert.equal(trail.verdict, 'NO')
  assert.equal(line(trail, 'max-loss')?.level, 'fail')
  assert.match(line(trail, 'max-loss')?.detail ?? '', /trailing floor of \$97,000/)

  const wrong = c.checkTrade(twoStep, profile(), { ...trade, stop: 61_000 }, s, { now: NOW })
  assert.equal(line(wrong, 'stop-side')?.level, 'fail')
  const tiny = c.sizeTrade(inst('MBT'), { entry: 60_000, stop: 50_000, riskUsd: 500 })
  assert.equal(c.checkTrade(twoStep, profile(), trade, tiny, { now: NOW }).verdict, 'NO')
})

test('news, stale balances, unsaved balances, big risk and a short target are cautions', () => {
  const s = c.sizeTrade(inst('MBT'), { entry: 60_000, stop: 59_000, target: 60_500, riskUsd: 500 })
  const trade = { direction: 'long' as const, entry: 60_000, stop: 59_000, target: 60_500 }
  const ev = (minutes: number, impact: 'High' | 'Medium' = 'High') => ({ title: 'CPI m/m', country: 'USD', time: NOW + minutes * 60_000, impact, forecast: '', previous: '' })
  const news = c.checkTrade(twoStep, profile(), trade, s, { now: NOW, news: [ev(10)] })
  assert.equal(line(news, 'news')?.level, 'warn')
  assert.match(line(news, 'news')?.detail ?? '', /USD CPI m\/m/)
  assert.equal(line(c.checkTrade(twoStep, profile(), trade, s, { now: NOW, news: [ev(120), ev(5, 'Medium')] }), 'news')?.level, 'ok')
  assert.equal(line(c.checkTrade(twoStep, profile(), trade, s, { now: NOW }), 'news'), undefined, 'no calendar, no claim about news')
  assert.equal(line(news, 'reward')?.level, 'warn', 'a 0.5 : 1 target')
  assert.equal(line(c.checkTrade(twoStep, profile({ updatedAt: NOW - 13 * 3_600_000 }), trade, s, { now: NOW }), 'stale')?.level, 'warn')
  assert.equal(line(c.checkTrade(twoStep, profile(), trade, s, { now: NOW, profileSaved: false }), 'profile')?.level, 'warn')
  const big = c.sizeTrade(inst('MBT'), { entry: 60_000, stop: 59_000, riskUsd: 3000 })
  assert.equal(line(c.checkTrade(twoStep, profile(), trade, big, { now: NOW }), 'risk-size')?.level, 'warn')
})

test("Kestrel's Bitcoin setup is sized only on a Bitcoin instrument", () => {
  const plan = { direction: 'short' as const, entry: 60_000, stop: 61_000, takeProfit: 58_000, rr: 2, targetLabel: '', stopLabel: '', entryLabel: '' }
  const fx = c.alertFor(plan, NOW, twoStep, profile({ instrumentId: 'EURUSD' }), { now: NOW })
  assert.equal(fx.sizing, null)
  assert.match(fx.note, /Pick a Bitcoin instrument/)
  const btc = c.alertFor(plan, NOW, twoStep, profile({ instrumentId: 'MBT' }), { now: NOW })
  assert.equal(btc.sizing?.size, 5)
  assert.equal(btc.check?.verdict, 'GO')
  assert.match(btc.note, /place the order yourself/)
})

test('on the engine cycle, a ready setup is sized once, only after a profile is saved on a Bitcoin instrument', () => {
  store().setJson('prop:rules', null); store().setJson('prop:copilot', null); store().setJson('prop:setups', [])
  const plan = { direction: 'long' as const, entry: 60_000, stop: 59_000, takeProfit: 62_000, rr: 2, targetLabel: '', stopLabel: '', entryLabel: '' }
  const snap = (p: Partial<{ action: string; plan: typeof plan | undefined; decision: unknown; time: number }>) => ({ signal: { action: p.action ?? 'BUY', plan: 'plan' in p ? p.plan : plan, time: p.time ?? NOW }, decision: p.decision ?? null, news: null } as unknown as Snapshot)
  assert.equal(propCopilotOnCycle(snap({}), NOW), null, 'no profile saved, nothing sized')
  schoolPropCopilotSaveProfile({ profile: { instrumentId: 'EURUSD' } }, NOW)
  assert.equal(propCopilotOnCycle(snap({}), NOW), null, 'a forex pair cannot be sized from a Bitcoin setup')
  schoolPropCopilotSaveProfile({ profile: { instrumentId: 'MBT', riskPct: 0.5 } }, NOW)
  assert.equal(propCopilotOnCycle(snap({ action: 'HOLD', plan: undefined }), NOW), null, 'no ready setup')
  const first = propCopilotOnCycle(snap({}), NOW)
  assert.equal(first?.source, 'SESSION SIGNAL')
  assert.equal(first?.sizing?.size, 5)
  assert.equal(propCopilotOnCycle(snap({ time: NOW + 300_000 }), NOW + 300_000), null, 'the same setup is not sized twice')
  const fused = propCopilotOnCycle(snap({ action: 'HOLD', plan: undefined, decision: { action: 'SHORT', plan: { ...plan, direction: 'short', stop: 61_000, takeProfit: 58_000 } } }), NOW + 600_000)
  assert.equal(fused?.source, 'FUSED DECISION')
  assert.equal(fused?.direction, 'short')
  assert.equal(propCopilotOnCycle(snap({ action: 'HOLD', plan: undefined, decision: { action: 'SHORT WATCH', plan } }), NOW + 900_000), null, 'a watch is not a ready setup')
  assert.equal(readCopilotSetups().length, 2)
  store().setJson('prop:copilot', null); store().setJson('prop:setups', [])
})
