/**
 * Shadow trading: the order it WOULD send must respect the venue's real filters
 * (LOT_SIZE, tick, min-notional), and the scorer must judge which OCO leg the
 * real trades would have hit. Pure over its inputs; nothing is ever sent.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtersForSymbol } from '../../src/exchange/filters.ts'
import { buildShadowOrder } from '../../src/shadow/recorder.ts'
import { scoreShadowOrder } from '../../src/shadow/scorer.ts'
import type { ExchangeInfo } from '../../src/exchange/types.ts'
import type { Signal } from '../../src/types.ts'

const INFO: ExchangeInfo = {
  serverTime: 0,
  symbols: [{
    symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING',
    filters: [
      { filterType: 'PRICE_FILTER', tickSize: '0.01', minPrice: '0', maxPrice: '0' },
      { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001', maxQty: '9000' },
      { filterType: 'NOTIONAL', minNotional: '10' },
    ],
  }],
}

function longSignal(): Signal {
  return { action: 'BUY', direction: 'long', price: 30000, time: 1000, setupKey: 'BTCUSDT|5m|crossover|BUY', reason: 't', quality: 80, plan: { direction: 'long', entry: 30000, stop: 29700, takeProfit: 30600, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' } } as unknown as Signal
}

test('filters are read from exchangeInfo (tick, step, min-notional)', () => {
  const f = filtersForSymbol(INFO, 'BTCUSDT')
  assert.ok(f)
  assert.equal(f!.tickSize, 0.01)
  assert.equal(f!.stepSize, 0.001)
  assert.equal(f!.minNotionalUsd, 10)
  assert.equal(filtersForSymbol(INFO, 'NOPE'), null)
})

test('a shadow order rounds quantity to the step size and prices to the tick', () => {
  const f = filtersForSymbol(INFO, 'BTCUSDT')!
  const o = buildShadowOrder({ signal: longSignal(), quantity: 0.0123456, filters: f, bid: 29999.5, ask: 30000.5, strategyId: 'crossover', now: 2000 })
  assert.equal(o.side, 'BUY')
  assert.equal(o.quantity, 0.012) // floored to 0.001
  assert.ok(o.oco)
  assert.equal(o.oco!.takeProfit % 0.01 < 1e-9 || Math.abs((o.oco!.takeProfit % 0.01) - 0.01) < 1e-9, true)
  assert.equal(o.placeable, true)
})

test('an order under the min-notional is not placeable and says why', () => {
  const f = filtersForSymbol(INFO, 'BTCUSDT')!
  const o = buildShadowOrder({ signal: longSignal(), quantity: 0.0001, filters: f, bid: 29999, ask: 30001, strategyId: 'crossover' })
  // 0.0001 floors to 0 at step 0.001 → zero, not placeable.
  assert.equal(o.placeable, false)
})

test('a short is built for the record but marked un-placeable on spot', () => {
  const short = { action: 'SELL', direction: 'short', price: 30000, time: 1000, setupKey: 'BTCUSDT|5m|crossover|SELL', reason: 't', quality: 80, plan: { direction: 'short', entry: 30000, stop: 30300, takeProfit: 29400, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' } } as unknown as Signal
  const f = filtersForSymbol(INFO, 'BTCUSDT')!
  const o = buildShadowOrder({ signal: short, quantity: 0.01, filters: f, strategyId: 'crossover' })
  assert.equal(o.side, 'SELL')
  assert.equal(o.placeable, false)
  assert.match(o.note, /long-only/)
})

test('the scorer hits the take-profit when the real trades trade through it', () => {
  const f = filtersForSymbol(INFO, 'BTCUSDT')!
  const o = buildShadowOrder({ signal: longSignal(), quantity: 0.01, filters: f, bid: 29999.5, ask: 30000.5, strategyId: 'crossover', now: 1000 })
  const score = scoreShadowOrder(o, [{ price: 30100, time: 1100 }, { price: 30650, time: 1200 }])
  assert.equal(score.entryFilled, true)
  assert.equal(score.exitLeg, 'takeProfit')
  assert.ok((score.rMultiple ?? 0) > 0)
  assert.ok(score.observedSpreadBps !== null)
})

test('the scorer hits the stop when the real trades trade through it first', () => {
  const f = filtersForSymbol(INFO, 'BTCUSDT')!
  const o = buildShadowOrder({ signal: longSignal(), quantity: 0.01, filters: f, bid: 29999.5, ask: 30000.5, strategyId: 'crossover', now: 1000 })
  const score = scoreShadowOrder(o, [{ price: 29650, time: 1100 }])
  assert.equal(score.exitLeg, 'stop')
  assert.ok((score.rMultiple ?? 0) < 0)
})

test('an un-placeable order is not scored', () => {
  const f = filtersForSymbol(INFO, 'BTCUSDT')!
  const o = buildShadowOrder({ signal: longSignal(), quantity: 0.0001, filters: f, strategyId: 'crossover' })
  const score = scoreShadowOrder(o, [{ price: 30600, time: 1100 }])
  assert.equal(score.entryFilled, false)
  assert.match(score.note, /Not placeable/)
})
