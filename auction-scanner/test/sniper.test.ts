/** The Sniper: targets validate, matching is strict, fire plans follow each auction's closing rule, alerts dedupe. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Listing } from '../src/types.ts'
import { validateTarget, saveTarget, listTargets, removeTarget } from '../src/sniper/targets.ts'
import { firePlan, matchesTarget, pickFor, fitScore } from '../src/sniper/engine.ts'
import { addAlert, alreadyFired, listAlerts, markAlertsRead } from '../src/sniper/alerts.ts'
import { buildPlan } from '../src/bidplan.ts'
import { scoreListing } from '../src/scoring.ts'
import type { Card } from '../src/server.ts'

const NOW = Date.UTC(2026, 5, 1, 12)
function fx(over: Partial<Listing> & { id: string }): Listing {
  return { source: 'ebay', externalId: over.id, url: 'https://example.com/' + over.id, title: 'TEST FIXTURE 2018 Honda Civic Si', year: 2018, make: 'Honda', model: 'Civic Si', mileage: 40_000, titleStatus: 'clean', damage: 'none', runsAndDrives: true, saleType: 'auction', currentBidUsd: 12_000, endsAt: NOW + 3 * 3600_000, photos: [], kind: 'LIVE', fetchedAt: NOW, vin: '2HGFC1E5XJH000000', location: { state: 'TX' }, ...over }
}
const EST = { ok: true as const, valueUsd: 20_000, low: 19_000, high: 21_000, comps: 3, method: 'test' }
function card(l: Listing): Card {
  return { listing: l, estimate: EST, score: scoreListing(l, EST, undefined, undefined, NOW) }
}

test('validateTarget fills defaults and rejects nonsense', () => {
  const t = validateTarget({ makes: ['Honda', 'honda', ''], models: ['Civic Si'], maxBudgetUsd: '15,000', yearMin: 2016, states: ['tx', 'zz9'] })
  assert.deepEqual(t.makes, ['Honda', 'honda'].slice(0, 2))
  assert.equal(t.maxBudgetUsd, 15_000)
  assert.equal(t.minScore, 60)
  assert.equal(t.starterOnly, true)
  assert.equal(t.armed, false)
  assert.deepEqual(t.states, ['TX'])
  assert.match(t.name, /Honda/)
  assert.throws(() => validateTarget({ maxBudgetUsd: 10 }), /between/)
  assert.throws(() => validateTarget({}), /maxBudgetUsd/)
  assert.throws(() => validateTarget({ maxBudgetUsd: 5000, yearMin: 2020, yearMax: 2015 }), /first year/)
})

test('targets persist, update and remove', () => {
  const t = saveTarget({ makes: ['Toyota'], maxBudgetUsd: 20_000 })
  assert.equal(listTargets().length, 1)
  const u = saveTarget({ armed: true }, t.id)
  assert.equal(u.armed, true)
  assert.equal(u.makes[0], 'Toyota')
  assert.throws(() => saveTarget({ armed: true }, 'nope'), /No target/)
  assert.equal(removeTarget(t.id), true)
  assert.equal(removeTarget(t.id), false)
})

test('matching is strict on every field the person set', () => {
  const t = validateTarget({ makes: ['Honda'], models: ['Civic'], yearMin: 2017, yearMax: 2020, maxBudgetUsd: 15_000, maxMileage: 60_000, states: ['TX'], minScore: 60 })
  assert.equal(matchesTarget(t, card(fx({ id: 'ok' }))).ok, true)
  assert.deepEqual(matchesTarget(t, card(fx({ id: 'mk', make: 'Toyota' }))).why, ['make'])
  assert.deepEqual(matchesTarget(t, card(fx({ id: 'md', model: 'Accord' }))).why, ['model'])
  assert.deepEqual(matchesTarget(t, card(fx({ id: 'yr', year: 2015 }))).why, ['too old'])
  assert.deepEqual(matchesTarget(t, card(fx({ id: 'mi', mileage: 90_000 }))).why, ['too many miles'])
  assert.deepEqual(matchesTarget(t, card(fx({ id: 'st', location: { state: 'CA' } }))).why, ['wrong state'])
  assert.deepEqual(matchesTarget(t, card(fx({ id: 'pr', currentBidUsd: 16_000 }))).why, ['over budget now'])
  assert.deepEqual(matchesTarget(t, card(fx({ id: 'sv', titleStatus: 'salvage' }))).why, ['fails starter rules'])
  const c = card(fx({ id: 'lo', currentBidUsd: 19_500 }))
  const loose = validateTarget({ maxBudgetUsd: 25_000, minScore: 90 })
  assert.deepEqual(matchesTarget(loose, c).why, ['score too low'])
  const unpriced: Card = { listing: fx({ id: 'up' }), estimate: { ok: false, comps: 1, reason: 'NOT ENOUGH COMPS' }, score: scoreListing(fx({ id: 'up' }), { ok: false, comps: 1, reason: 'NOT ENOUGH COMPS' }, undefined, undefined, NOW) }
  assert.deepEqual(matchesTarget(loose, unpriced).why, ['not enough comps'])
})

test('fire plans follow the closing rule and never exceed the budget', () => {
  const t = validateTarget({ maxBudgetUsd: 13_000 })
  const l = fx({ id: 'e' })
  const plan = buildPlan(l, EST, { houseId: 'ebay', distanceMiles: 0 })
  assert.ok(plan.maxBidUsd > 13_000, 'the plan alone would allow more')
  const snipe = firePlan(l, plan, t, NOW)
  assert.equal(snipe.method, 'snipe')
  assert.equal(snipe.maxBidUsd, 13_000)
  assert.equal(snipe.fireAt, l.endsAt! - 8_000)
  assert.match(snipe.why, /budget/)
  const proxy = firePlan(fx({ id: 'cb', source: 'carsandbids' }), plan, t, NOW)
  assert.equal(proxy.method, 'proxy')
  assert.match(proxy.why, /extends the clock/)
  const lane = firePlan(fx({ id: 'cp', source: 'copart' }), plan, t, NOW)
  assert.equal(lane.method, 'live-lane')
  const bin = firePlan(fx({ id: 'bn', saleType: 'buy-now', buyNowUsd: 12_500, currentBidUsd: undefined }), plan, t, NOW)
  assert.equal(bin.method, 'buy-now')
  assert.match(bin.steps[0], /at or under your number/)
})

test('a pick carries the plan, the fire plan and a fit; a too-expensive car is no pick', () => {
  const t = validateTarget({ makes: ['Honda'], maxBudgetUsd: 15_000 })
  const c = card(fx({ id: 'p1' }))
  const plan = buildPlan(c.listing, EST, { houseId: 'ebay', distanceMiles: 0 })
  const p = pickFor(t, c, plan, NOW)
  assert.ok(p)
  assert.equal(p!.fire.method, 'snipe')
  assert.ok(p!.fit > 40 && p!.fit <= 100)
  assert.ok(p!.reasons.some((r) => /Never bid above/.test(r)))
  assert.ok(fitScore(card(fx({ id: 'ended', endsAt: NOW - 1 })), plan, t, NOW) < fitScore(c, plan, t, NOW))
  assert.equal(pickFor(validateTarget({ maxBudgetUsd: 5_000, minScore: 0 }), card(fx({ id: 'exp', currentBidUsd: 4_900 })), buildPlan(fx({ id: 'exp' }), { ok: true, valueUsd: 5_500, low: 5_000, high: 6_000, comps: 3, method: 't' }, { houseId: 'ebay', distanceMiles: 0 }), NOW), null)
})

test('alerts dedupe paper fires and mark read', () => {
  addAlert({ kind: 'paper-fired', targetId: 't1', listingId: 'ebay:1', title: 'x', body: 'y' })
  assert.equal(alreadyFired('t1', 'ebay:1'), true)
  assert.equal(alreadyFired('t1', 'ebay:2'), false)
  assert.equal(listAlerts()[0].read, false)
  assert.equal(markAlertsRead(), 1)
  assert.equal(markAlertsRead(), 0)
})
