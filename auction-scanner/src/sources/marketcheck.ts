/**
 * MarketCheck — an official, paid automotive data API. Two uses:
 *
 *   1. Auction lots for the feed (the Auction Inventory Search endpoint).
 *   2. Dealer asking prices as COMPARABLES for any car in the feed, through
 *      the Inventory Search endpoint GET /v2/search/car/active. These are
 *      never shown as feed cars; they only sharpen the estimate.
 *
 * Base https://api.marketcheck.com/v2/ with api_key, rows (max 50) and start.
 * Responses carry num_found and listings[]. The auction endpoint's path can
 * differ by plan, so it is set by GAVEL_MARKETCHECK_AUCTION_PATH (default
 * search/car/auction/active); check your MarketCheck dashboard. Parsing is
 * tolerant: a field the response does not carry stays blank.
 */
import type { Listing, SearchQuery } from '../types.ts'
import { env } from '../env.ts'
import { looksLikeVin, parseDamage, parseTitleStatus } from './normalize.ts'
import { CATALOG } from '../catalog.ts'

const BASE = 'https://api.marketcheck.com/v2/'
const COMPS_CACHE_MS = 30 * 60_000

export function marketcheckConfigured(): boolean {
  return !!env('GAVEL_MARKETCHECK_API_KEY')
}

function auctionPath(): string {
  return (env('GAVEL_MARKETCHECK_AUCTION_PATH') || 'search/car/auction/active').replace(/^\/+/, '')
}

type Row = Record<string, unknown>
const obj = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/[$,\s]/g, '')) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Split free text such as "porsche 911 carrera" into a make the catalogue knows and the rest as the model. */
export function makeModelFromText(text: string | undefined): { make?: string; model?: string } {
  const t = (text ?? '').trim()
  if (!t) return {}
  const lower = t.toLowerCase()
  const hit = [...CATALOG].sort((a, b) => b.make.length - a.make.length).find((c) => lower === c.make.toLowerCase() || lower.startsWith(c.make.toLowerCase() + ' '))
  if (!hit) return {}
  const rest = t.slice(hit.make.length).trim()
  return { make: hit.make, model: rest || undefined }
}

export type McKind = 'auction' | 'dealer'

/** One MarketCheck listing to a Gavel listing. Dealer rows become buy-now comparables; auction rows become auction lots. */
export function fromMarketcheckRow(r: Row, kind: McKind, now = Date.now()): Listing | undefined {
  const id = str(r.id)
  const build = obj(r.build)
  const dealer = obj(r.dealer)
  const media = obj(r.media)
  const heading = str(r.heading) || [str(build.year), str(build.make), str(build.model), str(build.trim)].filter(Boolean).join(' ')
  if (!id || !heading) return undefined
  const vin = str(r.vin).toUpperCase()
  const price = num(r.price)
  const bid = num(r.current_bid) ?? (kind === 'auction' ? price : undefined)
  const photos = Array.isArray(media.photo_links) ? (media.photo_links as unknown[]).filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 16) : []
  const cleanFlag = r.carfax_clean_title === true ? 'clean' : undefined
  const titleText = str(r.title_status) || str(r.title_type) || str(r.title)
  const end = str(r.auction_end_date) || str(r.end_date) || str(r.sale_date)
  const endsAt = end ? Date.parse(end) : NaN
  const runs = typeof r.run_and_drive === 'boolean' ? r.run_and_drive : typeof r.runs_drives === 'boolean' ? r.runs_drives : undefined
  return {
    id: `marketcheck:${id}`,
    source: 'marketcheck',
    externalId: id,
    url: str(r.vdp_url) || 'https://www.marketcheck.com',
    title: heading,
    year: num(build.year),
    make: str(build.make) || undefined,
    model: str(build.model) || undefined,
    trim: str(build.trim) || undefined,
    vin: looksLikeVin(vin) ? vin : undefined,
    mileage: num(r.miles),
    titleStatus: cleanFlag ?? (titleText ? parseTitleStatus(titleText) : 'unknown'),
    damage: parseDamage(str(r.damage) || str(r.primary_damage) || undefined),
    runsAndDrives: runs,
    bodyStyle: str(build.body_type) || undefined,
    transmission: str(build.transmission) || undefined,
    drivetrain: str(build.drivetrain) || undefined,
    fuel: str(build.fuel_type) || undefined,
    exteriorColor: str(r.exterior_color) || undefined,
    location: { city: str(dealer.city) || undefined, state: str(dealer.state).toUpperCase() || undefined, postalCode: str(dealer.zip) || undefined, country: 'US' },
    saleType: kind === 'auction' ? 'auction' : 'buy-now',
    currentBidUsd: kind === 'auction' ? bid : undefined,
    buyNowUsd: kind === 'dealer' ? price : num(r.buy_now_price),
    endsAt: Number.isFinite(endsAt) ? endsAt : undefined,
    sellerType: kind === 'dealer' ? 'dealer' : 'unknown',
    lotNumber: str(r.lot_number) || undefined,
    photos,
    kind: 'LIVE',
    origin: 'api',
    fetchedAt: now,
  }
}

function rows(body: unknown): Row[] {
  const b = obj(body)
  return Array.isArray(b.listings) ? (b.listings as Row[]) : []
}

async function call(path: string, params: Record<string, string | number | undefined>, fetchImpl: typeof fetch): Promise<Row[]> {
  const u = new URL(path, BASE)
  u.searchParams.set('api_key', env('GAVEL_MARKETCHECK_API_KEY'))
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v))
  const res = await fetchImpl(u.toString(), { headers: { accept: 'application/json' } })
  if (res.status === 401 || res.status === 403) throw new Error('MarketCheck refused the key. Check GAVEL_MARKETCHECK_API_KEY and that your plan includes this endpoint.')
  if (res.status === 404) throw new Error(`MarketCheck has no endpoint at ${path} on your plan. Set GAVEL_MARKETCHECK_AUCTION_PATH to the path in your MarketCheck dashboard.`)
  if (res.status === 429) throw new Error('MarketCheck rate limit reached for now.')
  if (!res.ok) throw new Error(`MarketCheck answered HTTP ${res.status}.`)
  return rows(await res.json())
}

/** Auction lots for the feed. */
export async function searchMarketcheckAuctions(q: SearchQuery, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Listing[]> {
  if (!marketcheckConfigured()) return []
  const mm = q.make ? { make: q.make, model: undefined } : makeModelFromText(q.text)
  const found = await call(auctionPath(), { make: mm.make, model: mm.model, rows: 50, start: 0, car_type: 'used' }, fetchImpl)
  return found.map((r) => fromMarketcheckRow(r, 'auction', now)).filter((l): l is Listing => !!l)
}

const compsCache = new Map<string, { at: number; listings: Listing[] }>()

/** Dealer asking prices for a make and model: comparables only, never feed cars. */
export async function marketcheckComps(make: string, model: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Listing[]> {
  if (!marketcheckConfigured() || !make || !model) return []
  const key = `${make.toLowerCase()}|${model.toLowerCase().split(' ')[0]}`
  const hit = compsCache.get(key)
  if (hit && now - hit.at < COMPS_CACHE_MS) return hit.listings
  const found = await call('search/car/active', { make, model: model.split(' ')[0], car_type: 'used', rows: 50, start: 0 }, fetchImpl)
  const listings = found.map((r) => fromMarketcheckRow(r, 'dealer', now)).filter((l): l is Listing => !!l)
  compsCache.set(key, { at: now, listings })
  return listings
}

/** Tests only. */
export function resetMarketcheckCache(): void {
  compsCache.clear()
}
