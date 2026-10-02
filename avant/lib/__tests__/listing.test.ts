import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkVin, MIN_PHOTO_EDGE, normaliseVin, PHOTO_ANGLES, validateListing, vinCheckDigit, type ListingDraft, type ListingPhoto } from '../listing.ts'

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
  color: 'Silver',
  description: 'A comfortable hybrid I use for weekend trips into the mountains. Clean, quiet and easy to park, with plenty of room for bags and skis.',
  features: ['awd', 'bluetooth'],
  rules: ['No smoking.'],
  efficiency: 40,
  monthlyDiscountPct: 20,
  milesPerDay: 200,
  photos: PHOTO_ANGLES.map(
    (a, i): ListingPhoto => ({ id: `p${i}`, angle: a.id, sha256: 'x'.repeat(64), width: 1600, height: 1200, bytes: 200_000, addedAt: '2026-10-01T00:00:00Z' }),
  ),
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

describe('listing photos', () => {
  it('needs the host’s own photo of every angle', () => {
    const p = validateListing({ ...base, photos: base.photos.filter((x) => x.angle !== 'rear' && x.angle !== 'dash') }, 2026)
    assert.equal(p.length, 1)
    assert.equal(p[0].step, 'photos')
    assert.match(p[0].message, /rear three-quarter, front seats and dash/)
    assert.equal(validateListing({ ...base, photos: [] }, 2026)[0].field, 'photos')
  })
  it('rejects photos too small to look sharp on a listing', () => {
    const small = base.photos.map((x, i) => (i === 0 ? { ...x, width: 640, height: MIN_PHOTO_EDGE - 1 } : x))
    const p = validateListing({ ...base, photos: small }, 2026)
    assert.deepEqual(p.map((x) => x.field), ['photos'])
    assert.match(p[0].message, /Retake one photo/)
  })
})

describe('listing details', () => {
  it('needs a colour, an efficiency figure and a real description', () => {
    const fields = (d: Partial<ListingDraft>) => validateListing({ ...base, ...d }, 2026).map((p) => p.field)
    assert.deepEqual(fields({ color: '' }), ['color'])
    assert.deepEqual(fields({ efficiency: 0 }), ['efficiency'])
    assert.deepEqual(fields({ description: 'Nice car.' }), ['description'])
    assert.deepEqual(fields({ milesPerDay: 50, monthlyDiscountPct: 80 }), ['monthlyDiscountPct', 'milesPerDay'])
  })
})
