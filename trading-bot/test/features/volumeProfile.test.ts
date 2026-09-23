/** Point of control and value area on fixtures with a known answer. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mk, STEP } from '../fixtures/candles.ts'
import { profileFromCandles, profileFromHistogram, valueArea } from '../../src/features/volumeProfile.ts'

const c = (t: number, h: number, l: number, v: number) => ({ ...mk(t, (h + l) / 2, h, l, (h + l) / 2), volume: v })

test('a candle\'s volume is spread evenly over the buckets its range touches', () => {
  const p = profileFromCandles([c(0, 104, 100, 10)], 0, 0, 1) // buckets 100..104 → 5 buckets, 2 each
  assert.equal(p.size, 5)
  for (let b = 100; b <= 104; b++) assert.equal(p.get(b), 2)
})

test('the POC is where the most volume sat, and the value area grows from it towards the heavier side', () => {
  // Ten thin candles across 100–110, then one heavy candle sitting at 105.
  const cs = Array.from({ length: 10 }, (_, i) => c(i * STEP, 110, 100, 1))
  cs.push(c(10 * STEP, 105.9, 105, 50))
  const p = profileFromCandles(cs, 0, 10, 1)
  const va = valueArea(p, 1, 70)!
  assert.equal(va.poc, 105.5, 'the middle of the 105 bucket')
  assert.ok(va.val <= 105 && va.vah >= 106)
  assert.equal(va.bucketSize, 1)
  assert.ok(Math.abs(va.volume - 60) < 1e-9)
  // 70% of 60 = 42: the 105 bucket alone holds 50, so the area is just that bucket.
  assert.equal(va.val, 105)
  assert.equal(va.vah, 106)
})

test('the value area holds at least the requested share of volume', () => {
  const p = new Map<number, number>([[1, 10], [2, 20], [3, 30], [4, 25], [5, 15]])
  const va = valueArea(p, 1, 70)!
  assert.equal(va.poc, 3.5)
  // From 30 add 25 (above) → 55, then 20 (below) → 75 ≥ 70.
  assert.equal(va.val, 2)
  assert.equal(va.vah, 5)
  assert.equal(valueArea(new Map(), 1), null)
})

test('a tape histogram re-buckets by price, so exact trades and approximate candles land on the same grid', () => {
  // Ticks of 10: 100,000 and 100,010 fall in the 100,000 bucket at bucket size 50; 100,060 in the next.
  const hist = new Map<number, number>([[10_000, 3], [10_001, 2], [10_006, 1]])
  const p = profileFromHistogram(hist, 10, 50)
  assert.equal(p.get(2000), 5)
  assert.equal(p.get(2001), 1)
})
