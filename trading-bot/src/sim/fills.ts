/**
 * The fill simulator — how an order would REALLY fill, not how we wish.
 *
 * The old model filled an entry at the signal candle's close and exits
 * exactly at the stop or target price. Real orders don't get that:
 *
 *   - You only know a candle closed after it closed, so the earliest you
 *     can act is the NEXT candle's open (latency).
 *   - You buy at the ask and sell at the bid: half the spread, each way.
 *   - A market order moves the price a little against you: slippage.
 *   - A stop is a market order fired when price trades through it, so it
 *     fills WORSE than the stop, never better. If the market gaps past
 *     it, you get the gap.
 *   - A take-profit is a resting limit order. It fills only when price
 *     trades THROUGH it by a margin — a touch is not a fill.
 *   - If price has run away from the intended entry before you could act,
 *     the trade is missed, not chased.
 *
 * Every function here is pure and takes its assumptions as an argument,
 * so the same code answers "what if fees were higher?" in a test.
 */

import { config } from '../../config.ts'
import type { Candle } from '../types.ts'

export type ExecutionAssumptions = {
  /** Full bid/ask spread in basis points (1 bp = 0.01 %). Half is paid on each side. */
  spreadBps: number
  /** Extra adverse movement for a market order, in basis points. */
  slippageBps: number
  /** A take-profit limit fills only when price trades through it by this many basis points. */
  targetTouchBps: number
  /** How many candles pass between the signal and the entry order. 1 = next candle's open. */
  latencyCandles: number
  /** Give up on an entry when the fill candle's open has drifted further than this from the intended price, in ATRs. */
  maxEntryDriftAtr: number
  /** Fee for market orders (entries, stops, time exits), percent per side. */
  takerFeePercent: number
  /** Fee for resting limit orders (the target), percent per side. */
  makerFeePercent: number
}

export function defaultAssumptions(): ExecutionAssumptions {
  return { ...config.execution }
}

/** The idealised model the bot used before Phase 4 — kept so the two can be compared honestly. */
export const IDEAL_ASSUMPTIONS: ExecutionAssumptions = {
  spreadBps: 0, slippageBps: 0, targetTouchBps: 0, latencyCandles: 0, maxEntryDriftAtr: Infinity, takerFeePercent: config.feePercent, makerFeePercent: config.feePercent,
}

export type Intent = {
  direction: 'long' | 'short'
  /** The price the signal was built on (the signal candle's close). */
  intendedEntry: number
  stop: number
  target: number
  /** ATR at signal time, for the drift check. */
  atr: number
}

export type EntryFill = {
  price: number
  time: number
  /** Index of the candle the fill happened on, in the caller's array. */
  index: number
  /** How much worse than the intended price, in dollars per unit (positive = worse). */
  costPerUnit: number
}

export type EntryResult = { filled: true; fill: EntryFill } | { filled: false; reason: 'missed' | 'no-candle'; detail: string }

/**
 * Fills an entry on the candle `latencyCandles` after the signal candle.
 * `signalIndex` is the signal candle; candles after it must exist.
 */
export function simulateEntry(intent: Intent, candles: Candle[], signalIndex: number, a: ExecutionAssumptions): EntryResult {
  const dir = intent.direction === 'long' ? 1 : -1
  if (a.latencyCandles <= 0) {
    // The idealised model: fill at the signal close, no costs.
    return { filled: true, fill: { price: intent.intendedEntry, time: candles[signalIndex].closeTime, index: signalIndex, costPerUnit: 0 } }
  }
  const idx = signalIndex + a.latencyCandles
  const c = candles[idx]
  if (!c) return { filled: false, reason: 'no-candle', detail: 'The entry candle has not happened yet.' }
  const drift = Math.abs(c.open - intent.intendedEntry)
  if (intent.atr > 0 && drift > a.maxEntryDriftAtr * intent.atr) {
    return { filled: false, reason: 'missed', detail: `Price opened $${drift.toFixed(2)} (${(drift / intent.atr).toFixed(2)} ATR) away from the intended entry — more than the ${a.maxEntryDriftAtr} ATR limit. Not chasing.` }
  }
  const cost = c.open * (a.spreadBps / 2 + a.slippageBps) / 10_000
  const price = c.open + dir * cost
  return { filled: true, fill: { price, time: c.openTime, index: idx, costPerUnit: cost } }
}

export type ExitReason = 'stop' | 'target' | 'time'
export type CandleExit = { price: number; time: number; reason: ExitReason }
export type ExitFill = CandleExit & { index: number; candlesHeld: number }

/**
 * Does THIS candle end the trade? `held` is how many candles the trade
 * has been open including this one. When a candle hits both the stop and
 * the target, the stop wins.
 */
export function exitOnCandle(intent: Pick<Intent, 'direction' | 'stop' | 'target'>, c: Candle, held: number, a: ExecutionAssumptions, maxHoldCandles = config.ict.maxHoldCandles): CandleExit | null {
  const long = intent.direction === 'long'
  const dir = long ? 1 : -1
  const stopCost = c.open * (a.spreadBps / 2 + a.slippageBps) / 10_000
  const touch = intent.target * a.targetTouchBps / 10_000
  const hitStop = long ? c.low <= intent.stop : c.high >= intent.stop
  const hitTarget = long ? c.high >= intent.target + touch : c.low <= intent.target - touch
  if (hitStop) {
    // A gap through the stop fills at the open, not at the stop.
    const gapped = long ? c.open < intent.stop : c.open > intent.stop
    const trigger = gapped ? c.open : intent.stop
    return { price: trigger - dir * stopCost, time: c.closeTime, reason: 'stop' }
  }
  if (hitTarget) return { price: intent.target, time: c.closeTime, reason: 'target' }
  if (held >= maxHoldCandles) {
    const timeCost = c.close * (a.spreadBps / 2 + a.slippageBps) / 10_000
    return { price: c.close - dir * timeCost, time: c.closeTime, reason: 'time' }
  }
  return null
}

/**
 * Walks candles from the fill candle onward and returns the first exit.
 * The fill candle itself counts: a stop can be hit minutes after the fill.
 */
export function simulateExit(intent: Intent, fill: EntryFill, candles: Candle[], a: ExecutionAssumptions, maxHoldCandles = config.ict.maxHoldCandles): ExitFill | null {
  let held = 0
  for (let i = fill.index; i < candles.length; i++) {
    held++
    const e = exitOnCandle(intent, candles[i], held, a, maxHoldCandles)
    if (e) return { ...e, index: i, candlesHeld: held }
  }
  return null
}

/** Fee percent that applies to an exit of a given kind. */
export function exitFeePercent(reason: ExitReason, a: ExecutionAssumptions): number {
  return reason === 'target' ? a.makerFeePercent : a.takerFeePercent
}
