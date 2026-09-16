/**
 * The live trader, end-to-end against a MOCK exchange — no network, no keys.
 * It must refuse unless armed and within caps, drive the state machine from the
 * fills, bracket a fill with an OCO, and leave zero exposure on a reject or a
 * disconnect. The kill switch cancels open orders.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../../config.ts'
import { CONFIRM_PHRASE } from '../../src/live/gates.ts'
import type { GateInput } from '../../src/live/gates.ts'
import { LiveTradingRefused, killAll, openLive, withinLiveCaps } from '../../src/live/trader.ts'
import { exposureQty } from '../../src/live/orders.ts'
import { TradeExchange } from '../../src/exchange/binanceTrade.ts'
import type { FetchLike } from '../../src/exchange/binanceRest.ts'

const OPEN: GateInput = {
  liveTradingEnabled: true, configEnabled: true, envPhrase: config.live.envPhrase, typedConfirmation: CONFIRM_PHRASE,
  testnetTradesReconciled: config.live.minTestnetTrades, guardPresent: true, killSwitchEngaged: false, feedHealthy: true, venue: 'testnet',
}
const PLAN = { symbol: 'BTCUSDT', quoteOrderQty: 20, takeProfit: 31000, stop: 29500, stopLimit: 29490 }
const CTX = { todaysLiveTrades: 0, openPositions: 0, now: 1000 }

function mockExchange(handlers: { buy?: () => unknown; buyThrows?: boolean }) {
  const calls: string[] = []
  const fetchImpl: FetchLike = async (url: string) => {
    calls.push(url)
    if (url.includes('/api/v3/order?') && url.includes('side=BUY')) {
      if (handlers.buyThrows) throw new Error('disconnected mid-order')
      return { ok: true, status: 200, json: async () => handlers.buy!(), text: async () => '' }
    }
    if (url.includes('/oco')) return { ok: true, status: 200, json: async () => ({ orderListId: 1, listOrderStatus: 'EXECUTING', orders: [{ orderId: 2 }, { orderId: 3 }] }), text: async () => '' }
    if (url.includes('/api/v3/openOrders')) return { ok: true, status: 200, json: async () => ([]), text: async () => '' }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' }
  }
  return { ex: new TradeExchange({ baseUrl: 'https://x', apiKey: 'k', apiSecret: 's', flavour: 'binance', fetchImpl }), calls }
}

test('the trader refuses when a gate is closed (not armed)', async () => {
  const { ex } = mockExchange({ buy: () => ({ status: 'FILLED', executedQty: '0.001', fills: [{ price: '20000', qty: '0.001', commission: '0', commissionAsset: 'USDT' }] }) })
  await assert.rejects(() => openLive(ex, PLAN, { ...OPEN, liveTradingEnabled: false }, CTX), LiveTradingRefused)
})

test('the trader refuses an order over the hard notional cap', () => {
  const caps = withinLiveCaps({ ...PLAN, quoteOrderQty: config.live.maxNotionalUsd + 1 }, 0, 0)
  assert.equal(caps.ok, false)
  assert.match(caps.reason, /notional|cap/i)
})

test('armed and within caps: a FILLED entry drives the order to filled and brackets it with an OCO', async () => {
  const { ex, calls } = mockExchange({ buy: () => ({ status: 'FILLED', executedQty: '0.001', cummulativeQuoteQty: '0.001', fills: [{ price: '20000', qty: '0.001', commission: '0', commissionAsset: 'USDT' }] }) })
  const { order } = await openLive(ex, PLAN, OPEN, CTX)
  assert.equal(order.state, 'filled')
  assert.ok(exposureQty(order) > 0)
  assert.ok(order.avgPrice > 0)
  assert.ok(calls.some((u) => u.includes('/oco')), 'an OCO exit was placed')
})

test('a venue reject leaves the order rejected with zero exposure — no phantom position', async () => {
  const { ex, calls } = mockExchange({ buy: () => ({ status: 'REJECTED', executedQty: '0' }) })
  const { order } = await openLive(ex, PLAN, OPEN, CTX)
  assert.equal(order.state, 'rejected')
  assert.equal(exposureQty(order), 0)
  assert.equal(calls.some((u) => u.includes('/oco')), false, 'no bracket on a reject')
})

test('a partial fill lands in partially_filled and still brackets what filled', async () => {
  const { ex, calls } = mockExchange({ buy: () => ({ status: 'PARTIALLY_FILLED', executedQty: '0.0006', fills: [{ price: '20000', qty: '0.0006', commission: '0', commissionAsset: 'USDT' }] }) })
  const { order } = await openLive(ex, PLAN, OPEN, CTX)
  assert.equal(order.state, 'partially_filled')
  assert.ok(exposureQty(order) > 0)
  assert.ok(calls.some((u) => u.includes('/oco')))
})

test('a disconnect mid-order leaves the order rejected with zero exposure', async () => {
  const { ex } = mockExchange({ buyThrows: true })
  const { order } = await openLive(ex, PLAN, OPEN, CTX)
  assert.equal(order.state, 'rejected')
  assert.equal(exposureQty(order), 0)
})

test('the kill switch cancels open orders on the symbol', async () => {
  const { ex, calls } = mockExchange({})
  await killAll(ex, 'BTCUSDT')
  assert.ok(calls.some((u) => u.includes('/api/v3/openOrders')))
})
