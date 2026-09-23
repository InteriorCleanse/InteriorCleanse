/**
 * Splitting a run into non-overlapping windows by time. The point of a
 * split is honesty: you fit and choose on the early part (in-sample and
 * validation) and you judge on the part you never looked at (out-of-sample).
 * A number quoted from in-sample data is close to worthless; the OOS number
 * is the one that means something.
 */

import type { TradeLike } from './metrics.ts'

export type Window = { from: number; to: number }
export type Split = { train: Window; validation: Window; oos: Window }

/**
 * Cut the time range [from, to) into three contiguous, non-overlapping
 * windows by fraction. They tile the range exactly: train ends where
 * validation begins, validation ends where OOS begins.
 */
export function timeSplit(from: number, to: number, trainPct = 0.6, validationPct = 0.2): Split {
  const span = Math.max(0, to - from)
  const t = from + span * trainPct
  const v = t + span * validationPct
  return { train: { from, to: t }, validation: { from: t, to: v }, oos: { from: v, to } }
}

/** The trades whose time falls in [w.from, w.to). The upper bound is exclusive so windows never double-count a trade. */
export function tradesIn(trades: TradeLike[], w: Window): TradeLike[] {
  return trades.filter((tr) => tr.time >= w.from && tr.time < w.to)
}

/** The full time range a set of trades spans, or null when there are none with a time. */
export function tradeRange(trades: TradeLike[]): Window | null {
  const times = trades.map((t) => t.time).filter((t) => t > 0)
  if (!times.length) return null
  return { from: Math.min(...times), to: Math.max(...times) + 1 }
}
