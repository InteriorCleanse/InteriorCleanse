/**
 * `npm run probe` — call every configured live source for real and say what
 * came back: how many rows, which field names the rows carry (so a renamed
 * field shows up at once), how many became Gavel listings, and a few of them.
 *
 * The tests use recorded shapes; this is the check against the real services.
 * It prints field names and listing facts, never a key. It exits 1 when a
 * configured source fails, or answers with rows Gavel cannot read.
 *
 *   GAVEL_GSA=1 npm run probe      # GSA with the shared DEMO_KEY, no signup
 */
import { env, loadEnv } from './env.ts'
import type { Listing } from './types.ts'
import { ebayConfigured, searchEbay } from './sources/ebay.ts'
import { fromGsaRow, gsaConfigured, gsaRows } from './sources/gsa.ts'
import { marketcheckComps, marketcheckConfigured, searchMarketcheckAuctions } from './sources/marketcheck.ts'
import { scanAll } from './sources/registry.ts'
import { money } from './ui.ts'
import { estimateValue } from './valuation.ts'

loadEnv()
let failed = false

function out(line: string): void {
  process.stdout.write(line + '\n')
}

function fail(source: string, why: string): void {
  failed = true
  out(`FAIL  ${source}: ${why}`)
}

function show(listings: Listing[], n = 5): void {
  for (const l of listings.slice(0, n)) {
    const price = l.soldUsd ?? l.currentBidUsd ?? l.buyNowUsd
    out(`      · ${l.title} | ${price !== undefined ? money(price) : 'no price'} | ${[l.year, l.make, l.model].filter(Boolean).join(' ') || 'no year/make/model'} | title ${l.titleStatus} | ${l.mileage !== undefined ? l.mileage.toLocaleString('en-US') + ' mi' : 'miles not stated'} | ${l.location?.state ?? 'no state'} | ${l.endsAt ? 'ends ' + new Date(l.endsAt).toISOString() : 'no end time'} | ${/^https:\/\//.test(l.url) ? 'link ok' : 'no link'}`)
  }
}

/** How many listings have each fact Gavel scores on: a quick read on whether the field mapping holds. */
function coverage(listings: Listing[]): string {
  const n = listings.length || 1
  const pct = (k: number) => `${Math.round((k / n) * 100)}%`
  return [
    `price ${pct(listings.filter((l) => (l.currentBidUsd ?? l.buyNowUsd) !== undefined).length)}`,
    `year ${pct(listings.filter((l) => l.year !== undefined).length)}`,
    `make ${pct(listings.filter((l) => !!l.make).length)}`,
    `end time ${pct(listings.filter((l) => l.endsAt !== undefined).length)}`,
    `state ${pct(listings.filter((l) => !!l.location?.state).length)}`,
  ].join(', ')
}

async function probeGsa(): Promise<void> {
  if (!gsaConfigured()) { out('SKIP  GSA Auctions: not configured (set GAVEL_GSA=1 or GAVEL_GSA_API_KEY).'); return }
  const key = env('GAVEL_GSA_API_KEY') || 'DEMO_KEY'
  let res: Response
  try {
    res = await fetch(`https://api.gsa.gov/assets/gsaauctions/v2/auctions?api_key=${encodeURIComponent(key)}&format=JSON`, { headers: { accept: 'application/json' } })
  } catch (e) { fail('GSA Auctions', `could not connect: ${e instanceof Error ? e.message : String(e)}`); return }
  if (!res.ok) { fail('GSA Auctions', `HTTP ${res.status}${res.status === 429 ? ' (rate limit; add a free key from api.data.gov)' : ''}`); return }
  const body: unknown = await res.json()
  const rows = gsaRows(body)
  const top = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).slice(0, 10).join(', ') : Array.isArray(body) ? '(a bare list)' : typeof body
  out(`OK    GSA Auctions: HTTP 200, top-level keys: ${top}; ${rows.length} rows`)
  if (!rows.length) {
    if (body && typeof body === 'object' && Object.keys(body).length) fail('GSA Auctions', 'the answer has content but no list of lots Gavel recognises; the wrapper may have changed')
    return
  }
  const fields = [...new Set(rows.slice(0, 5).flatMap((r) => Object.keys(r)))].sort()
  out(`      field names: ${fields.join(', ')}`)
  // Read without regard to case, as the adapter does: the published reference and the live API disagree on it.
  const expected = ['SaleNo', 'LotNo', 'ItemName', 'AucEndDt', 'PropertyState', 'ItemDescURL']
  const lower = fields.map((f) => f.toLowerCase())
  const missing = expected.filter((f) => !lower.includes(f.toLowerCase()))
  if (missing.length) fail('GSA Auctions', `expected fields not present: ${missing.join(', ')}`)
  // One row as it arrives, values shortened. Public sale data only: the contracting officer's contact details are left out.
  const PRIVATE = /email|phone|officer|contact/i
  const sample = rows.find((r) => /\b(19|20)\d\d\b/.test(JSON.stringify(r))) ?? rows[0]
  out(`      one row: ${JSON.stringify(Object.fromEntries(Object.entries(sample).filter(([k]) => !PRIVATE.test(k)).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v)?.slice(0, 160)])))}`)
  const now = Date.now()
  const vehicles = rows.map((r) => fromGsaRow(r, now)).filter((l): l is Listing => !!l)
  out(`      ${vehicles.length} of ${rows.length} rows are vehicles Gavel can list; coverage: ${coverage(vehicles)}`)
  if (!vehicles.length) fail('GSA Auctions', 'no row reads as a vehicle; the vehicle test or the field names need a look')
  show(vehicles)
}

async function probeEbay(): Promise<void> {
  if (!ebayConfigured()) { out('SKIP  eBay Motors: not configured (GAVEL_EBAY_CLIENT_ID and GAVEL_EBAY_CLIENT_SECRET).'); return }
  try {
    const listings = await searchEbay({ text: 'toyota', limit: 20 })
    out(`OK    eBay Motors: ${listings.length} listings for "toyota"; coverage: ${coverage(listings)}`)
    if (!listings.length) fail('eBay Motors', 'no listings for a common search; check the keys and the marketplace')
    show(listings)
  } catch (e) { fail('eBay Motors', e instanceof Error ? e.message : String(e)) }
}

async function probeMarketcheck(): Promise<void> {
  if (!marketcheckConfigured()) { out('SKIP  MarketCheck: not configured (GAVEL_MARKETCHECK_API_KEY).'); return }
  try {
    const lots = await searchMarketcheckAuctions({ text: 'Toyota Camry' })
    out(`OK    MarketCheck auctions: ${lots.length} lots for "Toyota Camry"; coverage: ${coverage(lots)}`)
    show(lots)
  } catch (e) { fail('MarketCheck auctions', `${e instanceof Error ? e.message : String(e)} (if the path is wrong for your plan, set GAVEL_MARKETCHECK_AUCTION_PATH)`) }
  try {
    const comps = await marketcheckComps('Toyota', 'Camry')
    out(`OK    MarketCheck dealer comparables: ${comps.length} Toyota Camry asking prices`)
    if (!comps.length) fail('MarketCheck dealer comparables', 'none for a common car')
    show(comps, 2)
  } catch (e) { fail('MarketCheck dealer comparables', e instanceof Error ? e.message : String(e)) }
}

async function probeScan(): Promise<void> {
  const r = await scanAll({ limit: 100 }, { allowSample: false })
  out(`SCAN  everything together: ${r.kind}, ${r.listings.length} listings, ${r.comps.length} comparables${r.errors.length ? `; notes: ${r.errors.map((e) => e.split('.')[0]).join(' | ')}` : ''}`)
  // An estimate needs config.scoring.minComps similar cars; this says how many of the listings get one from the sources connected.
  const priced = r.listings.filter((l) => estimateValue(l, r.comps).ok).length
  out(`      ${priced} of ${r.listings.length} listings have enough comparables for an estimate from these sources alone`)
}

await probeGsa()
await probeEbay()
await probeMarketcheck()
await probeScan()
out(failed ? '\nAt least one source failed. The lines above say which and why.' : '\nEvery configured source answered and Gavel could read it.')
process.exit(failed ? 1 : 0)
