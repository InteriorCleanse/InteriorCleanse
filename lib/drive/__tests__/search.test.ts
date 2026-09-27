import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_SEARCH,
  activeFilterCount,
  applySearch,
  blockedRanges,
  clearFilters,
  isAvailable,
  matchesQuery,
  parseSearch,
  searchHref,
  sortCars,
  toSearchParams,
} from '../search.ts'
import type { Car, SearchState } from '../types.ts'

function car(over: Partial<Car>): Car {
  return {
    id: 'car_x',
    slug: 'x',
    make: 'Toyota',
    model: 'RAV4 Hybrid',
    year: 2023,
    trim: null,
    body: 'suv',
    fuel: 'hybrid',
    transmission: 'automatic',
    color: { name: 'Deep Blue', hex: '#1F3A6E' },
    seats: 5,
    doors: 4,
    efficiency: { mpg: 40 },
    features: ['awd', 'apple-carplay'],
    dailyRateCents: 6400,
    weeklyDiscountPct: 10,
    monthlyDiscountPct: 20,
    instantBook: true,
    delivery: { offered: false, feeCents: 0, radiusMiles: 0 },
    milesPerDay: 200,
    minDays: 1,
    maxDays: 30,
    city: 'austin',
    neighborhood: 'Mueller',
    lat: 0,
    lng: 0,
    hostId: 'host_01',
    rating: 4.8,
    tripCount: 50,
    listedAt: '2025-01-01',
    description: '',
    guidelines: [],
    blockedOffsets: [[3, 5]],
    reviews: [],
    ...over,
  }
}

const cityName = (slug: string) => (slug === 'austin' ? 'Austin' : slug)

describe('URL round trip', () => {
  it('parses what it writes and drops what it does not know', () => {
    const state: SearchState = {
      ...EMPTY_SEARCH,
      q: 'tesla',
      city: 'austin',
      start: '2026-10-03',
      end: '2026-10-05',
      minCents: 4000,
      maxCents: 12000,
      bodies: ['suv', 'van'],
      fuels: ['electric'],
      transmission: 'manual',
      minSeats: 7,
      features: ['awd'],
      instantBook: true,
      delivery: true,
      sort: 'price-asc',
    }
    const params = toSearchParams(state)
    assert.deepEqual(parseSearch(params), state)
    assert.equal(params.get('min'), '40')
    assert.equal(params.get('body'), 'suv,van')
  })

  it('writes nothing for an empty search and ignores junk', () => {
    assert.equal(toSearchParams(EMPTY_SEARCH).toString(), '')
    assert.equal(searchHref({}), '/drive/cars/')
    const parsed = parseSearch(new URLSearchParams('body=spaceship,suv&sort=weird&seats=-2&min=abc&start=tomorrow&trans=cvt'))
    assert.deepEqual(parsed.bodies, ['suv'])
    assert.equal(parsed.sort, 'relevance')
    assert.equal(parsed.minSeats, null)
    assert.equal(parsed.minCents, null)
    assert.equal(parsed.start, '')
    assert.equal(parsed.transmission, null)
  })

  it('counts and clears filters without touching where and when', () => {
    const state = parseSearch(new URLSearchParams('city=austin&start=2026-10-03&end=2026-10-05&body=suv&instant=1&max=100'))
    assert.equal(activeFilterCount(state), 3)
    const cleared = clearFilters(state)
    assert.equal(activeFilterCount(cleared), 0)
    assert.equal(cleared.city, 'austin')
    assert.equal(cleared.start, '2026-10-03')
  })
})

describe('matching', () => {
  it('matches every word of a query against the car and its city', () => {
    const c = car({})
    assert.equal(matchesQuery(c, 'toyota austin', 'Austin'), true)
    assert.equal(matchesQuery(c, 'rav4 blue', 'Austin'), true)
    assert.equal(matchesQuery(c, 'tesla', 'Austin'), false)
    assert.equal(matchesQuery(c, '', 'Austin'), true)
  })

  it('anchors blocked dates on today and refuses overlapping trips', () => {
    const c = car({})
    assert.deepEqual(blockedRanges(c, '2026-10-01'), [{ start: '2026-10-04', end: '2026-10-06' }])
    assert.equal(isAvailable(c, '2026-10-02', '2026-10-03', '2026-10-01'), true)
    assert.equal(isAvailable(c, '2026-10-05', '2026-10-08', '2026-10-01'), false)
    assert.equal(isAvailable(c, '', '', '2026-10-01'), true)
  })

  it('applies filters and sorts deterministically', () => {
    const cheap = car({ id: 'a', slug: 'a', dailyRateCents: 3000, rating: 4.6, listedAt: '2026-01-01' })
    const dear = car({ id: 'b', slug: 'b', dailyRateCents: 9000, rating: 4.9, listedAt: '2025-01-01', fuel: 'electric', seats: 7 })
    const manual = car({ id: 'c', slug: 'c', dailyRateCents: 5000, transmission: 'manual', instantBook: false })
    const fleet = [cheap, dear, manual]
    const today = '2026-10-01'

    assert.deepEqual(sortCars(fleet, 'price-asc').map((c) => c.id), ['a', 'c', 'b'])
    assert.deepEqual(sortCars(fleet, 'price-desc').map((c) => c.id), ['b', 'c', 'a'])
    assert.deepEqual(sortCars(fleet, 'rating').map((c) => c.id), ['b', 'c', 'a'])
    assert.deepEqual(sortCars(fleet, 'newest').map((c) => c.id), ['a', 'b', 'c'])

    const electricSeven = applySearch(fleet, { ...EMPTY_SEARCH, fuels: ['electric'], minSeats: 7 }, cityName, today)
    assert.deepEqual(electricSeven.map((c) => c.id), ['b'])

    const instantUnder6k = applySearch(fleet, { ...EMPTY_SEARCH, instantBook: true, maxCents: 6000 }, cityName, today)
    assert.deepEqual(instantUnder6k.map((c) => c.id), ['a'])

    const onBlockedDates = applySearch(fleet, { ...EMPTY_SEARCH, start: '2026-10-04', end: '2026-10-05' }, cityName, today)
    assert.equal(onBlockedDates.length, 0)
  })
})
