/** The deal finder: only real, clean, priced cars that fit the budget, biggest estimated profit first. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Estimate, Listing } from '../src/types.ts'
import { findDeals } from '../src/finder.ts'
import { scoreListing } from '../src/scoring.ts'

const NOW = Date.UTC(2026, 9, 3, 12)
let n = 0
/** TEST FIXTURE: a live eBay auction. Never a real car. */
function fx(over: Partial<Listing> = {}): Listing {
  n++
  return { id: `fixture:${n}`, source: 'ebay', externalId: String(n), url: 'https://example.invalid/' + n, title: 'TEST FIXTURE 2018 Toyota Camry SE', year: 2018, make: 'Toyota', model: 'Camry', mileage: 60_000, titleStatus: 'clean', damage: 'none', runsAndDrives: true, saleType: 'auction', currentBidUsd: 9_000, endsAt: NOW + 6 * 3600_000, photos: [], kind: 'LIVE', fetchedAt: NOW, ...over }
}
const est = (value: number, comps = 6): Estimate => ({ ok: true, valueUsd: value, low: value * 0.9, high: value * 1.1, comps, method: 'test fixture' })
const card = (l: Listing, e: Estimate = est(15_000)) => ({ listing: l, estimate: e, score: scoreListing(l, e, undefined, undefined, NOW) })

test('a clean, priced car under the ceiling and inside the budget is a deal, with every cost itemised', () => {
  const r = findDeals([card(fx())], { budgetUsd: 15_000, now: NOW })
  assert.equal(r.deals.length, 1)
  const d = r.deals[0]
  assert.equal(d.priceUsd, 9_000)
  assert.equal(d.buyerFeeUsd, 0, 'eBay charges no buyer fee on vehicles')
  assert.equal(d.allInUsd, 9_000 + d.transportUsd + d.cushionUsd)
  assert.equal(d.spreadUsd, 15_000 - d.allInUsd)
  assert.ok(d.ceilingUsd > d.priceUsd)
  assert.equal(d.confidence, 'firmer')
  assert.ok(d.cautions.some((c) => /not the final price/.test(c)))
})

test('every rule that keeps a car out is counted', () => {
  const r = findDeals([
    card(fx({ kind: 'SAMPLE' })),
    card(fx({ endsAt: NOW - 1 })),
    card(fx({ soldUsd: 9_000 })),
    card(fx({ currentBidUsd: undefined })),
    card(fx({ titleStatus: 'salvage' })),
    card(fx({ damage: 'moderate' })),
    card(fx({ runsAndDrives: false })),
    card(fx(), { ok: false, comps: 1, reason: 'NOT ENOUGH COMPS' }),
    card(fx({ currentBidUsd: 14_800 })),
    card(fx({ currentBidUsd: 12_000 }), est(12_500)),
  ], { budgetUsd: 15_000, now: NOW })
  assert.equal(r.deals.length, 0)
  assert.deepEqual(r.excluded, { sample: 1, ended: 1, sold: 1, 'no price': 1, title: 1, damage: 1, 'does not run': 1, 'could not price': 1, 'over budget': 1, 'no room': 1 })
})

test('no damage only, when asked; and the biggest estimated profit comes first', () => {
  const minor = card(fx({ damage: 'minor', currentBidUsd: 6_000 }))
  const clean = card(fx({ currentBidUsd: 8_000 }))
  assert.equal(findDeals([minor, clean], { budgetUsd: 15_000, maxDamage: 'none', now: NOW }).deals.length, 1)
  const both = findDeals([clean, minor], { budgetUsd: 15_000, now: NOW }).deals
  assert.deepEqual(both.map((d) => d.priceUsd), [6_000, 8_000])
  assert.ok(both[0].cautions.some((c) => /Minor damage/.test(c)))
})

test('thin evidence is labelled; an unknown sliding-scale fee is called out, never guessed', () => {
  const thin = findDeals([card(fx(), est(15_000, 3))], { budgetUsd: 15_000, now: NOW }).deals[0]
  assert.equal(thin.confidence, 'thin')
  const copart = findDeals([card(fx({ source: 'copart' }))], { budgetUsd: 15_000, now: NOW }).deals[0]
  if (copart && !copart.feeKnown) assert.ok(copart.cautions.some((c) => /sliding scale/.test(c)))
})
