/** Companies, the business report, the partner, materials, the P/L estimator and the part finder. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withUser } from '../src/store.ts'
import { addCompany, addOverhead, listCompanies, removeCompany, updateCompany, validateCompaniesFile } from '../src/companies.ts'
import { addCar, addCost, addIncome, listGarage, totalsFor, unassignCompany, updateCar } from '../src/garage.ts'
import { businessReport } from '../src/business.ts'
import { answerFromBooks, briefing } from '../src/advisor.ts'
import type { BriefingInput } from '../src/advisor.ts'
import { materialsFor } from '../src/materials.ts'
import { estimatePnl, pnlInputFrom } from '../src/pnl.ts'
import { cleanQuery, partLinks, vehicleFrom } from '../src/parts.ts'
import { buildPartsUrl, fromEbayPart } from '../src/sources/ebay.ts'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 6, 1, 12)

test('companies: named once, flip/rental/mixed, overhead validated, a backup checked', () => withUser('b1@example.com', () => {
  assert.throws(() => addCompany({}), /name/)
  const flip = addCompany({ name: 'TEST FIXTURE Flips LLC', kind: 'flip' }, T0)
  assert.throws(() => addCompany({ name: 'test fixture flips llc' }), /already/)
  assert.throws(() => addCompany({ name: 'X', kind: 'yacht' }), /flip, rental or mixed/)
  assert.equal(addCompany({ name: 'TEST FIXTURE Rentals' }, T0).kind, 'mixed')
  assert.throws(() => addOverhead(flip.id, { label: 'Insurance', usd: -5 }, T0), /amount/)
  assert.equal(addOverhead(flip.id, { label: 'Dealer licence', usd: '$400' }, T0).overhead[0].usd, 400)
  assert.equal(updateCompany(flip.id, { name: 'TEST FIXTURE Flips Co' }, T0).name, 'TEST FIXTURE Flips Co')
  assert.equal(validateCompaniesFile(listCompanies()).length, 2)
  assert.throws(() => validateCompaniesFile([{ id: 'x' }]), /missing/)
}))

test('profit per company and overall add up; months add to the total; a removed company leaves its cars unassigned', () => withUser('b2@example.com', () => {
  const flip = addCompany({ name: 'TEST FIXTURE Flips', kind: 'flip' }, T0)
  const rent = addCompany({ name: 'TEST FIXTURE Rentals', kind: 'rental' }, T0)
  assert.throws(() => addCar({ title: 'x', purchaseUsd: 100, companyId: 'nope' }, T0), /company does not exist/)
  const a = addCar({ title: 'TEST FIXTURE 2016 Honda Civic', purchaseUsd: 4000, companyId: flip.id, boughtAt: T0 }, T0)
  addCost(a.id, { label: 'Transport', usd: 300, date: T0 + DAY }, T0 + DAY)
  addIncome(a.id, { label: 'Sale', usd: 7300, date: T0 + 20 * DAY }, T0 + 20 * DAY)
  const b = addCar({ title: 'TEST FIXTURE 2018 Toyota Corolla', purchaseUsd: 6000, companyId: rent.id, boughtAt: T0 }, T0)
  addIncome(b.id, { label: 'Turo payout', usd: 900, date: T0 + 30 * DAY }, T0 + 30 * DAY)
  addCar({ title: 'TEST FIXTURE 2015 Mazda3', purchaseUsd: 3000, boughtAt: T0 + 5 * DAY }, T0 + 5 * DAY)
  addOverhead(flip.id, { label: 'Dealer licence', usd: 500, date: T0 + 2 * DAY }, T0 + 2 * DAY)

  const now = T0 + 40 * DAY
  const cars = listGarage()
  const r = businessReport(cars, listCompanies(), now)
  const f = r.companies.find((c) => c.company.id === flip.id)!.stats
  assert.equal(f.netUsd, 7300 - 4300 - 500)
  assert.equal(f.realisedNetUsd, 3000)
  assert.equal(f.avgDaysToSell, 20)
  assert.equal(f.avgProfitPerSaleUsd, 3000)
  const rs = r.companies.find((c) => c.company.id === rent.id)!.stats
  assert.equal(rs.rentalIncomeUsd, 900)
  assert.equal(rs.cashInCarsUsd, 5100)
  assert.ok(rs.rentalPerCarMonthUsd! > 0)
  assert.equal(r.unassigned?.cars, 1)
  assert.equal(r.overall.netUsd, 7300 + 900 - 4300 - 6000 - 3000 - 500)
  const monthsNet = r.months.reduce((s, m) => s + m.netUsd, 0)
  assert.equal(Math.round(monthsNet), Math.round(r.overall.netUsd), 'the months add up to the total')

  assert.equal(removeCompany(rent.id), true)
  assert.equal(unassignCompany(rent.id), 1)
  assert.equal(listGarage().find((c) => c.id === b.id)!.companyId, undefined)
}))

test('the partner names losses, slow sellers and missing costs, ranks urgent first, and never invents a number', () => withUser('b3@example.com', () => {
  const co = addCompany({ name: 'TEST FIXTURE Co', kind: 'flip' }, T0)
  const lost = addCar({ title: 'TEST FIXTURE 2012 Ford Focus', purchaseUsd: 5000, companyId: co.id, boughtAt: T0 }, T0)
  addCost(lost.id, { label: 'Transmission', usd: 1800, date: T0 + DAY }, T0 + DAY)
  addIncome(lost.id, { label: 'Sale', usd: 6000, date: T0 + 30 * DAY }, T0 + 30 * DAY)
  const slow = addCar({ title: 'TEST FIXTURE 2014 Nissan Altima', purchaseUsd: 4500, companyId: co.id, boughtAt: T0 }, T0)
  updateCar(slow.id, { status: 'listed' }, T0 + DAY)
  const now = T0 + 60 * DAY
  const cars = listGarage().map((c) => ({ ...c, totals: totalsFor(c, now) }))
  const input: BriefingInput = { report: businessReport(cars, listCompanies(), now), cars, companies: listCompanies(), cashUsd: 5000, taxTitlePctSet: false, endingSoon: [{ listingId: 'ebay:1', title: 'TEST FIXTURE 2017 Camry', endsAt: now + 2 * 3600_000, maxBidUsd: 3400 }], unreadAlerts: 0, paperBids: 0, liveSource: true, now }
  const b = briefing(input)
  assert.equal(b.items[0].tone, 'hot')
  assert.match(b.items[0].title, /Focus lost \$800/)
  assert.match(b.items[0].body, /Transmission at \$1,800/)
  assert.ok(b.items.some((x) => /Altima: 60 days/.test(x.title)))
  assert.ok(b.items.some((x) => /Log the costs on TEST FIXTURE 2014 Nissan Altima/.test(x.title)))
  assert.ok(b.items.some((x) => /Camry ends in 2 hours/.test(x.title) && /\$3,400/.test(x.body)))
  assert.ok(b.items.some((x) => x.id === 'cash' && /leaves about \$500/.test(x.body)))
  assert.ok(b.items.every((x) => !/guarantee|risk-free|sure thing/i.test(x.title + x.body)))
  const tax = answerFromBooks('Can I write this off on my taxes?', input, b)
  assert.match(tax.answer, /tax adviser/)
  const profit = answerFromBooks('how much profit have I made', input, b)
  assert.match(profit.answer, /realised/)
  const sell = answerFromBooks('what should I list the altima at', input, b)
  assert.match(sell.answer, /\$4,500 breaks even and \$7,000 clears \$2,500/)
}))

test('materials follow the car: miles, age, damage, electric; checks are priced apart', () => {
  const now = Date.UTC(2026, 9, 1)
  const old = materialsFor({ year: 2014, make: 'Toyota', model: 'Camry', mileage: 120_000, damage: 'minor', runsAndDrives: true }, now)
  const ids = (m: typeof old, need?: string) => m.items.filter((x) => !need || x.need === need).map((x) => x.id)
  for (const id of ['oil', 'brakes', 'plugs', 'transFluid', 'battery', 'headlights', 'touchUp']) assert.ok(ids(old).includes(id), id)
  assert.ok(ids(old, 'likely').includes('plugs'))
  assert.ok(old.expectedUsd > 0 && old.expectedLowUsd <= old.expectedUsd && old.expectedUsd <= old.expectedHighUsd)
  assert.ok(old.checkHighUsd >= old.checkLowUsd)
  const ev = materialsFor({ year: 2022, make: 'Tesla', model: 'Model 3', mileage: 30_000 }, now)
  assert.ok(!ids(ev).includes('oil') && !ids(ev).includes('plugs'))
  assert.ok(ids(ev).includes('twelveVolt'))
  assert.match(old.notes[0], /working ranges/)
})

test('the P/L estimator itemises with sources, finds break-even and the big-profit price, and says loss plainly', () => {
  assert.throws(() => pnlInputFrom({ buyUsd: 0 }), /price/)
  const inp = pnlInputFrom({ buyUsd: '3,200', houseId: 'ebay', transportUsd: 250, taxTitlePct: 7, materialsUsd: 400, materialsFromRanges: true, partsUsd: -9, saleUsd: 7500, saleLowUsd: 6800, saleHighUsd: 8200 })
  assert.equal(inp.partsUsd, undefined, 'a negative number is dropped, never coerced')
  const p = estimatePnl(inp)
  assert.deepEqual(p.lines.map((l) => l.key), ['buy', 'fee', 'transport', 'tax', 'materials', 'cushion'])
  assert.equal(p.lines.find((l) => l.key === 'materials')!.basis, 'working figure')
  assert.equal(p.costUsd, 3200 + 0 + 250 + 224 + 400 + 750)
  assert.equal(p.profitUsd, 7500 - p.costUsd)
  assert.equal(p.verdict, 'big')
  assert.equal(p.breakEvenUsd, p.costUsd)
  assert.equal(p.scenarios.length, 3)
  const loss = estimatePnl({ buyUsd: 6000, houseId: 'copart', saleUsd: 6500 })
  assert.equal(loss.verdict, 'loss')
  assert.ok(loss.missing.some((m) => /sliding scale/.test(m)), 'a sliding-scale fee is named, never guessed')
  const open = estimatePnl({ buyUsd: 3000 })
  assert.equal(open.verdict, 'unknown')
  assert.match(open.verdictText, /break even at/)
})

test('the part finder checks the car, builds store searches, and reads eBay fitment honestly', () => {
  assert.throws(() => vehicleFrom({ year: 'x', make: 'Toyota', model: 'Camry' }), /year/)
  assert.throws(() => vehicleFrom({ year: 2018, make: 'Toyota;Make:x', model: 'Camry' }), /letters/)
  assert.throws(() => cleanQuery('  '), /which part/)
  const v = vehicleFrom({ year: 2018, make: 'Jeep', model: 'Grand Cherokee' })
  const links = partLinks(v, 'brake pads')
  assert.equal(links[0].url, 'https://www.rockauto.com/en/catalog/jeep,2018,grand+cherokee')
  assert.ok(links.every((l) => l.url.startsWith('https://')))
  assert.ok(links.some((l) => l.kind === 'used'))
  const u = new URL(buildPartsUrl(v, 'brake pads'))
  assert.equal(u.searchParams.get('category_ids'), '6030')
  assert.equal(u.searchParams.get('compatibility_filter'), 'Year:2018;Make:Jeep;Model:Grand Cherokee')
  const part = fromEbayPart({ itemId: '1', title: 'TEST FIXTURE pads', itemWebUrl: 'https://example.invalid/1', price: { value: '42.10', currency: 'USD' }, compatibilityMatch: 'EXACT', shippingOptions: [{ shippingCost: { value: '0.00' } }] })
  assert.equal(part.fits, 'exact')
  assert.equal(part.priceUsd, 42.1)
  assert.equal(part.freeShipping, true)
  assert.equal(fromEbayPart({ itemId: '2', title: 't', itemWebUrl: 'https://example.invalid/2' }).fits, 'not checked')
})
