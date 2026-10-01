/** The importer reads what the member hands it and guesses nothing. TEST FIXTURE pages only. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { houseFromUrl, importFieldsOf, listingFromImport, parseCsvImport, parseLotText, readCsv } from '../src/sources/importer.ts'
import { listImports, removeImport, saveImports } from '../src/imports.ts'
import { withUser } from '../src/store.ts'

const COPART_STYLE = `TEST FIXTURE
2016 LEXUS GX 460
Lot #
41234567
VIN:
JTJBM7FX5G5000000
Title Code:
TX - CERT OF TITLE-CLEAN
Odometer:
78,512 mi (ACTUAL)
Primary Damage:
MINOR DENT/SCRATCHES
Highlights:
Run and Drive
Keys:
YES
Current Bid:
$14,250 USD
Buy It Now
$19,000 USD
Sale Date:
Tue. Oct 06, 2026 10:00 AM CDT
Location:
DALLAS SOUTH, TX`

const IAA_STYLE = `TEST FIXTURE
2019 Toyota Tacoma TRD Off-Road
Stock #: 38123456
VIN (Status): 3TMCZ5AN5KM000000
Title/Sale Doc: SALVAGE CERTIFICATE (TX)
Odometer: 61,004 mi
Primary Damage: Front End
Start Code: Run & Drive
Key: Present
Current Bid: $17,500
Auction Date: Oct 8, 2026`

test('houseFromUrl knows the big auctions', () => {
  assert.equal(houseFromUrl('https://www.copart.com/lot/41234567'), 'copart')
  assert.equal(houseFromUrl('https://www.iaai.com/VehicleDetail/38123456'), 'iaa')
  assert.equal(houseFromUrl('https://bringatrailer.com/listing/x/'), 'bat')
  assert.equal(houseFromUrl('https://carsandbids.com/auctions/x'), 'carsandbids')
  assert.equal(houseFromUrl('https://example.com'), 'other')
  assert.equal(houseFromUrl('not a url'), 'other')
})

test('a Copart-style page: every labelled fact found', () => {
  const r = parseLotText(COPART_STYLE, 'https://www.copart.com/lot/41234567')
  const f = r.fields
  assert.equal(f.source, 'copart')
  assert.equal(f.title, '2016 LEXUS GX 460')
  assert.equal(f.year, 2016)
  assert.equal(f.vin, 'JTJBM7FX5G5000000')
  assert.equal(f.titleStatus, 'clean')
  assert.equal(f.mileage, 78512)
  assert.equal(f.damage, 'minor')
  assert.equal(f.runsAndDrives, true)
  assert.equal(f.hasKeys, true)
  assert.equal(f.currentBidUsd, 14250)
  assert.equal(f.buyNowUsd, 19000)
  assert.equal(f.lotNumber, '41234567')
  assert.equal(f.state, 'TX')
  assert.ok(f.endsAt && new Date(f.endsAt).getUTCFullYear() === 2026)
  assert.deepEqual(r.missing, [])
})

test('an IAA-style page: salvage and front-end damage are read as such', () => {
  const f = parseLotText(IAA_STYLE, 'https://www.iaai.com/VehicleDetail/38123456').fields
  assert.equal(f.source, 'iaa')
  assert.equal(f.titleStatus, 'salvage')
  assert.equal(f.damage, 'moderate')
  assert.equal(f.runsAndDrives, true)
  assert.equal(f.hasKeys, true)
  assert.equal(f.lotNumber, '38123456')
  assert.equal(f.currentBidUsd, 17500)
})

test('a page with nothing labelled finds nothing and says so', () => {
  const r = parseLotText('TEST FIXTURE just some words about a nice car', undefined)
  assert.equal(r.fields.title, undefined)
  assert.equal(r.fields.currentBidUsd, undefined)
  assert.ok(r.missing.includes('title') && r.missing.includes('vin') && r.missing.includes('currentBidUsd'))
})

test('CSV: quoted cells, known columns used and named, rows without a name skipped', () => {
  assert.deepEqual(readCsv('a,"b, c","d ""q"""\n1,2,3'), [['a', 'b, c', 'd "q"'], ['1', '2', '3']])
  const csv = 'Lot number,Year,Make,Model Group,VIN,Odometer,Damage Description,Sale Title Type,High Bid,Location state,Unrelated\n' +
    '41234567,2016,LEXUS,GX 460,JTJBM7FX5G5000000,78512,MINOR DENT/SCRATCHES,CERT OF TITLE-CLEAN,14250,TX,x\n' +
    ',,,,,,,,,,only junk\n' +
    '41234568,2019,TOYOTA,TACOMA,,61004,FRONT END,SALVAGE CERTIFICATE,17500,tx,y'
  const r = parseCsvImport(csv, 'copart')
  assert.equal(r.rows.length, 2)
  assert.equal(r.rows[0].title, '2016 LEXUS GX 460')
  assert.equal(r.rows[0].titleStatus, 'clean')
  assert.equal(r.rows[1].titleStatus, 'salvage')
  assert.equal(r.rows[1].state, 'TX')
  assert.equal(r.rows[0].source, 'copart')
  assert.equal(r.used.vin, 'VIN')
  assert.equal(r.used.model, 'Model Group')
  assert.ok(!('Unrelated' in Object.values(r.used)))
})

test('listingFromImport keeps the catalog spelling of a shouted make', () => {
  const l = listingFromImport({ title: '2019 PORSCHE 911 CARRERA S', make: 'PORSCHE', source: 'copart', lotNumber: '1' })
  assert.equal(l.make, 'Porsche')
  const fromTitle = listingFromImport({ title: '2018 LEXUS GX 460', source: 'iaa', lotNumber: '2' })
  assert.equal(fromTitle.make, 'Lexus')
  const unknown = listingFromImport({ title: '2001 ZASTAVA KORAL', make: 'ZASTAVA', source: 'other', lotNumber: '3' })
  assert.equal(unknown.make, 'ZASTAVA', 'a make the catalog does not know is left as written')
})

test('listingFromImport validates and never invents', () => {
  assert.throws(() => listingFromImport({}), /name/)
  assert.throws(() => listingFromImport({ title: 'x', vin: 'BAD' }), /VIN/)
  assert.throws(() => listingFromImport({ title: 'x', currentBidUsd: 'lots' }), /dollar/)
  const l = listingFromImport({ title: '2016 Lexus GX 460', source: 'copart', lotNumber: '41234567', currentBidUsd: '14,250', titleStatus: 'clean', damage: 'minor', runsAndDrives: 'true', url: 'javascript:alert(1)' })
  assert.equal(l.id, 'import:copart:41234567')
  assert.equal(l.kind, 'LIVE')
  assert.equal(l.origin, 'import')
  assert.equal(l.year, 2016)
  assert.equal(l.make, 'Lexus')
  assert.equal(l.currentBidUsd, 14250)
  assert.equal(l.runsAndDrives, true)
  assert.equal(l.url, '#imported', 'only http(s) links are kept')
  assert.equal(l.mileage, undefined)
  assert.equal(l.sellerType, 'insurance')
})

test('imports are per member, replace by id, and remove', () => {
  const a = listingFromImport({ title: '2016 Lexus GX 460', source: 'copart', lotNumber: '1111' })
  withUser('imp-a@example.com', () => { saveImports([a]); saveImports([{ ...a, currentBidUsd: 9 }]) })
  assert.equal(withUser('imp-a@example.com', () => listImports()).length, 1)
  assert.equal(withUser('imp-a@example.com', () => listImports())[0].currentBidUsd, 9)
  assert.equal(withUser('imp-b@example.com', () => listImports()).length, 0)
  assert.equal(withUser('imp-a@example.com', () => removeImport(a.id)), true)
  assert.equal(withUser('imp-a@example.com', () => removeImport(a.id)), false)
})

/** TEST FIXTURE: a sold result page in the style of an enthusiast auction. Not a real listing. */
const SOLD_PAGE = `TEST FIXTURE
2019 Porsche 911 Carrera S
Lot #TF1234
Chassis: WP0AB2A99KS123456
Mileage: 18,400
Title Status: Clean (TX)
Sold for USD $118,500 on 9/12/26`

test('a sold result is read as a sold price with its date, and the for-sale fields step aside', () => {
  const now = Date.UTC(2026, 8, 28)
  const r = parseLotText(SOLD_PAGE, 'https://bringatrailer.com/listing/test-fixture/', now)
  assert.equal(r.fields.source, 'bat')
  assert.equal(r.fields.soldUsd, 118_500)
  assert.equal(new Date(r.fields.soldAt!).getFullYear(), 2026)
  assert.equal(r.fields.currentBidUsd, undefined)
  assert.ok(r.missing.every((k) => k !== 'currentBidUsd'), 'a sold page is not asked for a current bid')
  const l = listingFromImport(r.fields, now)
  assert.equal(l.id, 'sold:bat:TF1234')
  assert.equal(l.soldUsd, 118_500)
  assert.equal(l.endsAt, undefined)
})

test('a live auction that mentions other cars sold prices stays a car for sale', () => {
  const now = Date.UTC(2026, 8, 28)
  const live = `TEST FIXTURE\n2019 Porsche 911 Carrera S\nCurrent Bid: $90,000\nAuction Ends: Oct 5, 2026 12:00 PM\nSold for $101,000 on 8/1/26`
  const r = parseLotText(live, undefined, now)
  assert.equal(r.fields.soldUsd, undefined)
  assert.equal(r.fields.currentBidUsd, 90_000)
})

test('sold prices need a past date', () => {
  const now = Date.UTC(2026, 8, 28)
  assert.throws(() => listingFromImport({ title: '2019 Porsche 911', soldUsd: 100_000 }, now), /date it sold/)
  assert.throws(() => listingFromImport({ title: '2019 Porsche 911', soldUsd: 100_000, soldAt: now + 5 * 86_400_000 }, now), /future/)
  const ok = listingFromImport({ title: '2019 Porsche 911', soldUsd: 100_000, soldAt: '2026-09-01', currentBidUsd: 5 }, now)
  assert.equal(ok.currentBidUsd, undefined, 'a sold car has no current bid')
})

test('CSV: a sold-price column makes sold rows; the sold switch reads the high bid as the sale', () => {
  const withCol = parseCsvImport('Year,Make,Model,Sold Price,Sold Date\n2019,Porsche,911,112000,2026-08-01\n2020,Porsche,911,,\n', 'bat')
  assert.equal(withCol.rows[0].soldUsd, 112_000)
  assert.ok(withCol.rows[0].soldAt)
  assert.equal(withCol.rows[1].soldUsd, undefined, 'a row with no sold price stays a lot')
  const won = parseCsvImport('Lot number,Year,Make,Model,High Bid,Sale Date\n1,2018,Lexus,GX,21000,2026-07-15\n', 'copart', { sold: true })
  assert.equal(won.rows[0].soldUsd, 21_000)
  assert.equal(won.rows[0].currentBidUsd, undefined)
})

test('reading a page of blank lines takes milliseconds, not minutes', () => {
  const t0 = Date.now()
  parseLotText('\n'.repeat(60_000))
  parseLotText(' \n\t'.repeat(20_000))
  assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`)
})

test('importFieldsOf round-trips a stored listing through the same checks', () => {
  const l = listingFromImport({ title: '2016 Lexus GX 460', source: 'copart', lotNumber: '9', mileage: 80000, state: 'TX', url: 'https://www.copart.com/lot/9' })
  const again = listingFromImport(importFieldsOf(l))
  assert.equal(again.id, l.id)
  assert.equal(again.location?.state, 'TX')
  assert.equal(again.url, l.url)
})

test('two sold prices for the same model with no lot or link are two sales', () => {
  const now = Date.UTC(2026, 8, 28)
  const a = listingFromImport({ title: '2017 Ford F-350', soldUsd: 18_000, soldAt: '2026-08-01' }, now)
  const b = listingFromImport({ title: '2017 Ford F-350', soldUsd: 21_500, soldAt: '2026-08-20' }, now)
  assert.notEqual(a.id, b.id)
  const again = listingFromImport({ title: '2017 Ford F-350', soldUsd: 18_000, soldAt: '2026-08-01' }, now)
  assert.equal(again.id, a.id, 'the same sale typed twice is one sale')
})

test('a lot that names its make "__proto__" is stored as plain text', () => {
  const l = listingFromImport({ title: '2015 __proto__ thing', make: '__proto__', source: 'other', lotNumber: 'TFP' })
  assert.equal(typeof l.make, 'string')
})
