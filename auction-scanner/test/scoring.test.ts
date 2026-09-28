/** Tests for src/scoring.ts — the Steal score, grade boundaries, every adjustment and every red flag. Offline; TEST FIXTURE listings only. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Estimate, Listing } from '../src/types.ts'
import { scoreListing, discountScore } from '../src/scoring.ts'
import type { DemandEntry } from '../src/demand.ts'
import { config } from '../config.ts'

/** A fixed clock so timing tests never depend on when they run. */
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0)
const HOUR = 3_600_000
const DAY = 24 * HOUR

let n = 0
/**
 * TEST FIXTURE: a LIVE listing with nothing wrong — clean title, no damage,
 * runs and drives, keys, VIN, normal mileage, ends in 3 days, 5 bids — and a
 * buy-now price so the asking price is exact. Override anything.
 */
function fx(over: Partial<Listing> = {}): Listing {
  n += 1
  return {
    id: `fixture:${n}`,
    source: 'ebay',
    externalId: String(n),
    url: 'https://example.invalid/test-fixture',
    title: 'TEST FIXTURE 2024 Honda Civic Si',
    year: new Date(NOW).getUTCFullYear() - 2,
    make: 'Honda',
    model: 'Civic Si',
    vin: 'TESTFIXTURE000001',
    mileage: 20_000,
    titleStatus: 'clean',
    damage: 'none',
    runsAndDrives: true,
    hasKeys: true,
    saleType: 'buy-now',
    buyNowUsd: 65_000,
    endsAt: NOW + 3 * DAY,
    bidCount: 5,
    photos: [],
    kind: 'LIVE',
    fetchedAt: NOW,
    ...over,
  }
}

const EST: Estimate = { ok: true, valueUsd: 100_000, low: 90_000, high: 110_000, comps: 3, method: 'median of 3 comparable listings, mileage-adjusted' }
const NO_EST: Estimate = { ok: false, comps: 1, reason: 'NOT ENOUGH COMPS — found 1 comparable listing; Gavel needs 3 before it shows a value.' }

const score = (l: Listing, est: Estimate = EST, demand?: DemandEntry) => scoreListing(l, est, demand, config.starter, NOW)

test('no estimate → total 0, grade unpriced, reasons explain NOT ENOUGH COMPS and what would fix it', () => {
  const s = score(fx(), NO_EST)
  assert.equal(s.total, 0)
  assert.equal(s.grade, 'unpriced')
  assert.ok(s.reasons[0].includes('NOT ENOUGH COMPS'), s.reasons[0])
  assert.ok(s.reasons.some((r) => r.startsWith('What would fix it')), s.reasons.join('\n'))
  assert.equal(s.discount, undefined)
})

test('no asking price → unpriced', () => {
  const s = score(fx({ buyNowUsd: undefined, currentBidUsd: undefined }))
  assert.equal(s.total, 0)
  assert.equal(s.grade, 'unpriced')
  assert.ok(s.reasons[0].startsWith('No price is shown yet'), s.reasons[0])
})

test('the discount line runs from noDealDiscount (20) to fullMarksDiscount (100) and clamps', () => {
  assert.equal(discountScore(config.scoring.noDealDiscount), 20)
  assert.equal(discountScore(config.scoring.fullMarksDiscount), 100)
  assert.equal(discountScore(0.9), 100)
  assert.equal(discountScore(-0.5), 0)
})

test('grade boundaries: steal ≥ 80, good deal ≥ 60, fair ≥ 40, else pass', () => {
  // Estimate 100,000. Discount d → base 20 + (d − 0.05) / 0.30 × 80.
  const cases: Array<[asking: number, total: number, grade: string]> = [
    [65_000, 100, 'steal'], // 35% under → full marks
    [72_500, 80, 'steal'], // exactly 80
    [73_000, 79, 'good deal'],
    [80_000, 60, 'good deal'], // exactly 60
    [80_500, 59, 'fair'],
    [87_500, 40, 'fair'], // exactly 40
    [88_000, 39, 'pass'],
    [95_000, 20, 'pass'], // 5% under is no deal
  ]
  for (const [asking, total, grade] of cases) {
    const s = score(fx({ buyNowUsd: asking }))
    assert.equal(s.total, total, `asking ${asking}`)
    assert.equal(s.grade, grade, `asking ${asking}`)
  }
  const perfect = score(fx({ buyNowUsd: 65_000 }))
  assert.equal(perfect.discount, 0.35)
  assert.ok(perfect.reasons[0].startsWith('Priced 35% under the $100,000 that 3 similar cars go for'), perfect.reasons[0])
  assert.ok(!perfect.reasons[0].includes('base score'), 'the first line is words, not arithmetic')
  assert.ok(perfect.reasons.at(-1)!.startsWith('How the score works: 100 of 100'), perfect.reasons.at(-1))
  assert.ok(!perfect.reasons.some((r) => r.endsWith('+0.')), 'no +0 lines')
})

test('priced above the estimate scores 0 and says so', () => {
  const s = score(fx({ buyNowUsd: 105_000 }))
  assert.equal(s.total, 0)
  assert.equal(s.grade, 'pass')
  assert.ok(s.reasons[0].includes('above the $100,000'), s.reasons[0])
})

test('damage adjustments: minor −8, unknown −10 with a caution, moderate −25, severe −45', () => {
  assert.equal(score(fx({ damage: 'minor' })).total, 92)
  const unknown = score(fx({ damage: 'unknown' }))
  assert.equal(unknown.total, 90)
  assert.ok(unknown.reasons.some((r) => r.startsWith('Caution') && r.endsWith('-10.')), unknown.reasons.join('\n'))
  assert.equal(score(fx({ damage: 'moderate' })).total, 75)
  assert.equal(score(fx({ damage: 'severe' })).total, 55)
})

test('runs and drives: unknown −8, does not run −30', () => {
  const unknown = score(fx({ runsAndDrives: undefined }))
  assert.equal(unknown.total, 92)
  assert.ok(unknown.reasons.some((r) => r.includes('Nobody says whether it runs and drives') && r.endsWith('-8.')), unknown.reasons.join('\n'))
  const no = score(fx({ runsAndDrives: false }))
  assert.equal(no.total, 70)
  assert.ok(no.reasons.some((r) => r.includes('does not run and drive') && r.endsWith('-30.')))
})

test('no keys −5', () => {
  const s = score(fx({ hasKeys: false }))
  assert.equal(s.total, 95)
  assert.ok(s.reasons.some((r) => r.includes('No keys') && r.endsWith('-5.')))
})

test('mileage above 15,000 a year loses up to 10 points; normal mileage loses nothing', () => {
  // Fixture is 3 model years old at NOW (year − 2, inclusive count), so 90,000 miles = 30,000 a year.
  const heavy = score(fx({ mileage: 90_000 }))
  assert.equal(heavy.total, 90)
  assert.ok(heavy.reasons.some((r) => r.includes('30,000 miles a year') && r.endsWith('-10.')), heavy.reasons.join('\n'))
  // 54,000 miles = 18,000 a year → 3,000 over → −3.
  assert.equal(score(fx({ mileage: 54_000 })).total, 97)
  assert.equal(score(fx({ mileage: 45_000 })).total, 100)
  const unstated = score(fx({ mileage: undefined }))
  assert.equal(unstated.total, 100)
  assert.ok(unstated.reasons.some((r) => r.includes('Mileage is not stated')))
})

test('demand tiers add supercar +6, enthusiast +4, holds-value +4, rental +2, quoting the why', () => {
  const base = fx({ buyNowUsd: 80_000 }) // base 60 so the bonus is visible
  const why = 'Widely sought after and holds value unusually well for a sports car.'
  const mk = (tier: DemandEntry['tier']): DemandEntry => ({ make: 'Honda', models: ['Civic Si'], tier, why })
  assert.equal(score(base, EST, mk('supercar')).total, 66)
  assert.equal(score(base, EST, mk('enthusiast')).total, 64)
  assert.equal(score(base, EST, mk('holds-value')).total, 64)
  const rental = score(base, EST, mk('rental'))
  assert.equal(rental.total, 62)
  assert.ok(rental.reasons.some((r) => r.includes(`"${why}"`) && r.endsWith('+2.')), rental.reasons.join('\n'))
})

test('few bidders so far: +3 when there are no bids and under 6 hours left', () => {
  const few = score(fx({ buyNowUsd: 80_000, bidCount: 0, endsAt: NOW + 3 * HOUR }))
  assert.equal(few.total, 63)
  assert.ok(few.reasons.some((r) => r.startsWith('Few bidders so far')))
  assert.equal(score(fx({ buyNowUsd: 80_000, bidCount: 0, endsAt: NOW + 12 * HOUR })).total, 60)
  assert.equal(score(fx({ buyNowUsd: 80_000, bidCount: 2, endsAt: NOW + 3 * HOUR })).total, 60)
})

test('ending within 2 hours adds a reason but no points; an ended auction says so', () => {
  const soon = score(fx({ buyNowUsd: 80_000, endsAt: NOW + HOUR }))
  assert.equal(soon.total, 60)
  assert.ok(soon.reasons.some((r) => r.startsWith('Ending soon')), soon.reasons.join('\n'))
  const ended = score(fx({ buyNowUsd: 80_000, endsAt: NOW - HOUR }))
  assert.ok(ended.reasons.some((r) => r.includes('already ended')))
})

test('an auction current bid carries the "not the final price" reason; a buy-now price does not', () => {
  const auction = score(fx({ saleType: 'auction', currentBidUsd: 65_000, buyNowUsd: undefined }))
  assert.ok(auction.reasons.includes('Current bid, not the final price: expect it to rise.'), auction.reasons.join('\n'))
  const buyNow = score(fx())
  assert.ok(!buyNow.reasons.includes('Current bid, not the final price: expect it to rise.'))
  assert.ok(buyNow.reasons.some((r) => r.startsWith('Buy-now price')))
})

test('the total is clamped to 0–100', () => {
  assert.equal(score(fx(), EST, { make: 'Honda', models: ['Civic Si'], tier: 'supercar', why: 'test' }).total, 100)
  const wreck = score(fx({ buyNowUsd: 95_000, damage: 'severe', runsAndDrives: false }))
  assert.equal(wreck.total, 0)
  assert.equal(wreck.grade, 'pass')
})

test('red flags: a clean fixture has none', () => {
  assert.deepEqual(score(fx()).redFlags, [])
})

test('red flags: every bad title status', () => {
  for (const t of ['salvage', 'rebuilt', 'flood', 'lemon', 'parts-only'] as const) {
    const s = score(fx({ titleStatus: t }))
    assert.ok(s.redFlags.some((f) => f.startsWith(`Title is ${t}`)), `${t}: ${s.redFlags.join('\n')}`)
  }
  assert.deepEqual(score(fx({ titleStatus: 'unknown' })).redFlags, [])
})

test('red flags: severe and moderate damage, but not minor', () => {
  assert.ok(score(fx({ damage: 'severe' })).redFlags.some((f) => f.includes('severe')))
  assert.ok(score(fx({ damage: 'moderate' })).redFlags.some((f) => f.includes('moderate')))
  assert.deepEqual(score(fx({ damage: 'minor' })).redFlags, [])
})

test('red flags: does not run and drive', () => {
  assert.ok(score(fx({ runsAndDrives: false })).redFlags.some((f) => f.includes('does not run and drive')))
  assert.deepEqual(score(fx({ runsAndDrives: undefined })).redFlags, [])
})

test('red flags: no VIN shown', () => {
  const s = score(fx({ vin: undefined }))
  assert.ok(s.redFlags.some((f) => f.startsWith('No VIN shown — ask the seller for it before you bid')), s.redFlags.join('\n'))
})

test('red flags: more than 60% under the estimate is a scam pattern', () => {
  const s = score(fx({ buyNowUsd: 30_000 }))
  assert.ok(s.redFlags.some((f) => f.includes('too-good-to-be-true') && f.includes('never wire a deposit')), s.redFlags.join('\n'))
  assert.deepEqual(score(fx({ buyNowUsd: 45_000 })).redFlags, [])
})

test('red flags: SAMPLE is never a real car', () => {
  const s = score(fx({ kind: 'SAMPLE', source: 'sample', url: '#sample', vin: 'SAMPLE00000000001' }))
  assert.ok(s.redFlags.some((f) => f.startsWith('SAMPLE — not a real car')), s.redFlags.join('\n'))
})

test('red flags are reported even when the car is unpriced', () => {
  const s = score(fx({ titleStatus: 'salvage' }), NO_EST)
  assert.equal(s.grade, 'unpriced')
  assert.ok(s.redFlags.some((f) => f.startsWith('Title is salvage')))
})

test('starterOk and starterBlocks come from the starter rules passed in', () => {
  // The default fixture asks $65,000, which is above the $60,000 starter price cap, so use $50,000 here.
  const ok = score(fx({ buyNowUsd: 50_000 }))
  assert.equal(ok.starterOk, true)
  assert.deepEqual(ok.starterBlocks, [])
  const capped = score(fx())
  assert.equal(capped.starterOk, false)
  assert.ok(capped.starterBlocks[0].startsWith('Price is $65,000, above the starter cap of $60,000'), capped.starterBlocks[0])
  const blocked = score(fx({ buyNowUsd: 50_000, titleStatus: 'salvage' }))
  assert.equal(blocked.starterOk, false)
  assert.equal(blocked.starterBlocks.length, 1)
  const strict = scoreListing(fx({ buyNowUsd: 50_000 }), EST, undefined, { ...config.starter, maxPriceUsd: 1_000 }, NOW)
  assert.equal(strict.starterOk, false)
  assert.ok(strict.starterBlocks[0].startsWith('Price is $50,000'))
})

test('every reason and red flag reads as a full sentence', () => {
  const s = score(fx({ damage: 'minor', runsAndDrives: undefined, hasKeys: false, vin: undefined, saleType: 'auction', currentBidUsd: 65_000, buyNowUsd: undefined }))
  for (const r of [...s.reasons, ...s.redFlags]) {
    assert.ok(/[.!?]$/.test(r), `not a sentence: ${r}`)
    assert.ok(/^[A-Z"]/.test(r), `does not start with a capital: ${r}`)
  }
})
