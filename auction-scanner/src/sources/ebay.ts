/**
 * eBay Motors — the one live source, through eBay's official Browse API.
 *
 * Needs a free developer keyset (GAVEL_EBAY_CLIENT_ID / _SECRET). The token
 * is a client-credentials grant scoped to public data; it can search and read
 * listings and cannot bid, buy or touch an account. Bidding on eBay happens on
 * eBay: Gavel prepares the number and opens the lot.
 *
 * The network calls live in `fetchJson` so the parsers can be tested on
 * captured responses without touching the internet.
 */
import type { Listing, SearchQuery } from '../types.ts'
import { env } from '../env.ts'
import { parseDamage, parseMileage, parseTitleStatus, splitTitle, looksLikeVin } from './normalize.ts'

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
const BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
/** eBay category 6001: Cars & Trucks. */
const CARS_CATEGORY = '6001'

export function ebayConfigured(): boolean {
  return !!(env('GAVEL_EBAY_CLIENT_ID') && env('GAVEL_EBAY_CLIENT_SECRET'))
}

let token: { value: string; expiresAt: number } | null = null

async function accessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value
  const basic = Buffer.from(`${env('GAVEL_EBAY_CLIENT_ID')}:${env('GAVEL_EBAY_CLIENT_SECRET')}`).toString('base64')
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  })
  if (!res.ok) throw new Error(`eBay token request failed: HTTP ${res.status}`)
  const j = (await res.json()) as { access_token: string; expires_in: number }
  token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 }
  return token.value
}

/** The subset of an eBay item summary Gavel reads. */
export type EbayItemSummary = {
  itemId: string
  title: string
  itemWebUrl: string
  price?: { value: string; currency: string }
  currentBidPrice?: { value: string; currency: string }
  buyingOptions?: string[]
  bidCount?: number
  itemEndDate?: string
  image?: { imageUrl: string }
  additionalImages?: Array<{ imageUrl: string }>
  condition?: string
  itemLocation?: { city?: string; stateOrProvince?: string; country?: string; postalCode?: string }
  seller?: { username?: string; feedbackPercentage?: string }
  localizedAspects?: Array<{ name: string; value: string }>
  shortDescription?: string
}

function aspect(item: EbayItemSummary, ...names: string[]): string | undefined {
  const want = names.map((n) => n.toLowerCase())
  return item.localizedAspects?.find((a) => want.includes(a.name.toLowerCase()))?.value
}

export function fromEbayItem(item: EbayItemSummary, now = Date.now()): Listing {
  const t = splitTitle(item.title)
  const opts = item.buyingOptions ?? []
  const auction = opts.includes('AUCTION')
  const buyNow = opts.includes('FIXED_PRICE') || opts.includes('BEST_OFFER')
  const vin = aspect(item, 'VIN', 'Vehicle Identification Number')
  const yearText = aspect(item, 'Model Year', 'Year')
  const damageText = [aspect(item, 'Vehicle Condition', 'Damage'), item.condition, item.shortDescription].filter(Boolean).join(' ')
  const runs = /runs? and drives|running and driving|drives great|runs great/i.test(item.shortDescription ?? '') ? true : /does not run|non[- ]running|not running|no start/i.test(item.shortDescription ?? '') ? false : undefined
  const photos = [item.image?.imageUrl, ...(item.additionalImages ?? []).map((i) => i.imageUrl)].filter((u): u is string => !!u)
  return {
    id: `ebay:${item.itemId}`,
    source: 'ebay',
    externalId: item.itemId,
    url: item.itemWebUrl,
    title: item.title,
    year: yearText ? Number(yearText) || t.year : t.year,
    make: aspect(item, 'Make') ?? t.make,
    model: aspect(item, 'Model') ?? t.model,
    trim: aspect(item, 'Trim'),
    vin: looksLikeVin(vin) ? vin!.toUpperCase() : undefined,
    mileage: parseMileage(aspect(item, 'Mileage', 'Odometer')),
    titleStatus: parseTitleStatus(aspect(item, 'Title Status', 'Vehicle Title')),
    damage: parseDamage(damageText),
    runsAndDrives: runs,
    bodyStyle: aspect(item, 'Body Type'),
    transmission: aspect(item, 'Transmission'),
    drivetrain: aspect(item, 'Drive Type', 'Drivetrain'),
    fuel: aspect(item, 'Fuel Type'),
    exteriorColor: aspect(item, 'Exterior Color'),
    location: item.itemLocation ? { city: item.itemLocation.city, state: item.itemLocation.stateOrProvince, country: item.itemLocation.country, postalCode: item.itemLocation.postalCode } : undefined,
    saleType: auction && buyNow ? 'auction-or-buy-now' : auction ? 'auction' : 'buy-now',
    currentBidUsd: auction ? Number(item.currentBidPrice?.value ?? item.price?.value) || undefined : undefined,
    buyNowUsd: buyNow ? Number(item.price?.value) || undefined : undefined,
    endsAt: item.itemEndDate ? Date.parse(item.itemEndDate) || undefined : undefined,
    bidCount: item.bidCount,
    sellerType: 'unknown',
    photos,
    description: item.shortDescription,
    kind: 'LIVE',
    fetchedAt: now,
  }
}

export function buildBrowseUrl(q: SearchQuery): string {
  const u = new URL(BROWSE_URL)
  u.searchParams.set('category_ids', CARS_CATEGORY)
  u.searchParams.set('q', q.text || q.make || 'car')
  u.searchParams.set('limit', String(Math.min(q.limit ?? 50, 200)))
  const filters: string[] = ['buyingOptions:{AUCTION|FIXED_PRICE}', 'itemLocationCountry:US']
  if (q.maxPriceUsd) filters.push(`price:[..${q.maxPriceUsd}]`, 'priceCurrency:USD')
  u.searchParams.set('filter', filters.join(','))
  u.searchParams.set('fieldgroups', 'EXTENDED')
  u.searchParams.set('sort', 'endingSoonest')
  return u.toString()
}

export async function searchEbay(q: SearchQuery, fetchImpl: typeof fetch = fetch): Promise<Listing[]> {
  if (!ebayConfigured()) return []
  const tok = await accessToken(fetchImpl)
  const res = await fetchImpl(buildBrowseUrl(q), {
    headers: { authorization: `Bearer ${tok}`, 'x-ebay-c-marketplace-id': 'EBAY_US', accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`eBay search failed: HTTP ${res.status}`)
  const j = (await res.json()) as { itemSummaries?: EbayItemSummary[] }
  return (j.itemSummaries ?? []).map((i) => fromEbayItem(i))
}
