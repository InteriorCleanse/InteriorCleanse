/**
 * Tests for src/explain.ts — the rule-based walkthrough. Checks the seven
 * steps are present and in order, the max bid is quoted, and the hard
 * warnings (SAMPLE, dealer licence, branded title, no VIN, too-good pricing)
 * appear when they should. Also checks no banned promise sneaks in.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walkthrough, type WalkthroughCard } from '../src/explain.ts'
import { houseById } from '../src/sources/directory.ts'
import type { BidPlan, Estimate, Listing, Score } from '../src/types.ts'

const BANNED = /guaranteed|proven profitable|risk[- ]free|best investment/i

/** TEST FIXTURE — a LIVE-shaped eBay listing. Not a real car. */
function live(over: Partial<Listing> = {}): Listing {
  return {
    id: 'ebay:v1|123|0',
    source: 'ebay',
    externalId: 'v1|123|0',
    url: 'https://www.ebay.com/itm/123',
    title: '2014 Porsche 911 Carrera S',
    year: 2014,
    make: 'Porsche',
    model: '911',
    trim: 'Carrera S',
    vin: 'WP0AB2A99ES123456',
    mileage: 41_200,
    titleStatus: 'clean',
    damage: 'none',
    runsAndDrives: true,
    location: { city: 'Miami', state: 'FL', country: 'US' },
    saleType: 'auction',
    currentBidUsd: 46_500,
    endsAt: Date.now() + 2 * 86_400_000,
    bidCount: 9,
    photos: [],
    kind: 'LIVE',
    fetchedAt: Date.now(),
    ...over,
  }
}

const ESTIMATE_OK: Estimate = { ok: true, valueUsd: 66_000, low: 61_000, high: 74_900, comps: 4, method: 'median of 4 comparable listings, mileage-adjusted' }
const SCORE: Score = { total: 82, grade: 'steal', discount: 0.3, reasons: ['Priced 30% under 4 comparables.'], redFlags: [], starterOk: true, starterBlocks: [] }
const PLAN: BidPlan = {
  resaleUsd: 66_000,
  buyerFeeUsd: 0,
  transportUsd: 270,
  repairsUsd: 0,
  reserveUsd: 750,
  marginUsd: 9_900,
  maxBidUsd: 55_080,
  headroomUsd: 8_580,
  lines: ['Resale $66,000', 'Buyer fee $0', 'Transport $270', 'Repairs $0', 'Cushion $750', 'Your margin $9,900', 'Max bid $55,080'],
}

function card(listing: Listing, over: Partial<WalkthroughCard> = {}): WalkthroughCard {
  return { listing, estimate: ESTIMATE_OK, score: SCORE, plan: PLAN, ...over }
}

test('seven numbered steps, in order, specific to the car and the house', () => {
  const w = walkthrough(card(live()), houseById('ebay'))
  assert.equal(w.source, 'rules')
  assert.match(w.title, /2014 Porsche 911/)
  assert.match(w.title, /eBay Motors/)
  assert.equal(w.steps.length, 7)
  assert.deepEqual(w.steps.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(
    w.steps.map((s) => s.title),
    ['Check it is the car it says it is', 'Look for what the photos hide', 'Know your number', 'Register and get ready', 'How the bidding works here', 'If you win', "If you don't"],
  )
  assert.ok(w.steps.every((s) => s.body.length > 80), 'every step says something')
  assert.match(w.steps[0].body, /WP0AB2A99ES123456/, 'quotes the VIN')
  assert.match(w.steps[0].body, /history report/i)
  assert.match(w.steps[1].body, /runs and drives/i)
  assert.match(w.steps[1].body, /41,200 miles/)
  assert.match(w.steps[3].body, /eBay account/)
  assert.match(w.steps[3].body, /motors-fees/, 'links the fee page to verify')
  assert.match(w.steps[4].body, /countdown/i)
  assert.match(w.steps[4].body, /reserve/i)
  assert.match(w.steps[5].body, /title/i)
  assert.match(w.steps[5].body, /Miami, FL/)
  assert.match(w.steps[6].body, /paper bid/i)
  assert.deepEqual(w.warnings, [], 'a clean LIVE car with a VIN at a public house has no warnings')
  assert.doesNotMatch(JSON.stringify(w), BANNED)
})

test('step 3 quotes the max bid and says never to go above it', () => {
  const w = walkthrough(card(live()), houseById('ebay'))
  const know = w.steps[2].body
  assert.match(know, /\$55,080/)
  assert.match(know, /Never go above it, not by \$100/)
  assert.match(know, /\$8,580 under your max/)
  assert.match(know, /Max bid \$55,080/, 'includes the plan lines')
  assert.match(know, /\$66,000/, 'quotes the estimate')

  const over = walkthrough(card(live({ currentBidUsd: 60_000 }), { plan: { ...PLAN, headroomUsd: -4_920 } }), houseById('ebay'))
  assert.match(over.steps[2].body, /at or above your max/)

  const noComps = walkthrough(card(live(), { estimate: { ok: false, comps: 1, reason: 'NOT ENOUGH COMPS — found 1 comparable listing.' } }), houseById('ebay'))
  assert.match(noComps.steps[2].body, /NOT ENOUGH COMPS/)
  assert.match(noComps.steps[2].body, /\$55,080/)
})

test('SAMPLE cars carry the SAMPLE warning', () => {
  const sample = live({ id: 'sample:1', source: 'sample', url: '#sample', vin: 'SAMPLE00000000001', kind: 'SAMPLE' })
  const w = walkthrough(card(sample), undefined)
  assert.ok(w.warnings.includes('This is a SAMPLE car. Nothing here can be bought.'))
  assert.equal(w.steps.length, 7)
  assert.match(w.steps[0].body, /SAMPLE car/)
  assert.match(w.steps[3].body, /does not have a directory entry/, 'no house: says so and tells them where to look')
  assert.doesNotMatch(JSON.stringify(w), BANNED)
})

test('a dealer-only house carries the licence warning and says so in the steps', () => {
  const l = live({ id: 'manheim:1', source: 'manheim', url: 'https://www.manheim.com/lot/1' })
  const w = walkthrough(card(l), houseById('manheim'))
  assert.ok(w.warnings.includes('You cannot buy here yet: it needs a dealer licence. See the Playbook.'))
  assert.match(w.steps[3].body, /dealer licence/)
  assert.match(w.steps[4].body, /condition report/i)
  assert.doesNotMatch(JSON.stringify(w), BANNED)
})

test('branded titles, missing VINs, non-runners and too-good prices are warned about', () => {
  const salvage = walkthrough(card(live({ titleStatus: 'salvage' })), houseById('copart'))
  assert.ok(salvage.warnings.some((x) => /salvage title/.test(x)))
  assert.match(salvage.steps[0].body, /branded title/)

  const noVin = walkthrough(card(live({ vin: undefined })), houseById('ebay'))
  assert.ok(noVin.warnings.some((x) => /No VIN/.test(x)))
  assert.match(noVin.steps[0].body, /does not show a VIN/)

  const dead = walkthrough(card(live({ runsAndDrives: false, damage: 'severe' })), houseById('iaa'))
  assert.ok(dead.warnings.some((x) => /does not run and drive/.test(x)))
  assert.ok(dead.warnings.some((x) => /severe damage/.test(x)))
  assert.match(dead.steps[1].body, /pass/i)
  assert.match(dead.steps[4].body, /pre-bid/i, 'IAA and Copart sell in a live lane, not a countdown')

  const tooGood = walkthrough(card(live({ currentBidUsd: 20_000 })), houseById('ebay'))
  assert.ok(tooGood.warnings.some((x) => /less than half/.test(x)))

  const unknownTitle = walkthrough(card(live({ titleStatus: 'unknown' })), houseById('ebay'))
  assert.ok(unknownTitle.warnings.some((x) => /does not say the title status/.test(x)))

  const flagged = walkthrough(card(live(), { score: { ...SCORE, redFlags: ['Seller has no feedback.'] } }), houseById('ebay'))
  assert.ok(flagged.warnings.includes('Seller has no feedback.'), 'the score\'s red flags are carried through')
})

test('every house in the directory produces a full walkthrough with no banned words', () => {
  for (const id of ['ebay', 'carsandbids', 'bat', 'copart', 'iaa', 'manheim', 'adesa', 'acv', 'govdeals', 'local', 'collector']) {
    const house = houseById(id)
    assert.ok(house, id)
    const w = walkthrough(card(live({ source: id })), house)
    assert.equal(w.steps.length, 7, id)
    assert.ok(w.steps.every((s) => s.body.length > 40), id)
    assert.doesNotMatch(JSON.stringify(w), BANNED, id)
  }
})
