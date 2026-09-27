/**
 * The source registry — the one place that knows which auction sites Gavel
 * can read live, which it can only point you at, and how to scan them all.
 *
 * Today exactly one source has an official API: eBay Motors (read-only). Every
 * other house in the directory is listed so the app can say honestly "no public
 * API — here is their search page and how to register". `scanAll()` reads what
 * is connected, never throws (problems come back as plain-English strings), and
 * labels the result LIVE, SAMPLE or EMPTY so the feed can never pass a sample
 * car off as a real one.
 */
import type { Listing, SearchQuery, SourceStatus } from '../types.ts'
import { AUCTION_HOUSES } from './directory.ts'
import { ebayConfigured, searchEbay } from './ebay.ts'
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

/**
 * Read every connected source. Failures are collected, not thrown. LIVE
 * listings are their own comparables pool. With nothing live: SAMPLE data when
 * `allowSample` is on (clearly labelled), otherwise EMPTY with the errors that
 * explain why, so the feed can say exactly how to connect a source.
 */
export async function scanAll(q: SearchQuery, opts: { allowSample: boolean; fetchImpl?: typeof fetch }): Promise<ScanResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const errors: string[] = []
  const live: Listing[] = []

  if (ebayConfigured()) {
    try {
      live.push(...(await searchEbay(q, fetchImpl)))
    } catch (err) {
      errors.push(describeError('eBay Motors', err))
    }
  } else {
    errors.push(`eBay Motors is not connected. ${EBAY_SETUP}`)
  }

  if (live.length > 0) {
    return { listings: applyQuery(live, q, false), comps: live, kind: 'LIVE', errors }
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
