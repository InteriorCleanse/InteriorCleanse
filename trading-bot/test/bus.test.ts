import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MarketBus } from '../src/data/bus.ts'

test('the bus delivers typed events, supports unsubscribe and once', () => {
  const bus = new MarketBus()
  const got: number[] = []
  const off = bus.on('trade', (t) => got.push(t.price))
  bus.once('stream:gap', (what) => got.push(what.length))
  bus.emit('trade', { id: 1, time: 1, price: 5, qty: 1, side: 'buy', receivedAt: 1, source: 'stream' })
  bus.emit('stream:gap', 'abc', 1)
  bus.emit('stream:gap', 'def', 2)
  off()
  bus.emit('trade', { id: 2, time: 2, price: 6, qty: 1, side: 'sell', receivedAt: 2, source: 'stream' })
  assert.deepEqual(got, [5, 3])
  assert.equal(bus.listenerCount('trade'), 0)
})
