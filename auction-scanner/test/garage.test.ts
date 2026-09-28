/** The garage ledger: only what the member types, totals that add up, sales that close a car. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addCar, addCost, addIncome, garageSummary, listGarage, removeCar, removeEntry, totalsFor, updateCar, validateGarageFile } from '../src/garage.ts'
import { withUser } from '../src/store.ts'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 3, 1)

test('adding a car validates its fields', () => withUser('g1@example.com', () => {
  assert.throws(() => addCar({ purchaseUsd: 9000 }), /name/)
  assert.throws(() => addCar({ title: 'x', purchaseUsd: 0 }), /purchase price/)
  assert.throws(() => addCar({ title: 'x', purchaseUsd: 9000, vin: 'IOQ' }), /VIN/)
  assert.throws(() => addCar({ title: 'x', purchaseUsd: 9000, year: 1800 }), /year/)
  const c = addCar({ title: 'TEST FIXTURE 2017 Toyota Camry SE', year: 2017, make: 'Toyota', model: 'Camry', purchaseUsd: '$9,400', boughtAt: T0 }, T0)
  assert.equal(c.purchaseUsd, 9400)
  assert.equal(c.status, 'owned')
  assert.equal(listGarage().length, 1)
}))

test('costs and income roll up per car and overall; a "Sale" closes the car', () => withUser('g2@example.com', () => {
  const c = addCar({ title: 'TEST FIXTURE Camry', purchaseUsd: 9000, boughtAt: T0 }, T0)
  addCost(c.id, { label: 'Buyer fee', usd: 450, date: T0 }, T0)
  addCost(c.id, { label: 'Tyres', usd: 520.5, date: T0 + DAY }, T0 + DAY)
  addIncome(c.id, { label: 'Turo payout', usd: 610, date: T0 + 20 * DAY }, T0 + 20 * DAY)
  let t = totalsFor(listGarage()[0], T0 + 30 * DAY)
  assert.equal(t.spentUsd, 9970.5)
  assert.equal(t.incomeUsd, 610)
  assert.equal(t.netUsd, -9360.5)
  assert.equal(t.daysOwned, 30)
  const sold = addIncome(c.id, { label: 'Sale', usd: 11_200, date: T0 + 60 * DAY }, T0 + 60 * DAY)
  assert.equal(sold.status, 'sold')
  assert.equal(sold.soldAt, T0 + 60 * DAY)
  t = totalsFor(sold, T0 + 400 * DAY)
  assert.equal(t.netUsd, 1839.5)
  assert.equal(t.daysOwned, 60, 'days owned stop at the sale')
  const s = garageSummary(T0 + 61 * DAY)
  assert.equal(s.cars, 1)
  assert.equal(s.sold, 1)
  assert.equal(s.netUsd, 1839.5)
  assert.equal(s.bestTitle, 'TEST FIXTURE Camry')
  assert.throws(() => addCost(c.id, { label: '', usd: 5 }), /what the cost was for/)
  assert.throws(() => addCost(c.id, { label: 'x', usd: -1 }), /amount/)
  const tyre = sold.costs.find((m) => m.label === 'Tyres')!
  const after = removeEntry(c.id, tyre.id)
  assert.equal(after.costs.length, 1)
  assert.throws(() => removeEntry(c.id, 'nope'), /No entry/)
}))

test('status changes, and reopening a sold car clears the sale date', () => withUser('g3@example.com', () => {
  const c = addCar({ title: 'TEST FIXTURE Civic', purchaseUsd: 8000 })
  assert.equal(updateCar(c.id, { status: 'rented', channel: 'Turo' }).channel, 'Turo')
  assert.ok(updateCar(c.id, { status: 'sold' }).soldAt)
  assert.equal(updateCar(c.id, { status: 'listed' }).soldAt, undefined)
  assert.throws(() => updateCar(c.id, { status: 'crashed' }), /Status/)
  assert.throws(() => updateCar('nope', {}), /No car/)
  assert.equal(removeCar(c.id), true)
  assert.equal(removeCar(c.id), false)
}))

test('a backup garage file is checked before it is trusted', () => {
  assert.throws(() => validateGarageFile({}), /list/)
  assert.throws(() => validateGarageFile([{ id: 'x' }]), /missing/)
  assert.equal(validateGarageFile([]).length, 0)
})
