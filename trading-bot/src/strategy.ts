/**
 * The simple strategy: a moving-average crossover.
 *
 * When the recent average price rises above the longer-term average,
 * that's a hint the market is turning up. When it falls below, the
 * opposite. It is a teaching strategy — simple enough to test honestly,
 * and honest tests are the whole point. Switch to it with
 * strategy: 'crossover' in config.ts.
 */

import { config } from '../config.ts'
import type { Candle, Signal } from './types.ts'

const cx = config.crossover

/** Simple moving average of closes over `period` candles ending at `endIndex`. */
export function sma(candles: Candle[], period: number, endIndex: number): number | null {
  if (endIndex + 1 < period) return null
  let total = 0
  for (let i = endIndex - period + 1; i <= endIndex; i++) total += candles[i].close
  return total / period
}

export function makeCrossoverKey(action: string): string {
  return `${config.symbol}|${config.interval}|MA${cx.fastMA}x${cx.slowMA}|${action}`
}

export function getCrossoverSignal(candles: Candle[], index: number): Signal {
  const fast = sma(candles, cx.fastMA, index)
  const slow = sma(candles, cx.slowMA, index)
  const prevFast = sma(candles, cx.fastMA, index - 1)
  const prevSlow = sma(candles, cx.slowMA, index - 1)
  const candle = candles[index]
  const base = { price: candle.close, time: candle.closeTime, fastMA: fast ?? 0, slowMA: slow ?? 0, evidence: [] }

  if (fast === null || slow === null || prevFast === null || prevSlow === null) {
    return {
      ...base,
      action: 'HOLD',
      setupKey: makeCrossoverKey('HOLD'),
      reason: `Not enough history yet. I need at least ${cx.slowMA} candles before the ${cx.slowMA}-candle average means anything.`,
    }
  }
  const crossedUp = prevFast <= prevSlow && fast > slow
  const crossedDown = prevFast >= prevSlow && fast < slow

  if (crossedUp) {
    return {
      ...base,
      action: 'BUY',
      setupKey: makeCrossoverKey('BUY'),
      reason: `BUY signal. The ${cx.fastMA}-candle average (${fast.toFixed(2)}) just crossed ABOVE the ${cx.slowMA}-candle average (${slow.toFixed(2)}). Recent prices are pulling ahead of the longer trend.`,
    }
  }
  if (crossedDown) {
    return {
      ...base,
      action: 'SELL',
      setupKey: makeCrossoverKey('SELL'),
      reason: `SELL signal. The ${cx.fastMA}-candle average (${fast.toFixed(2)}) just crossed BELOW the ${cx.slowMA}-candle average (${slow.toFixed(2)}). Recent prices are falling behind the longer trend.`,
    }
  }
  const side = fast > slow ? 'above' : 'below'
  return {
    ...base,
    action: 'HOLD',
    setupKey: makeCrossoverKey('HOLD'),
    reason: `HOLD. No fresh crossover on this candle — the fast average is still ${side} the slow one, which it already was last candle. Doing nothing is a real decision, and usually the right one.`,
  }
}
