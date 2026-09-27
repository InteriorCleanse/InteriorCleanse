/** Tests for src/valuation.ts — asking price, comparables, the mileage-adjusted median, NOT ENOUGH COMPS. Offline; TEST FIXTURE listings only. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Listing } from '../src/types.ts'
import { askingPrice, estimateValue, adjustForMileage, isComparable, MILEAGE_ADJ_PER_10K } from '../src/valuation.ts'

let n = 0
/** TEST FIXTURE: a SAMPLE Porsche 911 with a buy-now price. Override anything. */
function fx(over: Partial<Listing> = {}): Listing {
  n += 1
  return {
    id: `fixture:${n}`,
    source: 'sample',
    externalId: String(n),
    url: '#sample',
    title: 'TEST FIXTURE 2018 Porsche 911 Carrera',
    year: 2018,
    make: 'Porsche',
    model: '911 Carrera',
    mileage: 50_000,
    titleStatus: 'clean',
    damage: 'none',
    runsAndDrives: true,
    saleType: 'buy-now',
    buyNowUsd: 60_000,
    photos: [],
    kind: 'SAMPLE',
    fetchedAt: 0,
    ...over,
  }
}

test('askingPrice prefers the current bid, then buy-now, else undefined', () => {
  assert.equal(askingPrice(fx({ currentBidUsd: 100, buyNowUsd: 200 })), 100)
  assert.equal(askingPrice(fx({ currentBidUsd: undefined, buyNowUsd: 200 })), 200)
  assert.equal(askingPrice(fx({ currentBidUsd: undefined, buyNowUsd: undefined })), undefined)
})

test('fewer than minComps comparables → NOT ENOUGH COMPS', () => {
  const target = fx({ mileage: 50_000 })
  const pool = [target, fx({ buyNowUsd: 20_000 }), fx({ buyNowUsd: 21_000 })]
  const est = estimateValue(target, pool, 3)
  assert.equal(est.ok, false)
  if (!est.ok) {
    assert.equal(est.comps, 2)
    assert.ok(est.reason.startsWith('NOT ENOUGH COMPS'), est.reason)
  }
})

test('minComps is honoured: one comp is enough when minComps is 1', () => {
  const target = fx()
  const est = estimateValue(target, [fx({ buyNowUsd: 30_000 })], 1)
  assert.equal(est.ok, true)
  if (est.ok) assert.equal(est.valueUsd, 30_000)
})

test('median of three comps, each adjusted for the mileage difference', () => {
  const target = fx({ mileage: 50_000 })
  const pool = [
    fx({ mileage: 40_000, buyNowUsd: 20_000 }), // target has 10k more miles → comp adjusted down 4%
    fx({ mileage: 50_000, buyNowUsd: 21_000 }), // same miles → unchanged
    fx({ mileage: 60_000, buyNowUsd: 22_000 }), // target has 10k fewer miles → comp adjusted up 4%
  ]
  const est = estimateValue(target, pool, 3)
  assert.equal(est.ok, true)
  if (est.ok) {
    assert.equal(est.valueUsd, 21_000)
    assert.equal(est.low, Math.round(20_000 * (1 - MILEAGE_ADJ_PER_10K)))
    assert.equal(est.high, Math.round(22_000 * (1 + MILEAGE_ADJ_PER_10K)))
    assert.equal(est.comps, 3)
    assert.equal(est.method, 'median of 3 comparable listings, mileage-adjusted')
  }
})

test('an even number of comps takes the mean of the two middle values', () => {
  const target = fx({ mileage: 50_000 })
  const pool = [20_000, 22_000, 24_000, 30_000].map((p) => fx({ mileage: 50_000, buyNowUsd: p }))
  const est = estimateValue(target, pool, 3)
  assert.equal(est.ok, true)
  if (est.ok) assert.equal(est.valueUsd, 23_000)
})

test('mileage adjustment floors at 50% and caps at 150% of the comp price', () => {
  assert.equal(adjustForMileage(20_000, 50_000, 250_000), 10_000) // would be 20% without the floor
  assert.equal(adjustForMileage(20_000, 250_000, 50_000), 30_000) // would be 180% without the cap
  assert.equal(adjustForMileage(20_000, undefined, 50_000), 20_000) // no mileage → no adjustment
  assert.equal(adjustForMileage(20_000, 50_000, undefined), 20_000)
})

test('comps exclude the target, bad titles, no-price, wrong year, wrong model and wrong make', () => {
  const target = fx({ mileage: 50_000, buyNowUsd: 999 })
  const good = [20_000, 21_000, 22_000].map((p) => fx({ mileage: 50_000, buyNowUsd: p }))
  const pool = [
    target,
    ...good,
    fx({ titleStatus: 'salvage', mileage: 50_000, buyNowUsd: 1_000 }),
    fx({ titleStatus: 'rebuilt', mileage: 50_000, buyNowUsd: 1_000 }),
    fx({ titleStatus: 'flood', mileage: 50_000, buyNowUsd: 1_000 }),
    fx({ titleStatus: 'lemon', mileage: 50_000, buyNowUsd: 1_000 }),
    fx({ titleStatus: 'parts-only', mileage: 50_000, buyNowUsd: 1_000 }),
    fx({ buyNowUsd: undefined, currentBidUsd: undefined }),
    fx({ year: 2016, buyNowUsd: 1_000 }),
    fx({ year: 2020, buyNowUsd: 1_000 }),
    fx({ model: 'Cayman S', buyNowUsd: 1_000 }),
    fx({ make: 'Ferrari', buyNowUsd: 1_000 }),
  ]
  const est = estimateValue(target, pool, 3)
  assert.equal(est.ok, true)
  if (est.ok) {
    assert.equal(est.comps, 3)
    assert.equal(est.valueUsd, 21_000)
  }
})

test('comps match on make (case-insensitive), first word of model, and year within one', () => {
  const target = fx({ year: 2018 })
  assert.equal(isComparable(target, fx({ make: 'PORSCHE', model: '911 Turbo', year: 2017 })), true)
  assert.equal(isComparable(target, fx({ make: 'porsche', model: '911', year: 2019 })), true)
  assert.equal(isComparable(target, fx({ model: 'Cayman', year: 2018 })), false)
  assert.equal(isComparable(target, fx({ year: 2020 })), false)
  assert.equal(isComparable(target, target), false)
})

test('a comp price is buy-now first, else the current bid', () => {
  const target = fx({ mileage: 50_000 })
  const pool = [1, 2, 3].map(() => fx({ mileage: 50_000, saleType: 'auction-or-buy-now', buyNowUsd: 30_000, currentBidUsd: 10_000 }))
  const est = estimateValue(target, pool, 3)
  assert.equal(est.ok, true)
  if (est.ok) assert.equal(est.valueUsd, 30_000)
  const bidsOnly = [1, 2, 3].map(() => fx({ mileage: 50_000, saleType: 'auction', buyNowUsd: undefined, currentBidUsd: 10_000 }))
  const est2 = estimateValue(target, bidsOnly, 3)
  assert.equal(est2.ok, true)
  if (est2.ok) assert.equal(est2.valueUsd, 10_000)
})

test('LIVE and SAMPLE never mix', () => {
  const live = fx({ kind: 'LIVE', source: 'ebay', url: 'https://example.invalid/lot' })
  const sampleComps = [1, 2, 3].map(() => fx({ kind: 'SAMPLE', buyNowUsd: 20_000 }))
  const liveComps = [1, 2, 3].map(() => fx({ kind: 'LIVE', source: 'ebay', buyNowUsd: 20_000 }))

  const mixed = estimateValue(live, sampleComps, 3)
  assert.equal(mixed.ok, false)
  if (!mixed.ok) assert.equal(mixed.comps, 0)

  const sameKind = estimateValue(live, liveComps, 3)
  assert.equal(sameKind.ok, true)

  const sample = fx({ kind: 'SAMPLE' })
  const reverse = estimateValue(sample, liveComps, 3)
  assert.equal(reverse.ok, false)
})

test('a listing with no make, model or year cannot be priced', () => {
  const pool = [1, 2, 3].map(() => fx({ buyNowUsd: 20_000 }))
  for (const target of [fx({ make: undefined }), fx({ model: undefined }), fx({ year: undefined })]) {
    const est = estimateValue(target, pool, 3)
    assert.equal(est.ok, false)
    if (!est.ok) assert.ok(est.reason.startsWith('NOT ENOUGH COMPS'), est.reason)
  }
})
