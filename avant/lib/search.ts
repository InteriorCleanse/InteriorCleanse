/**
 * Search state lives in the URL so a search is a link: shareable, bookmarkable
 * and restored by the back button. These functions convert between the state
 * object the UI edits and the query string the page reads, and apply a state
 * to the fleet. All pure.
 */

import { addDays, rangesOverlap } from './dates.ts'
import type { DateRange } from './types.ts'
import type { BodyType, Car, FeatureId, Fuel, SearchState, SortKey, Transmission } from './types.ts'
import { BODY_TYPES, FEATURE_IDS, FUELS, TRANSMISSIONS } from './catalog.ts'

export const SORTS: { id: SortKey; label: string }[] = [
  { id: 'relevance', label: 'Recommended' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Top rated' },
  { id: 'newest', label: 'Newest listings' },
]

export const EMPTY_SEARCH: SearchState = {
  q: '',
  city: '',
  start: '',
  end: '',
  minCents: null,
  maxCents: null,
  bodies: [],
  fuels: [],
  transmission: null,
  minSeats: null,
  features: [],
  instantBook: false,
  delivery: false,
  sort: 'relevance',
}

type ParamSource = { get(name: string): string | null }

const BODY_IDS = new Set(BODY_TYPES.map((b) => b.id))
const FUEL_IDS = new Set(FUELS.map((f) => f.id))
const TRANSMISSION_IDS = new Set(TRANSMISSIONS.map((t) => t.id))
const FEATURE_SET = new Set<string>(FEATURE_IDS)
const SORT_IDS = new Set(SORTS.map((s) => s.id))

function list<T extends string>(raw: string | null, allowed: Set<string>): T[] {
  if (!raw) return []
  return Array.from(new Set(raw.split(',').filter((v) => allowed.has(v)))) as T[]
}

function dollarsToCents(raw: string | null): number | null {
  if (raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) * 100 : null
}

function isoOrEmpty(raw: string | null): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
}

/** Reads a query string; anything unknown or malformed is dropped, never thrown. */
export function parseSearch(params: ParamSource): SearchState {
  const seats = Number(params.get('seats'))
  const sort = params.get('sort') ?? ''
  const transmission = params.get('trans') ?? ''
  return {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    city: (params.get('city') ?? '').trim(),
    start: isoOrEmpty(params.get('start')),
    end: isoOrEmpty(params.get('end')),
    minCents: dollarsToCents(params.get('min')),
    maxCents: dollarsToCents(params.get('max')),
    bodies: list<BodyType>(params.get('body'), BODY_IDS),
    fuels: list<Fuel>(params.get('fuel'), FUEL_IDS),
    transmission: TRANSMISSION_IDS.has(transmission as Transmission) ? (transmission as Transmission) : null,
    minSeats: Number.isInteger(seats) && seats > 0 ? seats : null,
    features: list<FeatureId>(params.get('features'), FEATURE_SET),
    instantBook: params.get('instant') === '1',
    delivery: params.get('delivery') === '1',
    sort: SORT_IDS.has(sort as SortKey) ? (sort as SortKey) : 'relevance',
  }
}

/** Writes only what differs from the empty search, so clean URLs stay clean. */
export function toSearchParams(state: SearchState): URLSearchParams {
  const p = new URLSearchParams()
  if (state.q) p.set('q', state.q)
  if (state.city) p.set('city', state.city)
  if (state.start) p.set('start', state.start)
  if (state.end) p.set('end', state.end)
  if (state.minCents !== null) p.set('min', String(Math.round(state.minCents / 100)))
  if (state.maxCents !== null) p.set('max', String(Math.round(state.maxCents / 100)))
  if (state.bodies.length) p.set('body', state.bodies.join(','))
  if (state.fuels.length) p.set('fuel', state.fuels.join(','))
  if (state.transmission) p.set('trans', state.transmission)
  if (state.minSeats !== null) p.set('seats', String(state.minSeats))
  if (state.features.length) p.set('features', state.features.join(','))
  if (state.instantBook) p.set('instant', '1')
  if (state.delivery) p.set('delivery', '1')
  if (state.sort !== 'relevance') p.set('sort', state.sort)
  return p
}

export function searchHref(state: Partial<SearchState>, base = '/search'): string {
  const qs = toSearchParams({ ...EMPTY_SEARCH, ...state }).toString()
  return qs ? `${base}?${qs}` : base
}

/** How many filters are narrowing the results, for the "Filters (3)" badge. */
export function activeFilterCount(state: SearchState): number {
  let n = 0
  if (state.minCents !== null || state.maxCents !== null) n++
  n += state.bodies.length + state.fuels.length + state.features.length
  if (state.transmission) n++
  if (state.minSeats !== null) n++
  if (state.instantBook) n++
  if (state.delivery) n++
  return n
}

export function clearFilters(state: SearchState): SearchState {
  return { ...EMPTY_SEARCH, q: state.q, city: state.city, start: state.start, end: state.end, sort: state.sort }
}

/** Does free text match the car? Every word must hit somewhere. */
export function matchesQuery(car: Car, q: string, cityName: string): boolean {
  if (!q) return true
  const haystack = `${car.year} ${car.make} ${car.model} ${car.trim ?? ''} ${car.body} ${car.fuel} ${car.color.name} ${car.neighborhood} ${cityName}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

/** The car's blocked-out dates, anchored on the visitor's `today`. */
export function blockedRanges(car: Car, today: string): DateRange[] {
  return [...car.blockedOffsets.map(([from, to]) => ({ start: addDays(today, from), end: addDays(today, to) })), ...(car.booked ?? [])]
}

export function isAvailable(car: Car, start: string, end: string, today: string): boolean {
  if (!start || !end) return true
  return !blockedRanges(car, today).some((b) => rangesOverlap(start, end, b.start, b.end))
}

export function matchesFilters(car: Car, s: SearchState, cityName: string, today: string): boolean {
  if (s.city && car.city !== s.city) return false
  if (!matchesQuery(car, s.q, cityName)) return false
  if (!isAvailable(car, s.start, s.end, today)) return false
  if (s.minCents !== null && car.dailyRateCents < s.minCents) return false
  if (s.maxCents !== null && car.dailyRateCents > s.maxCents) return false
  if (s.bodies.length && !s.bodies.includes(car.body)) return false
  if (s.fuels.length && !s.fuels.includes(car.fuel)) return false
  if (s.transmission && car.transmission !== s.transmission) return false
  if (s.minSeats !== null && car.seats < s.minSeats) return false
  if (s.features.length && !s.features.every((f) => car.features.includes(f))) return false
  if (s.instantBook && !car.instantBook) return false
  if (s.delivery && !car.delivery.offered) return false
  return true
}

/**
 * Recommended order: a blend of rating and trip count, with instant book
 * nudged up because it removes a wait. Deterministic, so the list never
 * reshuffles between renders.
 */
export function relevance(car: Car): number {
  return car.rating * 20 + Math.min(car.tripCount, 200) / 10 + (car.instantBook ? 5 : 0)
}

export function sortCars(cars: Car[], sort: SortKey): Car[] {
  const sorted = [...cars]
  switch (sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.dailyRateCents - b.dailyRateCents || a.slug.localeCompare(b.slug))
    case 'price-desc':
      return sorted.sort((a, b) => b.dailyRateCents - a.dailyRateCents || a.slug.localeCompare(b.slug))
    case 'rating':
      return sorted.sort((a, b) => b.rating - a.rating || b.tripCount - a.tripCount || a.slug.localeCompare(b.slug))
    case 'newest':
      return sorted.sort((a, b) => b.listedAt.localeCompare(a.listedAt) || a.slug.localeCompare(b.slug))
    default:
      return sorted.sort((a, b) => relevance(b) - relevance(a) || a.slug.localeCompare(b.slug))
  }
}

export function applySearch(
  cars: Car[],
  state: SearchState,
  cityNameOf: (slug: string) => string,
  today: string,
): Car[] {
  return sortCars(
    cars.filter((car) => matchesFilters(car, state, cityNameOf(car.city), today)),
    state.sort,
  )
}
