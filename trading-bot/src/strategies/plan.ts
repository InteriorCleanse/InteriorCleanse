/**
 * Shared helpers for the feature-based strategies: a trade plan measured in
 * ATRs, and the evidence/vote scaffolding so every strategy speaks the same
 * language. The session model does not use these — it carries its own plan.
 */

import { config } from '../../config.ts'
import type { EvidenceStep, TradePlan } from '../types.ts'
import type { StrategyVote } from './types.ts'

/** A plan whose stop is `stopAtr` ATRs from entry and whose target is `rr`× the risk. */
export function atrPlan(direction: 'long' | 'short', entry: number, atr: number, opts: { stopAtr?: number; rr?: number; stopPrice?: number; targetPrice?: number } = {}): TradePlan {
  const stopAtr = opts.stopAtr ?? config.strategies.stopAtr
  const rr = opts.rr ?? config.strategies.minRR
  const stop = opts.stopPrice ?? (direction === 'long' ? entry - atr * stopAtr : entry + atr * stopAtr)
  const risk = Math.abs(entry - stop)
  const takeProfit = opts.targetPrice ?? (direction === 'long' ? entry + risk * rr : entry - risk * rr)
  return {
    direction, entry, stop, takeProfit,
    rr: risk > 0 ? Math.abs(takeProfit - entry) / risk : 0,
    entryLabel: 'close of the signal candle',
    stopLabel: opts.stopPrice ? `$${stop.toFixed(2)}` : `${stopAtr} ATR from entry`,
    targetLabel: opts.targetPrice ? `$${takeProfit.toFixed(2)}` : `${rr}× the risk`,
  }
}

/** A HOLD vote whose evidence names the gate it is waiting on. */
export function hold(id: string, setupKey: string, evidence: EvidenceStep[], reason: string): StrategyVote {
  return { id, action: 'HOLD', direction: null, confidence: 0, reason, evidence, setupKey }
}

export function fail(evidence: EvidenceStep[], step: string, detail: string): void {
  evidence.push({ step, passed: false, detail })
}

export function pass(evidence: EvidenceStep[], step: string, detail: string): void {
  evidence.push({ step, passed: true, detail })
}
