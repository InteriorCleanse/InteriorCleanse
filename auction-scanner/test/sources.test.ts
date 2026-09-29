/** GSA and MarketCheck adapters on TEST FIXTURE responses shaped like the published APIs; registry merging. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromGsaRow, gsaRows, searchGsa, resetGsaCache } from '../src/sources/gsa.ts'
import { fromMarketcheckRow, makeModelFromText, marketcheckComps, searchMarketcheckAuctions, resetMarketcheckCache } from '../src/sources/marketcheck.ts'
import { dedupeByVin, scanAll, sourceStatuses } from '../src/sources/registry.ts'
import type { Listing } from '../src/types.ts'

const NOW = Date.UTC(2026, 8, 28, 12)
const GSA_CAR = { SaleNo: '41QSCI26101', LotNo: '12', AucStartDt: '09/20/2026 08:00:00', AucEndDt: '10/02/2026 15:00:00', ItemName: '2017 FORD EXPLORER 4WD', LotDescript: 'TEST FIXTURE. VIN 1FM5K8B85HGA00000. Odometer: 84,212 miles. Vehicle starts and runs. SF-97 will be issued.', PropertyCity: 'Denver', PropertyState: 'co', PropertyZip: '80225', HighBidAmount: '6250.00', BiddersCount: 7, ItemDescURL: 'https://www.gsaauctions.gov/auctions/preview/12345', ImageURL: 'https://www.gsaauctions.gov/img/12345.jpg' }
const GSA_DESK = { SaleNo: '41QSCI26101', LotNo: '13', ItemName: 'OFFICE DESKS (QTY 12)', LotDescript: 'TEST FIXTURE furniture' }

test('GSA: a vehicle lot maps field by field; furniture is dropped', () => {
  const l = fromGsaRow(GSA_CAR, NOW)!
  assert.equal(l.id, 'gsa:41QSCI26101-12')
  assert.equal(l.year, 2017)
  assert.equal(l.make, 'Ford')
  assert.equal(l.vin, '1FM5K8B85HGA00000')
  assert.equal(l.mileage, 84212)
  assert.equal(l.titleStatus, 'clean', 'an SF-97 in the text means a clean title can be issued')
  assert.equal(l.runsAndDrives, true)
  assert.equal(l.currentBidUsd, 6250)
  assert.equal(l.location?.state, 'CO')
  assert.equal(l.bidCount, 7)
  assert.equal(l.sellerType, 'fleet')
  assert.equal(l.kind, 'LIVE')
  assert.equal(l.origin, 'api')
  assert.ok(l.endsAt && l.endsAt > NOW)
  assert.equal(fromGsaRow(GSA_DESK, NOW), undefined)
  const noTitle = fromGsaRow({ ...GSA_CAR, LotDescript: 'TEST FIXTURE. Inoperable.' }, NOW)!
  assert.equal(noTitle.titleStatus, 'unknown', 'no SF-97 in the text: the title is not stated')
  assert.equal(noTitle.runsAndDrives, false)
})

test('GSA: rows are found under any wrapper; the fetch uses the key and caches', async () => {
  assert.equal(gsaRows({ Results: [GSA_CAR] }).length, 1)
  assert.equal(gsaRows([GSA_CAR]).length, 1)
  assert.equal(gsaRows({ nothing: 1 }).length, 0)
  process.env.GAVEL_GSA_API_KEY = 'TESTFIXTUREKEY'
  resetGsaCache()
  const urls: string[] = []
  const fake: typeof fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify({ Results: [GSA_CAR, GSA_DESK] }), { status: 200 }) }
  const a = await searchGsa({}, fake, NOW)
  const b = await searchGsa({}, fake, NOW + 1000)
  assert.equal(a.length, 1)
  assert.equal(b.length, 1)
  assert.equal(urls.length, 1, 'cached for fifteen minutes')
  assert.match(urls[0], /api\.gsa\.gov\/assets\/gsaauctions\/v2\/auctions\?api_key=TESTFIXTUREKEY&format=JSON/)
  resetGsaCache()
  await assert.rejects(searchGsa({}, async () => new Response('', { status: 429 }), NOW), /api\.data\.gov/)
  delete process.env.GAVEL_GSA_API_KEY
  resetGsaCache()
})

const MC_DEALER = { id: 'TESTFIXTURE-1', vin: '4T1B11HK5KU000000', heading: '2019 Toyota Camry SE', price: 18990, miles: 41210, vdp_url: 'https://dealer.example.com/camry', carfax_clean_title: true, build: { year: 2019, make: 'Toyota', model: 'Camry', trim: 'SE', body_type: 'Sedan' }, dealer: { city: 'Austin', state: 'TX', zip: '78701' }, media: { photo_links: ['https://img.example.com/1.jpg', 'javascript:alert(1)'] } }
const MC_AUCTION = { id: 'TESTFIXTURE-A', heading: '2018 Honda Civic Si', current_bid: 9100, miles: 52000, vdp_url: 'https://auction.example.com/lot/9', title_status: 'Clean', primary_damage: 'Minor dent/scratches', run_and_drive: true, auction_end_date: '2026-10-01T18:00:00Z', build: { year: 2018, make: 'Honda', model: 'Civic' } }

test('MarketCheck: dealer rows are buy-now comparables; auction rows are auction lots', () => {
  const d = fromMarketcheckRow(MC_DEALER, 'dealer', NOW)!
  assert.equal(d.saleType, 'buy-now')
  assert.equal(d.buyNowUsd, 18990)
  assert.equal(d.currentBidUsd, undefined)
  assert.equal(d.titleStatus, 'clean')
  assert.equal(d.location?.state, 'TX')
  assert.deepEqual(d.photos, ['https://img.example.com/1.jpg'], 'only http(s) photos')
  const a = fromMarketcheckRow(MC_AUCTION, 'auction', NOW)!
  assert.equal(a.saleType, 'auction')
  assert.equal(a.currentBidUsd, 9100)
  assert.equal(a.titleStatus, 'clean')
  assert.equal(a.damage, 'minor')
  assert.equal(a.runsAndDrives, true)
  assert.equal(a.endsAt, Date.parse('2026-10-01T18:00:00Z'))
  assert.equal(fromMarketcheckRow({ id: '' }, 'dealer', NOW), undefined)
})

test('MarketCheck: text splits into a known make and a model; requests carry the key and parameters', async () => {
  assert.deepEqual(makeModelFromText('porsche 911 carrera'), { make: 'Porsche', model: '911 carrera' })
  assert.deepEqual(makeModelFromText('land rover defender'), { make: 'Land Rover', model: 'defender' })
  assert.deepEqual(makeModelFromText('something else'), {})
  process.env.GAVEL_MARKETCHECK_API_KEY = 'TESTFIXTUREKEY'
  resetMarketcheckCache()
  const urls: string[] = []
  const fake: typeof fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify({ num_found: 2, listings: String(u).includes('auction') ? [MC_AUCTION] : [MC_DEALER] }), { status: 200 }) }
  const lots = await searchMarketcheckAuctions({ text: 'honda civic' }, fake, NOW)
  assert.equal(lots.length, 1)
  assert.match(urls[0], /api\.marketcheck\.com\/v2\/search\/car\/auction\/active\?api_key=TESTFIXTUREKEY&make=Honda&model=civic&rows=50&start=0/)
  const comps = await marketcheckComps('Toyota', 'Camry SE', fake, NOW)
  await marketcheckComps('toyota', 'camry', fake, NOW)
  assert.equal(comps.length, 1)
  assert.equal(urls.filter((u) => u.includes('search/car/active')).length, 1, 'comparables are cached per make and model')
  process.env.GAVEL_MARKETCHECK_AUCTION_PATH = '/custom/auction/path'
  await searchMarketcheckAuctions({ text: 'honda civic' }, fake, NOW)
  assert.match(urls[urls.length - 1], /v2\/custom\/auction\/path\?/)
  await assert.rejects(searchMarketcheckAuctions({}, async () => new Response('', { status: 404 }), NOW), /GAVEL_MARKETCHECK_AUCTION_PATH/)
  delete process.env.GAVEL_MARKETCHECK_AUCTION_PATH
  delete process.env.GAVEL_MARKETCHECK_API_KEY
  resetMarketcheckCache()
})

test('registry: every connected source is read at once, duplicates by VIN dropped, dealer prices join the comparables', async () => {
  process.env.GAVEL_GSA_API_KEY = 'TESTFIXTUREKEY'
  process.env.GAVEL_MARKETCHECK_API_KEY = 'TESTFIXTUREKEY'
  resetGsaCache(); resetMarketcheckCache()
  const st = sourceStatuses()
  assert.equal(st.find((s) => s.id === 'gsa')?.connected, true)
  assert.equal(st.find((s) => s.id === 'marketcheck')?.connected, true)
  const dupe = { ...MC_AUCTION, id: 'TESTFIXTURE-DUPE', vin: '1FM5K8B85HGA00000', heading: '2017 Ford Explorer', build: { year: 2017, make: 'Ford', model: 'Explorer' } }
  const fake: typeof fetch = async (u) => {
    const s = String(u)
    if (s.includes('gsa.gov')) return new Response(JSON.stringify({ Results: [GSA_CAR] }), { status: 200 })
    if (s.includes('auction')) return new Response(JSON.stringify({ listings: [MC_AUCTION, dupe] }), { status: 200 })
    return new Response(JSON.stringify({ listings: [MC_DEALER] }), { status: 200 })
  }
  const r = await scanAll({}, { allowSample: true, fetchImpl: fake })
  assert.equal(r.kind, 'LIVE')
  const vins = r.listings.map((l) => l.vin).filter(Boolean)
  assert.equal(new Set(vins).size, vins.length, 'no VIN twice')
  assert.ok(r.listings.some((l) => l.source === 'gsa'))
  assert.ok(r.listings.some((l) => l.source === 'marketcheck'))
  assert.ok(r.comps.some((l) => l.sellerType === 'dealer'), 'dealer comparables are in the pool')
  assert.ok(!r.listings.some((l) => l.sellerType === 'dealer'), 'but never in the feed')
  assert.ok(r.errors.some((e) => /eBay Motors is not connected/.test(e)))
  const slow: typeof fetch = (u) => (String(u).includes('gsa.gov') ? Promise.reject(new Error('TEST FIXTURE: GSA down')) : fake(u))
  resetGsaCache()
  const partial = await scanAll({}, { allowSample: false, fetchImpl: slow })
  assert.equal(partial.kind, 'LIVE', 'one source failing does not stop the others')
  assert.ok(partial.errors.some((e) => /^GSA Auctions: /.test(e)))
  delete process.env.GAVEL_GSA_API_KEY
  delete process.env.GAVEL_MARKETCHECK_API_KEY
  resetGsaCache(); resetMarketcheckCache()
})

test('registry: imports alone make the feed LIVE, and the query filters them', async () => {
  const imp: Listing = { id: 'import:copart:12345678', source: 'copart', externalId: '12345678', url: '#imported', title: '2016 Lexus GX 460', year: 2016, make: 'Lexus', model: 'GX 460', titleStatus: 'clean', damage: 'minor', saleType: 'auction', currentBidUsd: 14000, photos: [], kind: 'LIVE', origin: 'import', fetchedAt: NOW }
  const r = await scanAll({}, { allowSample: true, extra: [imp] })
  assert.equal(r.kind, 'LIVE')
  assert.equal(r.listings.length, 1)
  const miss = await scanAll({ text: 'corvette' }, { allowSample: false, extra: [imp] })
  assert.equal(miss.kind, 'EMPTY')
  assert.deepEqual(dedupeByVin([{ ...imp, vin: 'A' }, { ...imp, id: 'x', vin: 'A' }, { ...imp, id: 'y' }]).map((l) => l.id), [imp.id, 'y'])
})

test('GSA in the live shape: camelCase fields under Results, the lot text in lotInfo', () => {
  // TEST FIXTURE in the field names the live API sent to the probe on GitHub. Values are made up.
  const body = {
    Results: [
      { saleNo: 'TF1QSC26001', lotNo: '101', itemName: '2019 FORD F-150 XL 4X4', aucEndDt: '2030-10-02', propertyCity: 'Denver', propertyState: 'co', highBidAmount: 12500, biddersCount: 7, itemDescURL: 'https://www.gsaauctions.gov/auctions/preview/TF', imageURL: 'https://www.gsaauctions.gov/tf.jpg', lotInfo: '<p><strong style="background-color: yellow;">Odometer&nbsp;61,204 miles.</strong></p><p>Starts and runs. SF-97 provided.</p>', coEmail: 'not-read@example.com' },
      { saleNo: 'TF1QSC26001', lotNo: '103', itemName: '1983 Beechcraft T-34C aircraft', aucEndDt: '2030-10-02', highBidAmount: '105100' },
      { saleNo: 'TF1QSC26001', lotNo: '104', itemName: '2014 John Deere XUV Gator utility vehicle', aucEndDt: '2030-10-02' },
      { saleNo: 'TF1QSC26001', lotNo: '105', itemName: '2014 Chevy Impala Sedan', aucEndDt: '2030-10-02', lotInfo: 'Odometer 50,258. SF-97.' },
      { saleNo: 'TF1QSC26001', lotNo: '102', itemName: 'OFFICE CHAIRS, QTY 40', aucEndDt: '2030-10-02T18:00:00', lotInfo: 'Assorted chairs.' },
    ],
  }
  const rows = gsaRows(body)
  assert.equal(rows.length, 5)
  const lot = (n: string) => rows.find((r) => r.lotNo === n)!
  const l = fromGsaRow(lot('101'), Date.UTC(2030, 0, 1))!
  assert.ok(l, 'the truck is read')
  assert.equal(l.id, 'gsa:TF1QSC26001-101')
  assert.equal(l.year, 2019)
  assert.equal(l.make, 'Ford')
  assert.equal(l.currentBidUsd, 12_500)
  assert.equal(l.bidCount, 7)
  assert.equal(l.mileage, 61_204)
  assert.equal(l.runsAndDrives, true)
  assert.equal(l.titleStatus, 'clean', 'SF-97 in the lot text is the title document')
  assert.equal(l.location?.state, 'CO')
  assert.equal(l.endsAtDateOnly, true, 'GSA sends a closing date without a time')
  assert.ok(l.endsAt! > Date.UTC(2030, 9, 2, 12) && l.endsAt! < Date.UTC(2030, 9, 3, 12), 'counted to the end of that day, US Eastern')
  assert.ok(!/[<>]|&nbsp;/.test(l.description ?? ''), 'the HTML is stripped: ' + l.description)
  assert.equal(l.url, 'https://www.gsaauctions.gov/auctions/preview/TF')
  assert.ok(!JSON.stringify(l).includes('not-read@example.com'), 'contact details never enter a listing')
  assert.equal(fromGsaRow(lot('102')), undefined, 'chairs are not a car')
  assert.equal(fromGsaRow(lot('103')), undefined, 'an aircraft has a year and a maker but is not a car')
  assert.equal(fromGsaRow(lot('104')), undefined, 'a farm utility vehicle is not a car')
  assert.equal(fromGsaRow(lot('105'))!.make, 'Chevrolet', 'a Chevy compares with every other Chevrolet')
})
