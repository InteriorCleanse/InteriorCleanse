import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkVin, normaliseVin, validateListing, vinCheckDigit, type ListingDraft } from '../listing.ts'

// 1M8GDM9AXKP042788 is the standard worked example for the check digit.
const GOOD_VIN = '1M8GDM9AXKP042788'

describe('VIN', () => {
  it('computes the check digit, including X', () => {
    assert.equal(vinCheckDigit(GOOD_VIN), 'X')
    assert.equal(checkVin(GOOD_VIN), 'ok')
    assert.equal(checkVin('1m8gdm9axkp 042788'), 'ok', 'case and spaces are normalised')
  })
  it('rejects bad formats and mistypes', () => {
    assert.equal(checkVin(''), 'empty')
    assert.equal(checkVin('1M8GDM9AXKP04278'), 'format')
    assert.equal(checkVin('1M8GDM9AXKP04278O'), 'format', 'O is never valid')
    assert.equal(checkVin('1M8GDM9AXKP042789'), 'checksum')
    assert.equal(normaliseVin(' ab-cd '), 'ABCD')
  })
})

const base: ListingDraft = {
  vin: GOOD_VIN,
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  body: 'suv',
  fuel: 'hybrid',
  transmission: 'automatic',
  seats: 5,
  miles: 42_000,
  city: 'denver',
  neighborhood: 'RiNo',
  deliveryOffered: false,
  deliveryFeeCents: 0,
  dailyRateCents: 6_500,
  weeklyDiscountPct: 10,
  instantBook: true,
  noOpenRecalls: true,
  insuredAndRegistered: true,
}

describe('validateListing', () => {
  it('accepts a complete, eligible car', () => {
    assert.deepEqual(validateListing(base, 2026), [])
  })
  it('enforces age, mileage and price bounds', () => {
    const fields = (d: Partial<ListingDraft>) => validateListing({ ...base, ...d }, 2026).map((p) => p.field)
    assert.deepEqual(fields({ year: 2013 }), ['year'])
    assert.deepEqual(fields({ year: 2014 }), [])
    assert.deepEqual(fields({ miles: 130_000 }), ['miles'])
    assert.deepEqual(fields({ dailyRateCents: 1_500 }), ['dailyRateCents'])
  })
  it('requires the safety attestations and points at the right step', () => {
    const p = validateListing({ ...base, noOpenRecalls: false, insuredAndRegistered: false }, 2026)
    assert.deepEqual(p.map((x) => x.step), ['safety', 'safety'])
  })
})
