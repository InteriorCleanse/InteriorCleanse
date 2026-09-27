/**
 * Tests for src/sources/registry.ts — EMPTY vs SAMPLE vs LIVE. The eBay keys
 * are set and cleared in-process and the network is a fake fetch, so the
 * three outcomes are exercised offline.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anyLiveSource, houseSearchUrls, scanAll, sourceStatuses } from '../src/sources/registry.ts'
import { AUCTION_HOUSES } from '../src/sources/directory.ts'
import type { EbayItemSummary } from '../src/sources/ebay.ts'

/** TEST FIXTURE — one eBay item summary. Not a real listing. */
const ITEM: EbayItemSummary = {
  itemId: 'v1|555|0',
  title: '2017 Lexus GX 460 Premium',
  itemWebUrl: 'https://www.ebay.com/itm/555',
  currentBidPrice: { value: '21800', currency: 'USD' },
  buyingOptions: ['AUCTION'],
  bidCount: 4,
  itemEndDate: '2030-06-01T00:00:00.000Z',
  localizedAspects: [
    { name: 'Make', value: 'Lexus' },
    { name: 'Model', value: 'GX' },
    { name: 'Model Year', value: '2017' },
    { name: 'Mileage', value: '78,900' },
    { name: 'Title Status', value: 'Clean' },
  ],
}

function disconnectEbay(): void {
  process.env.GAVEL_EBAY_CLIENT_ID = ''
  process.env.GAVEL_EBAY_CLIENT_SECRET = ''
}

function connectEbay(): void {
  process.env.GAVEL_EBAY_CLIENT_ID = 'test-client-id'
  process.env.GAVEL_EBAY_CLIENT_SECRET = 'test-client-secret'
}

const liveFetch: typeof fetch = async (input) => {
  const url = String(input)
  if (url.includes('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok_test', expires_in: 7200 }), { status: 200 })
  if (url.includes('/item_summary/search')) return new Response(JSON.stringify({ itemSummaries: [ITEM] }), { status: 200 })
  throw new Error(`unexpected url ${url}`)
}

const deadFetch: typeof fetch = async () => {
  throw new Error('network down')
}

test('sourceStatuses lists eBay as the API source and every other house as directory-only', () => {
  disconnectEbay()
  const statuses = sourceStatuses()
  assert.equal(statuses.length, AUCTION_HOUSES.length)
  const ebay = statuses.find((s) => s.id === 'ebay')
  assert.ok(ebay)
  assert.equal(ebay.kind, 'api')
  assert.equal(ebay.connected, false)
  assert.match(ebay.reason, /GAVEL_EBAY_CLIENT_ID/)
  assert.match(ebay.reason, /GAVEL_EBAY_CLIENT_SECRET/)
  assert.match(ebay.reason, /developer\.ebay\.com/)
  assert.deepEqual(ebay.capabilities, { search: false, bid: false })
  for (const s of statuses.filter((x) => x.id !== 'ebay')) {
    assert.equal(s.kind, 'directory')
    assert.equal(s.connected, false)
    assert.deepEqual(s.capabilities, { search: false, bid: false })
    assert.equal(s.reason, `${s.name} has no public API. Gavel opens its search for you and tells you how to register.`)
  }
  assert.equal(anyLiveSource(), false)

  connectEbay()
  const on = sourceStatuses().find((s) => s.id === 'ebay')!
  assert.equal(on.connected, true)
  assert.deepEqual(on.capabilities, { search: true, bid: false }, 'never claims a bidding API')
  assert.equal(anyLiveSource(), true)
})

test('EMPTY: nothing connected and samples off', async () => {
  disconnectEbay()
  const r = await scanAll({}, { allowSample: false, fetchImpl: deadFetch })
  assert.equal(r.kind, 'EMPTY')
  assert.deepEqual(r.listings, [])
  assert.deepEqual(r.comps, [])
  assert.equal(r.errors.length, 1)
  assert.match(r.errors[0], /GAVEL_EBAY_CLIENT_ID/, 'says exactly how to connect a source')
})

test('SAMPLE: nothing connected and samples on, every card labelled and the query applied', async () => {
  disconnectEbay()
  const r = await scanAll({}, { allowSample: true, fetchImpl: deadFetch })
  assert.equal(r.kind, 'SAMPLE')
  assert.ok(r.listings.length > 0)
  assert.ok(r.listings.every((l) => l.kind === 'SAMPLE' && l.vin?.startsWith('SAMPLE') && l.url === '#sample'))
  assert.ok(r.comps.length > 0)
  assert.ok(r.comps.every((l) => l.kind === 'SAMPLE'))

  const porsche = await scanAll({ make: 'Porsche' }, { allowSample: true, fetchImpl: deadFetch })
  assert.ok(porsche.listings.length > 0)
  assert.ok(porsche.listings.every((l) => l.make === 'Porsche'))

  const cheap = await scanAll({ maxPriceUsd: 15_000, limit: 3 }, { allowSample: true, fetchImpl: deadFetch })
  assert.ok(cheap.listings.length > 0 && cheap.listings.length <= 3)
  assert.ok(cheap.listings.every((l) => (l.currentBidUsd ?? l.buyNowUsd ?? 0) <= 15_000))

  const text = await scanAll({ text: 'corvette' }, { allowSample: true, fetchImpl: deadFetch })
  assert.ok(text.listings.length > 0)
  assert.ok(text.listings.every((l) => /corvette/i.test(l.title)))
})

test('LIVE: a connected source returns listings that are their own comp pool', async () => {
  connectEbay()
  const r = await scanAll({ text: 'lexus gx' }, { allowSample: true, fetchImpl: liveFetch })
  assert.equal(r.kind, 'LIVE')
  assert.equal(r.listings.length, 1)
  assert.equal(r.listings[0].id, 'ebay:v1|555|0')
  assert.equal(r.listings[0].kind, 'LIVE')
  assert.deepEqual(r.comps, r.listings, 'LIVE is compared only with LIVE')
  assert.deepEqual(r.errors, [])
})

test('LIVE source failure is reported as text and falls back to SAMPLE or EMPTY', async () => {
  connectEbay()
  const withSample = await scanAll({}, { allowSample: true, fetchImpl: deadFetch })
  assert.equal(withSample.kind, 'SAMPLE')
  assert.equal(withSample.errors.length, 1)
  assert.match(withSample.errors[0], /^eBay Motors: /)
  assert.match(withSample.errors[0], /network down/)

  const without = await scanAll({}, { allowSample: false, fetchImpl: deadFetch })
  assert.equal(without.kind, 'EMPTY')
  assert.deepEqual(without.listings, [])
  assert.match(without.errors[0], /network down/)
})

test('houseSearchUrls gives one search link per house with the text encoded', () => {
  const urls = houseSearchUrls('Porsche 911')
  assert.equal(urls.length, AUCTION_HOUSES.length)
  const ebay = urls.find((u) => u.id === 'ebay')!
  assert.match(ebay.url, /^https:\/\/www\.ebay\.com\//)
  assert.match(ebay.url, /Porsche%20911/)
  assert.ok(urls.every((u) => u.name && /^https:\/\//.test(u.url)))
})
