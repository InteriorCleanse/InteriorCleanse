/** Tests for src/bidplan.ts — max-bid arithmetic, rounding, fees that depend on the bid, headroom sign. Offline. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Estimate, Listing } from '../src/types.ts'
import { buildPlan } from '../src/bidplan.ts'
import { config } from '../config.ts'

let n = 0
/** TEST FIXTURE: a LIVE eBay auction listing with a current bid of $12,000. Never a real car. */
function fx(over: Partial<Listing> = {}): Listing {
  n += 1
  return {
    id: `fixture:${n}`,
    source: 'ebay',
    externalId: String(n),
    url: 'https://example.invalid/test-fixture',
    title: 'TEST FIXTURE 2018 Honda Civic Si',
    year: 2018,
    make: 'Honda',
    model: 'Civic Si',
    mileage: 50_000,
    titleStatus: 'clean',
    damage: 'none',
    runsAndDrives: true,
    saleType: 'auction',
    currentBidUsd: 12_000,
    photos: [],
    kind: 'LIVE',
    fetchedAt: 0,
    ...over,
  }
}

const EST_OK: Estimate = { ok: true, valueUsd: 20_000, low: 18_000, high: 22_000, comps: 3, method: 'median of 3 comparable listings, mileage-adjusted' }
const EST_NO: Estimate = { ok: false, comps: 1, reason: 'NOT ENOUGH COMPS — found 1 comparable listing; Gavel needs 3.' }

test('max bid = resale − fee − transport − repairs − cushion − margin, rounded down to $100', () => {
  const plan = buildPlan(fx(), EST_OK, { distanceMiles: 100, repairsUsd: 500 })
  assert.equal(plan.resaleUsd, 20_000)
  assert.equal(plan.buyerFeeUsd, 0) // eBay
  assert.equal(plan.transportUsd, 90) // 100 × 0.90
  assert.equal(plan.repairsUsd, 500)
  assert.equal(plan.reserveUsd, config.plan.surpriseReserveUsd) // 750
  assert.equal(plan.marginUsd, 3_000) // 15% of 20,000
  // 20,000 − 0 − 90 − 500 − 750 − 3,000 = 15,660 → 15,600
  assert.equal(plan.maxBidUsd, 15_600)
  assert.ok(plan.lines.some((s) => s.includes('Never bid above: $15,600')), plan.lines.join('\n'))
  assert.ok(plan.lines.some((s) => s.startsWith('Resale target: $20,000 (from 3 comparable listings')), plan.lines.join('\n'))
})

test('the max bid is always a whole multiple of $100', () => {
  const plan = buildPlan(fx(), EST_OK, { distanceMiles: 0, repairsUsd: 0 })
  // 20,000 − 750 − 3,000 = 16,250 → 16,200
  assert.equal(plan.maxBidUsd, 16_200)
  assert.equal(plan.maxBidUsd % 100, 0)
})

test('defaults: transport uses the default distance and repairs prompt for a number', () => {
  const plan = buildPlan(fx(), EST_OK)
  assert.equal(plan.transportUsd, Math.round(config.plan.defaultDistanceMiles * config.plan.transportPerMileUsd))
  assert.equal(plan.repairsUsd, 0)
  assert.ok(plan.lines.some((s) => s.startsWith('Repairs: $0') && s.includes('Nothing entered yet')), plan.lines.join('\n'))
})

test('headroom is positive when the price is under the max bid', () => {
  const plan = buildPlan(fx({ currentBidUsd: 12_000 }), EST_OK, { distanceMiles: 100, repairsUsd: 500 })
  assert.equal(plan.headroomUsd, 15_600 - 12_000)
  assert.ok(plan.lines.some((s) => s.includes('under your max bid')), plan.lines.join('\n'))
  assert.ok(plan.lines.some((s) => s.includes('Current bid, not the final price')), plan.lines.join('\n'))
})

test('headroom is negative when the price is above the max bid', () => {
  const plan = buildPlan(fx({ currentBidUsd: 17_000 }), EST_OK, { distanceMiles: 100, repairsUsd: 500 })
  assert.equal(plan.headroomUsd, -1_400)
  assert.ok(plan.lines.some((s) => s.includes('above your max bid')), plan.lines.join('\n'))
})

test('no asking price → no headroom, and a line saying so', () => {
  const plan = buildPlan(fx({ currentBidUsd: undefined, buyNowUsd: undefined }), EST_OK)
  assert.equal(plan.headroomUsd, undefined)
  assert.ok(plan.lines.some((s) => s.startsWith('No price is shown yet')), plan.lines.join('\n'))
})

test('a percent fee is solved against the bid it depends on (Cars & Bids, 5%)', () => {
  const plan = buildPlan(fx({ source: 'carsandbids' }), EST_OK, { distanceMiles: 0, repairsUsd: 0 })
  // before fee: 20,000 − 750 − 3,000 = 16,250; bid ≈ 16,250 / 1.05 = 15,476 → 15,400; fee at 15,400 = 770
  assert.equal(plan.maxBidUsd, 15_400)
  assert.equal(plan.buyerFeeUsd, 770)
  assert.ok(plan.maxBidUsd + plan.buyerFeeUsd + plan.transportUsd + plan.repairsUsd + plan.reserveUsd + plan.marginUsd <= plan.resaleUsd)
  assert.ok(plan.lines.some((s) => s.startsWith('Buyer fee: $770')), plan.lines.join('\n'))
})

test('the fee minimum is respected on a cheap car', () => {
  const cheap: Estimate = { ...EST_OK, valueUsd: 5_000, low: 4_500, high: 5_500 }
  const plan = buildPlan(fx({ source: 'bat', currentBidUsd: 1_000 }), cheap, { distanceMiles: 0, repairsUsd: 0 })
  // before fee: 5,000 − 750 − 750 = 3,500; fee floors at 250 → 3,250 → 3,200
  assert.equal(plan.buyerFeeUsd, 250)
  assert.equal(plan.maxBidUsd, 3_200)
})

test('an unknown (sliding-scale) fee is counted as $0 and the plan warns out loud', () => {
  const plan = buildPlan(fx({ source: 'copart' }), EST_OK)
  assert.equal(plan.buyerFeeUsd, 0)
  const warn = plan.lines.find((s) => s.startsWith('Buyer fee:'))
  assert.ok(warn, plan.lines.join('\n'))
  assert.ok(warn!.includes('unknown — sliding scale'), warn)
  assert.ok(warn!.includes('too high'), warn)
})

test('a typed-in fee percent replaces the unknown schedule', () => {
  const plan = buildPlan(fx({ source: 'copart' }), EST_OK, { distanceMiles: 0, repairsUsd: 0, feePct: 10 })
  // before fee 16,250; bid ≈ 16,250 / 1.10 = 14,772 → 14,700; fee 1,470
  assert.equal(plan.maxBidUsd, 14_700)
  assert.equal(plan.buyerFeeUsd, 1_470)
  assert.ok(!plan.lines.some((s) => s.includes('too high')), plan.lines.join('\n'))
})

test('houseId in the inputs overrides the listing source for the fee', () => {
  const plan = buildPlan(fx({ source: 'ebay' }), EST_OK, { distanceMiles: 0, repairsUsd: 0, houseId: 'carsandbids' })
  assert.equal(plan.buyerFeeUsd, 770)
})

test('NOT ENOUGH COMPS and no typed resale → $0 resale, $0 max bid, and a line asking for a resale price', () => {
  const plan = buildPlan(fx(), EST_NO)
  assert.equal(plan.resaleUsd, 0)
  assert.equal(plan.marginUsd, 0)
  assert.equal(plan.maxBidUsd, 0)
  const line = plan.lines.find((s) => s.startsWith('Resale target:'))
  assert.ok(line && line.includes('NOT ENOUGH COMPS') && line.includes('must be typed in'), line)
})

test('a typed resale price is used even when the estimate failed', () => {
  const plan = buildPlan(fx(), EST_NO, { resaleUsd: 10_000, distanceMiles: 0, repairsUsd: 0 })
  assert.equal(plan.resaleUsd, 10_000)
  assert.equal(plan.marginUsd, 1_500)
  // 10,000 − 750 − 1,500 = 7,750 → 7,700
  assert.equal(plan.maxBidUsd, 7_700)
  assert.ok(plan.lines.some((s) => s.includes('the number you typed in')), plan.lines.join('\n'))
})

test('a custom margin changes the margin row and the max bid', () => {
  const plan = buildPlan(fx(), EST_OK, { distanceMiles: 0, repairsUsd: 0, margin: 0.3 })
  assert.equal(plan.marginUsd, 6_000)
  // 20,000 − 750 − 6,000 = 13,250 → 13,200
  assert.equal(plan.maxBidUsd, 13_200)
  assert.ok(plan.lines.some((s) => s.includes('30% of the resale target')), plan.lines.join('\n'))
})

test('the max bid never goes below zero', () => {
  const tiny: Estimate = { ...EST_OK, valueUsd: 1_000, low: 900, high: 1_100 }
  const plan = buildPlan(fx({ currentBidUsd: 500 }), tiny)
  assert.equal(plan.maxBidUsd, 0)
  assert.equal(plan.headroomUsd, -500)
})

test('a SAMPLE listing is labelled in the plan', () => {
  const plan = buildPlan(fx({ kind: 'SAMPLE', source: 'sample', url: '#sample' }), EST_OK)
  assert.ok(plan.lines.some((s) => s.startsWith('SAMPLE — not a real car')), plan.lines.join('\n'))
})
