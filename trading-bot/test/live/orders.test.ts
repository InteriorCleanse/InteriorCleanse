/**
 * The order state machine: only legal moves, fills accumulate an average price,
 * and a rejected order carries no exposure (no phantom position).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEvent, canTransition, exposureQty, newOrder } from '../../src/live/orders.ts'

function order() {
  return newOrder({ id: 'o1', clientOrderId: 'o1', symbol: 'BTCUSDT', side: 'BUY', requestedQty: 25 })
}

test('legal transitions are allowed and illegal ones are refused', () => {
  assert.equal(canTransition('new', 'submitted'), true)
  assert.equal(canTransition('submitted', 'filled'), true)
  assert.equal(canTransition('filled', 'open'), false)
  assert.equal(canTransition('rejected', 'filled'), false)
  assert.equal(canTransition('filled', 'reconciled'), true)
})

test('applyEvent throws on an illegal transition', () => {
  const o = order()
  assert.throws(() => applyEvent(o, { to: 'filled', at: 1 }), /Illegal order transition/)
})

test('a partial then a full fill accumulate a volume-weighted average price', () => {
  let o = order()
  o = applyEvent(o, { to: 'submitted', at: 1 })
  o = applyEvent(o, { to: 'partially_filled', at: 2, fillQty: 0.4, fillPrice: 100 })
  o = applyEvent(o, { to: 'filled', at: 3, fillQty: 0.6, fillPrice: 110 })
  assert.equal(o.state, 'filled')
  assert.ok(Math.abs(o.filledQty - 1.0) < 1e-9)
  assert.ok(Math.abs(o.avgPrice - 106) < 1e-9) // (0.4*100 + 0.6*110)/1.0
  assert.equal(exposureQty(o), o.filledQty)
})

test('a rejected order leaves zero exposure — no phantom position', () => {
  let o = order()
  o = applyEvent(o, { to: 'submitted', at: 1 })
  o = applyEvent(o, { to: 'rejected', at: 2, detail: 'venue rejected' })
  assert.equal(exposureQty(o), 0)
})
