/**
 * The risk check — the bot's seatbelt.
 *
 * The strategy is allowed to be excited. Risk is the part that gets to
 * say no. Every trade passes through here, and anything that fails
 * becomes SKIP with a reason you can read.
 *
 * For ICT trades the size is worked out backwards from the stop: if
 * you risk 1% and the stop is 0.4% away, the position is 2.5× the
 * risk amount. That's how professionals size — the stop decides the
 * size, not the other way round.
 */

import { config } from '../config.ts'
import type { RiskDecision, Signal } from './types.ts'

function skip(reason: string, quantity = 0, positionValueUsd = 0, riskUsd = 0): RiskDecision {
  return { approved: false, finalAction: 'SKIP', reason, quantity, positionValueUsd, riskUsd }
}

/**
 * `opts.entry` lets the caller size from the price the order actually
 * filled at, instead of the signal price. Replay and the paper trader
 * pass the simulated fill; a scan passes nothing.
 */
export function checkRisk(signal: Signal, opts: { entry?: number } = {}): RiskDecision {
  if (opts.entry !== undefined && signal.plan) {
    const plan = { ...signal.plan, entry: opts.entry }
    const risk = Math.abs(plan.entry - plan.stop)
    plan.rr = risk > 0 ? Math.abs(plan.takeProfit - plan.entry) / risk : 0
    signal = { ...signal, price: opts.entry, plan }
  }
  if (signal.action === 'HOLD' || signal.action === 'SKIP') {
    return {
      approved: false,
      finalAction: signal.action,
      reason: 'No trade was proposed, so there was nothing to risk-check.',
      quantity: 0,
      positionValueUsd: 0,
      riskUsd: 0,
    }
  }
  return signal.plan ? checkIctRisk(signal) : checkFixedSizeRisk(signal)
}

/** Simple strategy: a fixed quantity, capped by max position and account size. */
function checkFixedSizeRisk(signal: Signal): RiskDecision {
  const { quantity, maxPosition } = config.crossover
  const positionValueUsd = quantity * signal.price

  if (quantity > maxPosition) {
    return skip(
      `SKIPPED for safety. The trade size (${quantity}) is bigger than your maximum allowed position (${maxPosition}). Lower "quantity" or raise "maxPosition" in config.ts.`,
      quantity, positionValueUsd,
    )
  }
  if (config.maxPositionValueUsd > 0 && positionValueUsd > config.maxPositionValueUsd) {
    return skip(
      `SKIPPED for safety. This position would be worth $${positionValueUsd.toFixed(2)}, more than your limit of $${config.maxPositionValueUsd.toFixed(2)}. At this price the largest size that fits is about ${(config.maxPositionValueUsd / signal.price).toFixed(6)}.`,
      quantity, positionValueUsd,
    )
  }
  if (positionValueUsd > config.accountSizeUsd) {
    return skip(
      `SKIPPED for safety. This trade would be worth $${positionValueUsd.toFixed(2)} but your whole account is $${config.accountSizeUsd.toFixed(2)}.`,
      quantity, positionValueUsd,
    )
  }
  return {
    approved: true,
    finalAction: signal.action,
    reason: `Risk check passed. Size ${quantity} is within your limit of ${maxPosition}, worth $${positionValueUsd.toFixed(2)} of your $${config.accountSizeUsd.toFixed(2)}.`,
    quantity,
    positionValueUsd,
    riskUsd: 0,
  }
}

/**
 * The sizing rule on its own: risk a fixed share of the account per
 * trade, with the stop deciding the size, capped by position value and
 * account size. Used at signal time AND again at fill time, because the
 * fill price is rarely the signal price.
 */
export function sizeForStop(entry: number, stop: number): { quantity: number; positionValueUsd: number; riskUsd: number; capped: boolean; wantedRiskUsd: number } {
  const account = config.accountSizeUsd
  const wantedRiskUsd = account * (config.riskPerTradePercent / 100)
  const stopDistance = Math.abs(entry - stop)
  if (!(stopDistance > 0)) return { quantity: 0, positionValueUsd: 0, riskUsd: 0, capped: false, wantedRiskUsd }
  let quantity = wantedRiskUsd / stopDistance
  let positionValueUsd = quantity * entry
  let capped = false
  const cap = Math.min(config.maxPositionValueUsd > 0 ? config.maxPositionValueUsd : Infinity, account)
  if (positionValueUsd > cap) {
    quantity = cap / entry
    positionValueUsd = cap
    capped = true
  }
  return { quantity, positionValueUsd, riskUsd: quantity * stopDistance, capped, wantedRiskUsd }
}

/** ICT trades: size from the stop distance, then check every cap. */
function checkIctRisk(signal: Signal): RiskDecision {
  const plan = signal.plan!
  const account = config.accountSizeUsd
  const wantedRiskUsd = account * (config.riskPerTradePercent / 100)
  const stopDistance = Math.abs(plan.entry - plan.stop)
  const stopPct = (stopDistance / plan.entry) * 100

  if (!(stopDistance > 0)) {
    return skip('SKIPPED: the stop is sitting on top of the entry, so the trade has no defined risk.')
  }
  if (stopPct > 3) {
    return skip(
      `SKIPPED: the stop is ${stopPct.toFixed(2)}% away from the entry. Anything over 3% on a 5-minute setup means the sweep wick was enormous — that's not a clean setup, it's a mess.`,
    )
  }
  if (plan.rr < config.ict.minRR) {
    return skip(
      `SKIPPED: the reward-to-risk is only ${plan.rr.toFixed(2)}, and you've told me to insist on at least ${config.ict.minRR}. The target is too close for the risk.`,
    )
  }

  // Size so that hitting the stop costs exactly the wanted risk — unless the caps bind.
  const sized = sizeForStop(plan.entry, plan.stop)
  const { quantity, positionValueUsd, riskUsd } = sized
  const cap = Math.min(config.maxPositionValueUsd > 0 ? config.maxPositionValueUsd : Infinity, account)
  const note = sized.capped
    ? ` Note: risking a full ${config.riskPerTradePercent}% ($${wantedRiskUsd.toFixed(2)}) would need a $${(wantedRiskUsd / stopDistance * plan.entry).toFixed(0)} position, but your cap is $${cap.toFixed(2)}, so the position is smaller and the real risk is $${riskUsd.toFixed(3)}. With a small account and no leverage, that's normal.`
    : ''
  const rewardUsd = riskUsd * plan.rr

  return {
    approved: true,
    finalAction: signal.action,
    reason:
      `Risk check passed. Stop is ${stopPct.toFixed(2)}% away, so a position of ${quantity.toFixed(6)} ` +
      `($${positionValueUsd.toFixed(2)}) risks $${riskUsd.toFixed(3)} to make about $${rewardUsd.toFixed(3)} ` +
      `at ${plan.rr.toFixed(1)}:1.${note}`,
    quantity,
    positionValueUsd,
    riskUsd,
  }
}
