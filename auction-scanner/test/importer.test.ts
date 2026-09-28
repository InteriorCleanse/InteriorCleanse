/** The importer reads what the member hands it and guesses nothing. TEST FIXTURE pages only. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { houseFromUrl, listingFromImport, parseCsvImport, parseLotText, readCsv } from '../src/sources/importer.ts'
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
