/**
 * The risk engine's veto power: a clean candidate is approved and sized
 * exactly as the frozen baseline sizes it; and every protective rule vetoes
 * on its boundary — the kill switch, stale data, spread, exposure, the daily
 * brakes, drawdown, and execution.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assess } from '../src/riskEngine.ts'
import type { RiskState } from '../src/riskEngine.ts'
import { checkRisk } from '../src/risk.ts'
import { config } from '../config.ts'
import type { Signal } from '../src/types.ts'

// A clean long: entry 100, stop 99.6 (0.4% away), target 101.2 → 3:1, comfortably inside the caps.
function longSignal(): Signal {
  return { action: 'BUY', reason: '', price: 100, time: 0, setupKey: 'T', evidence: [], quality: 80, plan: { direction: 'long', entry: 100, stop: 99.6, takeProfit: 101.2, rr: 3, entryLabel: '', stopLabel: '', targetLabel: '' } }
}

/** A state where every rule passes. */
function cleanState(over: Partial<RiskState> = {}): RiskState {
  return {
    now: 1_000_000,
    killSwitch: { ok: true, reason: '' },
    candleAgeSec: 30,
    spreadPct: 0.01,
    openPositions: 0,
    openNotionalUsd: 0,
    today: { trades: 0, lossesR: 0 },
    equityUsd: config.accountSizeUsd,
    peakEquityUsd: config.accountSizeUsd,
    ...over,
  }
}

test('a clean candidate is approved and sized identically to the baseline checkRisk', () => {
  const v = assess({ signal: longSignal() }, cleanState())
  assert.equal(v.approved, true)
  assert.equal(v.action, 'BUY')
  assert.equal(v.vetoedBy, null)
  const base = checkRisk(longSignal())
  assert.equal(v.quantity, base.quantity, 'same size as the frozen baseline (filters off)')
  assert.equal(v.riskUsd, base.riskUsd)
  // Every rule is recorded, in order, kill switch first.
  assert.equal(v.checks[0].rule, 'Kill switch')
  assert.ok(v.checks.every((c) => c.passed))
})

test('the kill switch vetoes everything, paper included, and is the first thing checked', () => {
  const v = assess({ signal: longSignal() }, cleanState({ killSwitch: { ok: false, reason: 'stopped by you' } }))
  assert.equal(v.approved, false)
  assert.equal(v.vetoedBy, 'Kill switch')
  assert.match(v.reason, /stopped by you/)
})

test('stale data vetoes past the age limit', () => {
  assert.equal(assess({ signal: longSignal() }, cleanState({ candleAgeSec: config.risk.maxCandleAgeSec + 1 })).vetoedBy, 'Fresh data')
  assert.equal(assess({ signal: longSignal() }, cleanState({ candleAgeSec: config.risk.maxCandleAgeSec })).approved, true, 'exactly at the limit is allowed')
  assert.equal(assess({ signal: longSignal() }, cleanState({ candleAgeSec: null })).approved, true, 'unknown age does not block a one-shot check')
})

test('a spread wider than the limit vetoes', () => {
  assert.equal(assess({ signal: longSignal() }, cleanState({ spreadPct: config.risk.maxSpreadPct + 0.01 })).vetoedBy, 'Spread')
  assert.equal(assess({ signal: longSignal() }, cleanState({ spreadPct: null })).approved, true, 'unknown spread does not block')
})

test('the per-trade rule vetoes a stop wider than 3% or a reward-to-risk under the minimum', () => {
  const wideStop: Signal = { ...longSignal(), plan: { ...longSignal().plan!, stop: 96, takeProfit: 110 } }
  assert.equal(assess({ signal: wideStop }, cleanState()).vetoedBy, 'Per-trade risk')
  const lowRR: Signal = { ...longSignal(), plan: { ...longSignal().plan!, takeProfit: 100.4, rr: 1 } }
  assert.equal(assess({ signal: lowRR }, cleanState()).vetoedBy, 'Per-trade risk')
})

test('exposure vetoes when a position is already open or the notional cap would be breached', () => {
  assert.equal(assess({ signal: longSignal() }, cleanState({ openPositions: 1 })).vetoedBy, 'Exposure')
  assert.equal(assess({ signal: longSignal() }, cleanState({ openNotionalUsd: config.accountSizeUsd })).vetoedBy, 'Exposure')
})

test('the daily brakes veto at the trade cap and the loss limit', () => {
  assert.equal(assess({ signal: longSignal() }, cleanState({ today: { trades: config.ict.maxTradesPerDay, lossesR: 0 } })).vetoedBy, 'Daily trades')
  assert.equal(assess({ signal: longSignal() }, cleanState({ today: { trades: 0, lossesR: config.ict.dailyLossLimitR } })).vetoedBy, 'Daily loss')
})

test('the drawdown cap vetoes once equity is far enough below the peak', () => {
  const peak = 100, equityUsd = peak * (1 - config.risk.maxDrawdownPercent / 100) - 0.01
  assert.equal(assess({ signal: longSignal() }, cleanState({ equityUsd, peakEquityUsd: peak })).vetoedBy, 'Drawdown')
  const shallow = peak * (1 - (config.risk.maxDrawdownPercent - 1) / 100)
  assert.equal(assess({ signal: longSignal() }, cleanState({ equityUsd: shallow, peakEquityUsd: peak })).approved, true)
})

test('execution protection vetoes a fill already past the stop', () => {
  // A long whose fill (99.5) is below the stop (99.6): it would open in a loss.
  const v = assess({ signal: longSignal(), entry: 99.5 }, cleanState())
  assert.equal(v.approved, false)
  assert.ok(v.vetoedBy === 'Execution' || v.vetoedBy === 'Per-trade risk', v.vetoedBy ?? 'none')
})

test('a non-trade signal is never approved', () => {
  const hold: Signal = { action: 'HOLD', reason: '', price: 100, time: 0, setupKey: 'T', evidence: [] }
  assert.equal(assess({ signal: hold }, cleanState()).approved, false)
})
