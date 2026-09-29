/**
 * GSA Auctions — federal surplus vehicles, through the government's own
 * Auctions API (api.gsa.gov, keys from api.data.gov).
 *
 *   GET https://api.gsa.gov/assets/gsaauctions/v2/auctions?api_key=…&format=JSON
 *
 * GSA's published field reference spells the fields SaleNo, LotNo, AucEndDt,
 * ItemName and so on; the live API (checked by `npm run probe` on GitHub)
 * sends them as saleNo, lotNo, aucEndDt, itemName, with the lot text in
 * lotInfo rather than LotDescript. Fields are therefore read without regard
 * to case, and the lot text from whichever of the two is there, whatever its
 * shape. The feed carries everything the government sells, so
 * only lots that read as vehicles are kept. The API is read-only; bidding
 * happens on gsaauctions.gov.
 *
 * Switched on by GAVEL_GSA_API_KEY (a free api.data.gov key), or by
 * GAVEL_GSA=1, which uses the shared DEMO_KEY and its low rate limit.
 */
import type { Listing, SearchQuery } from '../types.ts'
import { env, flag } from '../env.ts'
import { looksLikeVin, parseDamage, parseMoney, parseTitleStatus, splitTitle } from './normalize.ts'

const URL_BASE = 'https://api.gsa.gov/assets/gsaauctions/v2/auctions'
const CACHE_MS = 15 * 60_000

export function gsaConfigured(): boolean {
  return !!env('GAVEL_GSA_API_KEY') || flag('GAVEL_GSA')
}

function key(): string {
  return env('GAVEL_GSA_API_KEY') || 'DEMO_KEY'
}

type Row = Record<string, unknown>

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
}

/** The row with every key lower-cased: the reference says SaleNo, the live API sends saleNo. */
function lowerKeys(r: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(r)) out[k.toLowerCase()] = v
  return out
}

/** Readable text from a field that may be a string, a number, a list or an object of them. */
function textOf(v: unknown, depth = 0): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (depth > 3 || !v || typeof v !== 'object') return ''
  const parts = (Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)).map((x) => textOf(x, depth + 1)).filter(Boolean)
  return parts.join(' ').slice(0, 4000)
}

/** The list of lots, wherever the response keeps it. */
export function gsaRows(body: unknown): Row[] {
  if (Array.isArray(body)) return body as Row[]
  if (body && typeof body === 'object') {
    for (const v of Object.values(body as Record<string, unknown>)) if (Array.isArray(v)) return v as Row[]
  }
  return []
}

const VEHICLE_WORDS = /\b(sedan|coupe|pickup|pick-up|truck|suv|sport utility|van|minivan|wagon|hatchback|4x4|4wd|awd|crew cab|extended cab|vehicle)\b/i

function parseDate(v: string): number | undefined {
  if (!v) return undefined
  const n = Date.parse(v)
  return Number.isFinite(n) ? n : undefined
}

function mileageFrom(text: string): number | undefined {
  const m = /(?:odometer|mileage|miles)[^0-9]{0,12}([\d,]{3,9})/i.exec(text) ?? /([\d,]{3,9})\s*(?:miles|mi\.?)\b/i.exec(text)
  if (!m) return undefined
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) && n < 2_000_000 ? n : undefined
}

function runsFrom(text: string): boolean | undefined {
  if (/(does not|doesn't|will not|won't)\s+(start|run)|inoperable|non[- ]?running|not running/i.test(text)) return false
  if (/\b(starts|runs)\b(\s+and\s+(drives|moves))?/i.test(text)) return true
  return undefined
}

/** Turn one GSA lot into a listing, or undefined when it does not read as a vehicle. */
export function fromGsaRow(raw: Row, now = Date.now()): Listing | undefined {
  const r = lowerKeys(raw)
  const name = s(r.itemname)
  const desc = textOf(r.lotdescript) || textOf(r.lotinfo)
  if (!name) return undefined
  const t = splitTitle(name)
  const vinMatch = /\b([A-HJ-NPR-Z0-9]{17})\b/.exec(`${name} ${desc}`.toUpperCase())
  const isVehicle = (t.year !== undefined && t.make !== undefined) || VEHICLE_WORDS.test(`${name} ${desc}`) || !!vinMatch
  if (!isVehicle) return undefined
  const sale = s(r.saleno)
  const lot = s(r.lotno)
  const text = `${name}. ${desc}`
  const title = /\bSF[- ]?97\b|certificate to obtain title/i.test(text) ? 'clean' : parseTitleStatus(desc)
  const bid = parseMoney(s(r.highbidamount))
  return {
    id: `gsa:${sale}-${lot}`,
    source: 'gsa',
    externalId: `${sale}-${lot}`,
    lotNumber: lot || undefined,
    url: s(r.itemdescurl) || 'https://www.gsaauctions.gov/',
    title: name,
    year: t.year,
    make: t.make ? t.make[0].toUpperCase() + t.make.slice(1).toLowerCase() : undefined,
    model: t.model,
    vin: vinMatch && looksLikeVin(vinMatch[1]) ? vinMatch[1] : undefined,
    mileage: mileageFrom(desc),
    titleStatus: title,
    damage: parseDamage(desc),
    runsAndDrives: runsFrom(desc),
    location: { city: (s(r.propertycity) || s(r.locationcity)) || undefined, state: (s(r.propertystate) || s(r.locationst)).toUpperCase() || undefined, postalCode: (s(r.propertyzip) || s(r.locationzip)) || undefined, country: 'US' },
    saleType: 'auction',
    currentBidUsd: bid !== undefined && bid > 0 ? bid : undefined,
    endsAt: parseDate(s(r.aucenddt)),
    bidCount: r.bidderscount !== undefined && r.bidderscount !== null && Number.isFinite(Number(r.bidderscount)) ? Number(r.bidderscount) : undefined,
    sellerType: 'fleet',
    photos: s(r.imageurl) ? [s(r.imageurl)] : [],
    description: desc || undefined,
    kind: 'LIVE',
    origin: 'api',
    fetchedAt: now,
  }
}

let cache: { at: number; listings: Listing[] } | null = null

/** Every GSA lot that reads as a vehicle. The whole list is fetched and cached; the query is applied by the registry. */
export async function searchGsa(_q: SearchQuery, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Listing[]> {
  if (!gsaConfigured()) return []
  if (cache && now - cache.at < CACHE_MS) return cache.listings
  const res = await fetchImpl(`${URL_BASE}?api_key=${encodeURIComponent(key())}&format=JSON`, { headers: { accept: 'application/json' } })
  if (res.status === 429) throw new Error('GSA says too many requests. With DEMO_KEY the limit is low; add a free key from api.data.gov as GAVEL_GSA_API_KEY.')
  if (!res.ok) throw new Error(`GSA Auctions answered HTTP ${res.status}.`)
  const listings = gsaRows(await res.json()).map((r) => fromGsaRow(r, now)).filter((l): l is Listing => !!l)
  cache = { at: now, listings }
  return listings
}

/** Tests only. */
export function resetGsaCache(): void {
  cache = null
}
