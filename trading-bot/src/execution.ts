/**
 * "Execution" — which here means pretending, on purpose.
 *
 * This file writes an order to your screen and to a text file. It has
 * no exchange address, no API key, no secret, and no network call of
 * any kind. There is deliberately no code path that could reach a real
 * exchange, so there is no switch to flip by accident.
 */

import { LIVE_TRADING_ENABLED, config } from '../config.ts'
import type { PaperOrder, RiskDecision, Signal } from './types.ts'

/** Runs before every simulated order. If anyone ever wires up live trading, this throws first. */
function assertPaperOnly(): void {
  if (LIVE_TRADING_ENABLED !== false) {
    throw new Error(
      'REFUSING TO CONTINUE: something set LIVE_TRADING_ENABLED to true. ' +
        'This project is paper-only by design. Set it back to false.',
    )
  }
}

export function simulatePaperOrder(signal: Signal, risk: RiskDecision): PaperOrder {
  assertPaperOnly()
  const notionalUsd = risk.quantity * signal.price
  const feeUsd = notionalUsd * (config.feePercent / 100)
  return {
    symbol: config.symbol,
    action: risk.finalAction,
    price: signal.price,
    quantity: risk.quantity,
    time: signal.time,
    feeUsd,
    notionalUsd,
    stop: signal.plan?.stop,
    takeProfit: signal.plan?.takeProfit,
  }
}

/** How a pretend order should be described out loud. */
export function describeOrder(order: PaperOrder): string {
  const bracket =
    order.stop && order.takeProfit
      ? ` Stop $${order.stop.toFixed(2)}, target $${order.takeProfit.toFixed(2)}.`
      : ''
  return (
    `PRETEND ORDER: ${order.action} ${order.quantity} ${order.symbol} at ` +
    `$${order.price.toFixed(2)} — worth $${order.notionalUsd.toFixed(2)}, fee ` +
    `$${order.feeUsd.toFixed(4)}.${bracket} No real money moved. Nothing was sent anywhere.`
  )
}
