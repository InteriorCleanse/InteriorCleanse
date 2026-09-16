/**
 * Reconciliation rebuilds the true position from the venue's own fills, so a
 * restart mid-trade recovers exactly what is held — never a guess.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcilePosition } from '../../src/live/reconcile.ts'
import type { MyTrade } from '../../src/exchange/types.ts'

function trade(o: Partial<MyTrade>): MyTrade {
  return { symbol: 'BTCUSDT', id: Math.random(), price: '100', qty: '1', quoteQty: '100', commission: '0.1', commissionAsset: 'USDT', time: 1, isBuyer: true, isMaker: false, ...o } as MyTrade
}

test('two buys net into a long at the volume-weighted average', () => {
  const p = reconcilePosition('BTCUSDT', [trade({ price: '100', qty: '1', time: 1 }), trade({ price: '110', qty: '1', time: 2 })])
  assert.equal(p.netQty, 2)
  assert.ok(Math.abs(p.avgPrice - 105) < 1e-9)
  assert.ok(Math.abs(p.commissionPaid - 0.2) < 1e-9)
})

test('a buy then a full sell recovers a flat position after restart', () => {
  const p = reconcilePosition('BTCUSDT', [trade({ price: '100', qty: '1', time: 1, isBuyer: true }), trade({ price: '120', qty: '1', time: 2, isBuyer: false })])
  assert.equal(p.netQty, 0)
  assert.equal(p.avgPrice, 0)
})

test('a partial sell leaves the remaining long at the original average', () => {
  const p = reconcilePosition('BTCUSDT', [trade({ price: '100', qty: '2', time: 1, isBuyer: true }), trade({ price: '130', qty: '1', time: 2, isBuyer: false })])
  assert.equal(p.netQty, 1)
  assert.ok(Math.abs(p.avgPrice - 100) < 1e-9)
})

test('trades for other symbols are ignored', () => {
  const p = reconcilePosition('BTCUSDT', [trade({ symbol: 'ETHUSDT', qty: '5', time: 1 }), trade({ symbol: 'BTCUSDT', qty: '1', time: 2 })])
  assert.equal(p.netQty, 1)
  assert.equal(p.trades, 1)
})
