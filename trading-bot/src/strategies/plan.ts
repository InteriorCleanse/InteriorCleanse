/**
 * Shared helpers for the feature-based strategies: a trade plan measured in
 * ATRs, and the evidence/vote scaffolding so every strategy speaks the same
 * language. The session model does not use these — it carries its own plan.
 */

import { config } from '../../config.ts'
import { activeParam } from '../paramOverrides.ts'
import type { EvidenceStep, TradePlan } from '../types.ts'
import type { ParamSpec, StrategyVote } from './types.ts'

/**
 * The knobs the factory may tune. A strategy declares only the ones that
 * actually change its behaviour: a strategy whose stop is structural (an
 * explicit `stopPrice`) is not moved by `stopAtr`, so it must not claim it —
 * otherwise the factory would "breed" identical genomes and lie about it.
 * Defaults come from config, so the default genome is today's behaviour.
 */
const STOP_ATR: ParamSpec = { name: 'stopAtr', label: 'Stop distance (ATR from entry)', min: 0.5, max: 2.5, step: 0.5, default: config.strategies.stopAtr }
const RR: ParamSpec = { name: 'rr', label: 'Target (× the risk)', min: 1, max: 4, step: 0.5, default: config.strategies.minRR }

/** Both knobs — for a strategy that uses the default ATR stop and target (e.g. the crossover). */
export const RISK_PARAMS: ParamSpec[] = [STOP_ATR, RR]

/** Target only — for a strategy whose stop is structural but whose target is `rr`× the risk. */
export const RR_PARAMS: ParamSpec[] = [RR]

/** A plan whose stop is `stopAtr` ATRs from entry and whose target is `rr`× the risk. */
export function atrPlan(direction: 'long' | 'short', entry: number, atr: number, opts: { stopAtr?: number; rr?: number; stopPrice?: number; targetPrice?: number } = {}): TradePlan {
  // Explicit opts win; then a factory override, if one is in force; then config.
  const stopAtr = opts.stopAtr ?? activeParam('stopAtr') ?? config.strategies.stopAtr
  const rr = opts.rr ?? activeParam('rr') ?? config.strategies.minRR
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
