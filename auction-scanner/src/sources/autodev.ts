/**
 * auto.dev — an official vehicle-data API with a free tier. Gavel uses its
 * Vehicle Listings API for one thing: dealer asking prices as COMPARABLES,
 * like MarketCheck's dealer search. They are never feed cars.
 *
 *   GET https://api.auto.dev/listings?vehicle.make=Toyota&vehicle.model=Camry&vehicle.year=2017-2019
 *   Authorization: Bearer <key>
 *
 * Each listing carries a `vehicle` object (vin, year, make, model, trim) and a
 * `retailListing` object (price, miles, city, state, dealer). The shape comes
 * from auto.dev's documentation as published; parsing is tolerant, and
 * `npm run probe` checks it against the live API once a key is set.
 */
import type { Listing } from '../types.ts'
import { env } from '../env.ts'
import { canonicalMake, looksLikeVin } from './normalize.ts'

const BASE = 'https://api.auto.dev/listings'
const CACHE_MS = 30 * 60_000
const CACHE_MAX = 500

export function autodevConfigured(): boolean {
  return !!env('GAVEL_AUTODEV_API_KEY')
}

type Row = Record<string, unknown>
const obj = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/[$,\s]/g, '')) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** The list of listings, wherever the answer keeps it. */
export function autodevRows(body: unknown): Row[] {
  if (Array.isArray(body)) return body as Row[]
  const b = obj(body)
  for (const k of ['data', 'listings', 'records', 'results']) if (Array.isArray(b[k])) return b[k] as Row[]
  return []
}

/** One auto.dev listing to a comparable, or undefined without a price and a year, make and model. */
export function fromAutodevRow(r: Row, now = Date.now()): Listing | undefined {
  const v = obj(r.vehicle)
  const retail = obj(r.retailListing)
  const vin = str(v.vin).toUpperCase()
  const year = num(v.year)
  const make = canonicalMake(str(v.make))
  const model = str(v.model)
  const price = num(retail.price)
  if (!year || !make || !model || price === undefined) return undefined
  const id = looksLikeVin(vin) ? vin : `${year}-${make}-${model}-${price}-${str(retail.miles)}`
  return {
    id: `autodev:${id}`,
    source: 'autodev',
    externalId: id,
    url: /^https:\/\//.test(str(retail.vdp)) ? str(retail.vdp) : 'https://auto.dev',
    title: [year, make, model, str(v.trim)].filter(Boolean).join(' '),
    year,
    make,
    model,
    trim: str(v.trim) || undefined,
    vin: looksLikeVin(vin) ? vin : undefined,
    mileage: num(retail.miles),
    titleStatus: 'unknown',
    damage: 'unknown',
    location: { city: str(retail.city) || undefined, state: str(retail.state).toUpperCase() || undefined, country: 'US' },
    saleType: 'buy-now',
    buyNowUsd: price,
    sellerType: 'dealer',
    photos: [],
    kind: 'LIVE',
    origin: 'api',
    fetchedAt: now,
  }
}

const cache = new Map<string, { at: number; listings: Listing[] }>()

/** Dealer asking prices for a make and model, a model year either side when the year is known. */
export async function autodevComps(make: string, model: string, year: number | undefined, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Listing[]> {
  if (!autodevConfigured() || !make || !model) return []
  const firstModel = model.split(' ')[0]
  const key = `${make.toLowerCase()}|${firstModel.toLowerCase()}|${year ?? ''}`
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.listings
  const qs = new URLSearchParams({ 'vehicle.make': make, 'vehicle.model': firstModel, limit: '50' })
  if (year) qs.set('vehicle.year', `${year - 1}-${year + 1}`)
  const res = await fetchImpl(`${BASE}?${qs}`, { headers: { authorization: `Bearer ${env('GAVEL_AUTODEV_API_KEY')}`, accept: 'application/json' } })
  if (res.status === 401 || res.status === 403) throw new Error('auto.dev refused the key. Check GAVEL_AUTODEV_API_KEY on your auto.dev dashboard.')
  if (res.status === 429) throw new Error('auto.dev says too many requests: the free tier allows about 1,000 calls a month.')
  if (!res.ok) throw new Error(`auto.dev answered HTTP ${res.status}.`)
  const listings = autodevRows(await res.json()).map((r) => fromAutodevRow(r, now)).filter((l): l is Listing => !!l)
  cache.delete(key)
  cache.set(key, { at: now, listings })
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
  return listings
}

/** Tests only. */
export function resetAutodevCache(): void {
  cache.clear()
}
