/**
 * The source registry — the one place that knows which auction sites Gavel
 * can read live, which it can only point you at, and how to scan them all.
 *
 * Three sources have official, read-only APIs: eBay Motors (Browse API),
 * GSA Auctions (the government's Auctions API) and MarketCheck (a paid data
 * API: auction lots for the feed, dealer asking prices as comparables). Every
 * other house is reached through the member's own imports (the Send to Gavel
 * button, a paste or a CSV), never by scraping. `scanAll()` reads every
 * connected source at once, each with a time limit, never throws (problems
 * come back as plain-English strings), drops duplicates by VIN, and labels the
 * result LIVE, SAMPLE or EMPTY so a sample car is never passed off as real.
 */
import type { Listing, SearchQuery, SourceStatus } from '../types.ts'
import { AUCTION_HOUSES } from './directory.ts'
import { ebayConfigured, searchEbay } from './ebay.ts'
import { gsaConfigured, searchGsa } from './gsa.ts'
import { marketcheckComps, marketcheckConfigured, searchMarketcheckAuctions } from './marketcheck.ts'
import { sampleComps, sampleListings } from './sample.ts'

export type ScanResult = {
  /** The cars to show. */
  listings: Listing[]
  /** The pool the estimator compares against. LIVE with LIVE, SAMPLE with SAMPLE, never mixed. */
  comps: Listing[]
  kind: 'LIVE' | 'SAMPLE' | 'EMPTY'
  /** Plain-English problems met on the way (a source that failed, a key that is missing). Never thrown. */
  errors: string[]
}

const EBAY_SETUP =
  'Add GAVEL_EBAY_CLIENT_ID and GAVEL_EBAY_CLIENT_SECRET to the .env file (copy .env.example). ' +
  'Get them free at developer.ebay.com: sign in, open "Application Keys", create a Production keyset and copy the App ID (client ID) and Cert ID (client secret).'

const GSA_SETUP = 'Add GAVEL_GSA_API_KEY (a free key from api.data.gov: fill in the short form and it arrives by email), or set GAVEL_GSA=1 to try it with the shared DEMO_KEY and its low rate limit.'
const MC_SETUP = 'Add GAVEL_MARKETCHECK_API_KEY from your MarketCheck account (marketcheck.com/apis; a paid plan, trial data on request). If your plan uses a different auction path, set GAVEL_MARKETCHECK_AUCTION_PATH.'

/** Every source Gavel knows about, and whether it is connected right now. */
export function sourceStatuses(): SourceStatus[] {
  const out: SourceStatus[] = []
  for (const h of AUCTION_HOUSES) {
    if (h.id === 'ebay') {
      const connected = ebayConfigured()
      out.push({
        id: h.id,
        name: h.name,
        kind: 'api',
        connected,
        reason: connected
          ? 'Connected. Gavel reads eBay Motors live through the official Browse API. It is read-only: bidding happens on eBay, with your number in front of you.'
          : `Not connected. ${EBAY_SETUP}`,
        capabilities: { search: connected, bid: false },
      })
    } else if (h.id === 'gsa') {
      const connected = gsaConfigured()
      out.push({ id: h.id, name: h.name, kind: 'api', connected, reason: connected ? 'Connected. Gavel reads federal surplus vehicles live through the GSA Auctions API. Bidding happens on gsaauctions.gov.' : `Not connected. ${GSA_SETUP}`, capabilities: { search: connected, bid: false } })
    } else if (h.id === 'marketcheck') {
      const connected = marketcheckConfigured()
      out.push({ id: h.id, name: h.name, kind: 'api', connected, reason: connected ? 'Connected. Auction lots come into the feed, and dealer asking prices sharpen every estimate.' : `Not connected. ${MC_SETUP}`, capabilities: { search: connected, bid: false } })
    } else {
      out.push({
        id: h.id,
        name: h.name,
        kind: 'directory',
        connected: false,
        reason: `${h.name} has no public API. Gavel opens its search for you and tells you how to register.`,
        capabilities: { search: false, bid: false },
      })
    }
  }
  return out
}

/** True when at least one source can be read live. */
export function anyLiveSource(): boolean {
  return sourceStatuses().some((s) => s.connected && s.capabilities.search)
}

/** The price you would pay right now: the current bid, else the buy-now price. */
function askingPrice(l: Listing): number | undefined {
  return l.currentBidUsd ?? l.buyNowUsd
}

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

/**
 * Apply the parts of a query a site did not apply for us. eBay already filters
 * by text and price on its side; SAMPLE data has no server, so it gets the
 * whole query. Nothing here invents data: a listing missing the field a
 * filter needs is kept, except for the make filter, which needs a make.
 */
function applyQuery(listings: Listing[], q: SearchQuery, includeText: boolean): Listing[] {
  const words = includeText ? norm(q.text).split(/\s+/).filter(Boolean) : []
  const make = norm(q.make)
  let out = listings.filter((l) => {
    if (make) {
      const hay = `${norm(l.make)} ${norm(l.title)}`
      if (!hay.includes(make)) return false
    }
    if (words.length) {
      const hay = norm(`${l.title} ${l.make ?? ''} ${l.model ?? ''} ${l.trim ?? ''}`)
      if (!words.every((w) => hay.includes(w))) return false
    }
    if (q.minYear !== undefined && l.year !== undefined && l.year < q.minYear) return false
    if (q.maxMileage !== undefined && l.mileage !== undefined && l.mileage > q.maxMileage) return false
    if (q.maxPriceUsd !== undefined) {
      const p = askingPrice(l)
      if (p !== undefined && p > q.maxPriceUsd) return false
    }
    return true
  })
  if (q.limit !== undefined && q.limit > 0) out = out.slice(0, q.limit)
  return out
}

function describeError(source: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return `${source}: ${msg}`
}

const SOURCE_TIMEOUT_MS = 12_000

function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${name} did not answer within ${Math.round(ms / 1000)} seconds.`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/** Drop repeats of the same car across sources: the same VIN keeps the first listing seen. */
export function dedupeByVin(listings: Listing[]): Listing[] {
  const seen = new Set<string>()
  return listings.filter((l) => {
    if (!l.vin) return true
    if (seen.has(l.vin)) return false
    seen.add(l.vin)
    return true
  })
}

/** Dealer comparables for the distinct make and model groups in these listings, up to six groups. */
async function dealerComps(listings: Listing[], fetchImpl: typeof fetch, errors: string[]): Promise<Listing[]> {
  if (!marketcheckConfigured()) return []
  const groups = new Map<string, { make: string; model: string }>()
  for (const l of listings) {
    if (!l.make || !l.model) continue
    const key = `${l.make.toLowerCase()}|${l.model.toLowerCase().split(' ')[0]}`
    if (!groups.has(key)) groups.set(key, { make: l.make, model: l.model })
    if (groups.size >= 6) break
  }
  const out: Listing[] = []
  await Promise.all([...groups.values()].map((g) => withTimeout(marketcheckComps(g.make, g.model, fetchImpl), SOURCE_TIMEOUT_MS, 'MarketCheck').then((c) => { out.push(...c) }).catch((e) => { errors.push(describeError('MarketCheck comparables', e)) })))
  return out
}

/**
 * Read every connected source at once. Failures are collected, not thrown.
 * LIVE listings from the sources, plus MarketCheck dealer prices when
 * connected, are the comparables pool. `extra` is the member's own imported
 * lots: they join the listings (as LIVE) but never the shared comps. With nothing live: SAMPLE data when `allowSample` is on (clearly
 * labelled), otherwise EMPTY with the errors that explain why.
 */
export async function scanAll(q: SearchQuery, opts: { allowSample: boolean; fetchImpl?: typeof fetch; extra?: Listing[] }): Promise<ScanResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const errors: string[] = []
  const live: Listing[] = []

  const jobs: Array<{ name: string; run: () => Promise<Listing[]> }> = []
  if (ebayConfigured()) jobs.push({ name: 'eBay Motors', run: () => searchEbay(q, fetchImpl) })
  else errors.push(`eBay Motors is not connected. ${EBAY_SETUP}`)
  if (gsaConfigured()) jobs.push({ name: 'GSA Auctions', run: async () => applyQuery(await searchGsa(q, fetchImpl), q, true) })
  if (marketcheckConfigured()) jobs.push({ name: 'MarketCheck', run: () => searchMarketcheckAuctions(q, fetchImpl) })
  const results = await Promise.allSettled(jobs.map((j) => withTimeout(j.run(), SOURCE_TIMEOUT_MS, j.name)))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') live.push(...r.value)
    else errors.push(describeError(jobs[i].name, r.reason))
  })

  const extra = applyQuery(opts.extra ?? [], { ...q, limit: undefined }, true)
  const merged = dedupeByVin([...extra, ...live])
  if (merged.length > 0) {
    // Public data only: a member's imports are their own comparables (the server adds them per member), never everyone's.
    const comps = dedupeByVin([...live, ...(await dealerComps(merged, fetchImpl, errors))])
    return { listings: applyQuery(merged, { ...q, text: undefined }, false), comps, kind: 'LIVE', errors }
  }

  if (opts.allowSample) {
    const now = Date.now()
    return { listings: applyQuery(sampleListings(now), q, true), comps: sampleComps(now), kind: 'SAMPLE', errors }
  }

  return { listings: [], comps: [], kind: 'EMPTY', errors }
}

/** A search link for this text on every house in the directory, for the "open their search" buttons. */
export function houseSearchUrls(q: string): Array<{ id: string; name: string; url: string }> {
  const text = q.trim()
  return AUCTION_HOUSES.map((h) => ({ id: h.id, name: h.name, url: h.searchUrl(text) }))
}
