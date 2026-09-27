/** The first-car finder: ranked, honest, budget-aware. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rentalPicks, RENTAL_STEPS } from '../src/rental.ts'

test('each road returns at least five picks and ten steps', () => {
  for (const use of ['p2p', 'fleet', 'flip'] as const) {
    const r = rentalPicks(20_000, use)
    assert.ok(r.picks.length >= 5, use)
    assert.equal(r.steps.length, 10)
    assert.equal(r.steps, RENTAL_STEPS[use])
    assert.ok(r.notes.length >= 3)
    for (const p of r.picks) assert.ok(p.whyPlain && p.watchOut && p.years && p.roughBandUsd[0] < p.roughBandUsd[1])
  }
})

test('budget fit: in-budget cars come first, then cheaper, then over', () => {
  const r = rentalPicks(20_000, 'p2p')
  const order = r.picks.map((p) => p.budgetFit)
  const firstUnder = order.indexOf('under')
  const firstOver = order.indexOf('over')
  const lastIn = order.lastIndexOf('in')
  if (firstUnder >= 0) assert.ok(lastIn < firstUnder)
  if (firstOver >= 0) assert.ok(lastIn < firstOver && (firstUnder < 0 || firstUnder < firstOver))
  // $20,000 clears the Corolla's whole band, so it is "under" (cheaper than the budget), not "in".
  assert.equal(r.picks.find((p) => p.model === 'Corolla')!.budgetFit, 'under')
  assert.equal(rentalPicks(15_000, 'p2p').picks.find((p) => p.model === 'Corolla')!.budgetFit, 'in')
})

test('a tiny budget yields mostly over-budget picks and a note about it', () => {
  const r = rentalPicks(3_000, 'fleet')
  assert.ok(r.picks.every((p) => p.budgetFit === 'over'))
  const none = rentalPicks(0, 'p2p')
  assert.ok(none.notes[0].startsWith('Type a budget'))
})

test('no banned promise words in the finder', () => {
  const text = JSON.stringify(rentalPicks(25_000, 'flip')) + JSON.stringify(RENTAL_STEPS)
  assert.equal(/guaranteed|risk[- ]free|proven profit|get rich/i.test(text), false)
})
