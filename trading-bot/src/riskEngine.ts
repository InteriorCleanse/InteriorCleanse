/**
 * The risk engine — the one gate every candidate order passes through
 * before it can become a position, paper or otherwise. It has veto power:
 * if any rule says no, no order is created, and the reason is one a person
 * can read.
 *
 * It does not re-invent sizing. It asks the existing risk check for the
 * per-trade size (so an approved candidate is sized exactly as the frozen
 * baseline sizes it), then rounds to the exchange filters and applies the
 * protective rules the baseline never checked at order time: the kill
 * switch, stale data, spread, open exposure, the daily brakes, a drawdown
 * cap and execution protection.
 *
 * Rules run in order; the first failure is the veto. The kill switch is
 * first, so when it is on nothing gets through — paper included.
 */

import { config } from '../config.ts'
import { checkRisk } from './risk.ts'
import { applyFilters } from './risk/filters.ts'
import { killSwitch } from './risk/rules/killSwitch.ts'
import { staleData } from './risk/rules/staleData.ts'
import { spread } from './risk/rules/spread.ts'
import { perTrade } from './risk/rules/perTrade.ts'
import { exposure } from './risk/rules/exposure.ts'
import { dailyTrades, dailyLoss } from './risk/rules/dailyLimits.ts'
import { drawdown } from './risk/rules/drawdown.ts'
import { execution } from './risk/rules/execution.ts'
import type { RiskCandidate, RiskCheck, RiskState, Rule } from './risk/rules/types.ts'
import type { RiskDecision } from './types.ts'

export type { RiskCandidate, RiskState, RiskCheck } from './risk/rules/types.ts'

/** In order. The kill switch is first on purpose. */
const RULES: Rule[] = [killSwitch, staleData, spread, perTrade, execution, exposure, dailyTrades, dailyLoss, drawdown]

export type RiskVerdict = {
  approved: boolean
  action: 'BUY' | 'SELL' | 'SKIP' | 'HOLD'
  reason: string
  quantity: number
  positionValueUsd: number
  riskUsd: number
  checks: RiskCheck[]
  vetoedBy: string | null
}

export function assess(candidate: RiskCandidate, state: RiskState): RiskVerdict {
  const sig = candidate.signal
  if (sig.action !== 'BUY' && sig.action !== 'SELL') {
    return { approved: false, action: sig.action, reason: 'No trade was proposed, so there was nothing to risk-check.', quantity: 0, positionValueUsd: 0, riskUsd: 0, checks: [], vetoedBy: null }
  }
  const sizing: RiskDecision = checkRisk(sig, candidate.entry !== undefined ? { entry: candidate.entry } : {})

  const checks = RULES.map((rule) => rule(candidate, state, sizing))
  let failed = checks.find((c) => !c.passed) ?? null

  // Exchange filters on the size (a no-op while the filters are 0).
  const price = candidate.entry ?? sig.price
  const filt = applyFilters(sizing.quantity, price, config.risk.filters)
  if (!filt.ok) checks.push({ rule: 'Exchange filters', passed: false, detail: filt.reason })
  else checks.push({ rule: 'Exchange filters', passed: true, detail: filt.reason })
  if (!failed && !filt.ok) failed = { rule: 'Exchange filters', passed: false, detail: filt.reason }

  const approved = failed === null
  return {
    approved,
    action: approved ? sig.action : 'SKIP',
    reason: approved ? sizing.reason : failed!.detail,
    quantity: filt.quantity,
    positionValueUsd: filt.quantity * price,
    riskUsd: sizing.riskUsd,
    checks,
    vetoedBy: failed ? failed.rule : null,
  }
}

/** The verdict as the old RiskDecision shape, for callers (openPosition) that still take one. */
export function toRiskDecision(v: RiskVerdict): RiskDecision {
  return { approved: v.approved, finalAction: v.approved ? (v.action as RiskDecision['finalAction']) : 'SKIP', reason: v.reason, quantity: v.quantity, positionValueUsd: v.positionValueUsd, riskUsd: v.riskUsd }
}

/** The limits themselves, for the dashboard and /api/risk. */
export function riskLimits() {
  return {
    riskPerTradePercent: config.riskPerTradePercent,
    maxOpenPositions: config.risk.maxOpenPositions,
    maxExposureUsd: config.risk.maxExposureUsd > 0 ? config.risk.maxExposureUsd : config.accountSizeUsd,
    maxDrawdownPercent: config.risk.maxDrawdownPercent,
    maxCandleAgeSec: config.risk.maxCandleAgeSec,
    maxSpreadPct: config.risk.maxSpreadPct,
    maxTradesPerDay: config.ict.maxTradesPerDay,
    dailyLossLimitR: config.ict.dailyLossLimitR,
    filters: config.risk.filters,
  }
}
