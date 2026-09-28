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
  // The budget is cash, all in: transport and the cushion come out first. $22,000 leaves $20,980 to bid,
  // which clears the Corolla's whole band ($9k–$20k), so it is "under"; $20,000 leaves $18,980, so it is "in".
  assert.equal(rentalPicks(22_000, 'p2p').picks.find((p) => p.model === 'Corolla')!.budgetFit, 'under')
  assert.equal(r.picks.find((p) => p.model === 'Corolla')!.budgetFit, 'in')
  assert.equal(rentalPicks(15_000, 'p2p').picks.find((p) => p.model === 'Corolla')!.budgetFit, 'in')
  assert.equal(r.bidCeilingUsd, 18_980)
})

test('stretch: the cash covers the cheapest of a band only before transport and the cushion', () => {
  // $9,500 cash leaves $8,480 to bid: under the Corolla's $9,000 start, but the cash itself is over it.
  assert.equal(rentalPicks(9_500, 'p2p').picks.find((p) => p.model === 'Corolla')!.budgetFit, 'stretch')
  assert.match(rentalPicks(9_500, 'p2p').notes[0], /leaves about \$8,480 to bid/)
})

test('a tiny budget yields mostly over-budget picks and a note about it', () => {
  const r = rentalPicks(3_000, 'fleet')
  assert.ok(r.picks.every((p) => p.budgetFit === 'over'))
  const none = rentalPicks(0, 'p2p')
  assert.ok(none.notes[0].startsWith('Type your cash'))
})

test('no banned promise words in the finder', () => {
  const text = JSON.stringify(rentalPicks(25_000, 'flip')) + JSON.stringify(RENTAL_STEPS)
  assert.equal(/guaranteed|risk[- ]free|proven profit|get rich/i.test(text), false)
})
