/**
 * Tests for src/sources/ebay.ts on a TEST FIXTURE item summary. The network is
 * replaced with a fake fetch that hands back a token and then a page, so the
 * parser and the request shape are checked without touching eBay.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBrowseUrl, ebayConfigured, fromEbayItem, searchEbay, type EbayItemSummary } from '../src/sources/ebay.ts'

/** TEST FIXTURE — shaped like one eBay Browse API item summary. Not a real listing. */
const FIXTURE: EbayItemSummary = {
  itemId: 'v1|123456789012|0',
  title: '2016 Porsche 911 Carrera S Coupe',
  itemWebUrl: 'https://www.ebay.com/itm/123456789012',
  price: { value: '61500.00', currency: 'USD' },
  currentBidPrice: { value: '48250.00', currency: 'USD' },
  buyingOptions: ['AUCTION', 'FIXED_PRICE'],
  bidCount: 12,
  itemEndDate: '2030-01-02T03:04:05.000Z',
  image: { imageUrl: 'https://img.test/1.jpg' },
  additionalImages: [{ imageUrl: 'https://img.test/2.jpg' }],
  condition: 'Used',
  itemLocation: { city: 'Miami', stateOrProvince: 'FL', country: 'US', postalCode: '33101' },
  seller: { username: 'fixture-seller', feedbackPercentage: '100.0' },
  localizedAspects: [
    { name: 'VIN', value: 'wp0ab2a99gs123456' },
    { name: 'Model Year', value: '2016' },
    { name: 'Make', value: 'Porsche' },
    { name: 'Model', value: '911' },
    { name: 'Trim', value: 'Carrera S' },
    { name: 'Mileage', value: '41,200' },
    { name: 'Title Status', value: 'Clean' },
    { name: 'Vehicle Condition', value: 'Minor scratches' },
    { name: 'Body Type', value: 'Coupe' },
    { name: 'Transmission', value: 'Manual' },
    { name: 'Drive Type', value: 'RWD' },
    { name: 'Fuel Type', value: 'Gasoline' },
    { name: 'Exterior Color', value: 'Black' },
  ],
  shortDescription: 'Runs and drives great. Garage kept.',
}

/** TEST FIXTURE — a bare Buy It Now listing with no aspects. */
const BARE: EbayItemSummary = {
  itemId: 'v1|999|0',
  title: '2019 Toyota Camry SE',
  itemWebUrl: 'https://www.ebay.com/itm/999',
  price: { value: '12400', currency: 'USD' },
  buyingOptions: ['FIXED_PRICE'],
}

test('fromEbayItem maps a full item summary onto a LIVE Listing', () => {
  const now = 1_700_000_000_000
  const l = fromEbayItem(FIXTURE, now)
  assert.equal(l.id, 'ebay:v1|123456789012|0')
  assert.equal(l.source, 'ebay')
  assert.equal(l.externalId, 'v1|123456789012|0')
  assert.equal(l.url, 'https://www.ebay.com/itm/123456789012')
  assert.equal(l.kind, 'LIVE')
  assert.equal(l.fetchedAt, now)
  assert.equal(l.year, 2016)
  assert.equal(l.make, 'Porsche')
  assert.equal(l.model, '911')
  assert.equal(l.trim, 'Carrera S')
  assert.equal(l.vin, 'WP0AB2A99GS123456', 'VIN is upper-cased')
  assert.equal(l.mileage, 41_200)
  assert.equal(l.titleStatus, 'clean')
  assert.equal(l.damage, 'minor')
  assert.equal(l.runsAndDrives, true)
  assert.equal(l.bodyStyle, 'Coupe')
  assert.equal(l.transmission, 'Manual')
  assert.equal(l.drivetrain, 'RWD')
  assert.equal(l.fuel, 'Gasoline')
  assert.equal(l.exteriorColor, 'Black')
  assert.deepEqual(l.location, { city: 'Miami', state: 'FL', country: 'US', postalCode: '33101' })
  assert.equal(l.saleType, 'auction-or-buy-now')
  assert.equal(l.currentBidUsd, 48_250)
  assert.equal(l.buyNowUsd, 61_500)
  assert.equal(l.endsAt, Date.parse('2030-01-02T03:04:05.000Z'))
  assert.equal(l.bidCount, 12)
  assert.deepEqual(l.photos, ['https://img.test/1.jpg', 'https://img.test/2.jpg'])
  assert.equal(l.description, 'Runs and drives great. Garage kept.')
})

test('fromEbayItem leaves blanks blank on a bare listing', () => {
  const l = fromEbayItem(BARE)
  assert.equal(l.year, 2019, 'year falls back to the title')
  assert.equal(l.make, 'Toyota')
  assert.equal(l.model, 'Camry SE')
  assert.equal(l.vin, undefined)
  assert.equal(l.mileage, undefined)
  assert.equal(l.titleStatus, 'unknown')
  assert.equal(l.damage, 'unknown')
  assert.equal(l.runsAndDrives, undefined)
  assert.equal(l.saleType, 'buy-now')
  assert.equal(l.currentBidUsd, undefined)
  assert.equal(l.buyNowUsd, 12_400)
  assert.equal(l.endsAt, undefined)
  assert.equal(l.location, undefined)
  assert.deepEqual(l.photos, [])
})

test('buildBrowseUrl asks eBay for US cars with the query, price cap and limit', () => {
  const u = new URL(buildBrowseUrl({ text: 'porsche 911', maxPriceUsd: 60_000, limit: 25 }))
  assert.equal(u.origin, 'https://api.ebay.com')
  assert.equal(u.pathname, '/buy/browse/v1/item_summary/search')
  assert.equal(u.searchParams.get('category_ids'), '6001')
  assert.equal(u.searchParams.get('q'), 'porsche 911')
  assert.equal(u.searchParams.get('limit'), '25')
  assert.equal(u.searchParams.get('fieldgroups'), 'EXTENDED')
  assert.equal(u.searchParams.get('sort'), 'endingSoonest')
  const filter = u.searchParams.get('filter') ?? ''
  assert.match(filter, /buyingOptions:\{AUCTION\|FIXED_PRICE\}/)
  assert.match(filter, /itemLocationCountry:US/)
  assert.match(filter, /price:\[\.\.60000\]/)
  assert.match(filter, /priceCurrency:USD/)

  const bare = new URL(buildBrowseUrl({}))
  assert.equal(bare.searchParams.get('q'), 'car', 'no text and no make falls back to "car"')
  assert.equal(bare.searchParams.get('limit'), '50')
  assert.doesNotMatch(bare.searchParams.get('filter') ?? '', /price:/)

  const make = new URL(buildBrowseUrl({ make: 'Lexus', limit: 999 }))
  assert.equal(make.searchParams.get('q'), 'Lexus')
  assert.equal(make.searchParams.get('limit'), '200', 'eBay caps the page at 200')
})

test('searchEbay returns [] and never calls fetch when no keys are set', async () => {
  process.env.GAVEL_EBAY_CLIENT_ID = ''
  process.env.GAVEL_EBAY_CLIENT_SECRET = ''
  assert.equal(ebayConfigured(), false)
  let calls = 0
  const fake: typeof fetch = async () => {
    calls += 1
    throw new Error('must not be called')
  }
  assert.deepEqual(await searchEbay({ text: 'anything' }, fake), [])
  assert.equal(calls, 0)
})

test('searchEbay gets a token, then a page, and maps the items', async () => {
  process.env.GAVEL_EBAY_CLIENT_ID = 'test-client-id'
  process.env.GAVEL_EBAY_CLIENT_SECRET = 'test-client-secret'
  assert.equal(ebayConfigured(), true)

  const calls: string[] = []
  const fake: typeof fetch = async (input, init) => {
    const url = String(input)
    calls.push(url)
    const headers = (init?.headers ?? {}) as Record<string, string>
    if (url.startsWith('https://api.ebay.com/identity/v1/oauth2/token')) {
      assert.equal(init?.method, 'POST')
      assert.match(headers.authorization ?? '', /^Basic /)
      assert.match(String(init?.body), /grant_type=client_credentials/)
      return new Response(JSON.stringify({ access_token: 'tok_test', expires_in: 7200 }), { status: 200 })
    }
    if (url.startsWith('https://api.ebay.com/buy/browse/v1/item_summary/search')) {
      assert.equal(headers.authorization, 'Bearer tok_test')
      assert.equal(headers['x-ebay-c-marketplace-id'], 'EBAY_US')
      return new Response(JSON.stringify({ itemSummaries: [FIXTURE, BARE] }), { status: 200 })
    }
    throw new Error(`unexpected url ${url}`)
  }

  const listings = await searchEbay({ text: 'porsche 911', maxPriceUsd: 70_000 }, fake)
  assert.equal(listings.length, 2)
  assert.equal(listings[0].id, 'ebay:v1|123456789012|0')
  assert.equal(listings[1].id, 'ebay:v1|999|0')
  assert.ok(listings.every((l) => l.kind === 'LIVE'))
  assert.ok(calls.some((u) => u.includes('/oauth2/token')), 'asked for a token')
  assert.ok(calls.some((u) => u.includes('/item_summary/search')), 'asked for a page')
})

test('searchEbay throws a plain error when eBay answers with an HTTP error', async () => {
  process.env.GAVEL_EBAY_CLIENT_ID = 'test-client-id'
  process.env.GAVEL_EBAY_CLIENT_SECRET = 'test-client-secret'
  const fake: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok_test', expires_in: 7200 }), { status: 200 })
    return new Response('nope', { status: 500 })
  }
  await assert.rejects(searchEbay({ text: 'x' }, fake), /HTTP 500/)
})
