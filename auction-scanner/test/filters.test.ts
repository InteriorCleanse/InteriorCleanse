/** Tests for src/filters.ts — every starter-mode block sentence. Offline; TEST FIXTURE listings only. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Listing } from '../src/types.ts'
import { starterCheck, type StarterRules } from '../src/filters.ts'
import { config } from '../config.ts'

let n = 0
/** TEST FIXTURE: a listing that passes every default starter rule. */
function fx(over: Partial<Listing> = {}): Listing {
  n += 1
  return {
    id: `fixture:${n}`,
    source: 'sample',
    externalId: String(n),
    url: '#sample',
    title: 'TEST FIXTURE 2018 Honda Civic Si',
    year: 2018,
    make: 'Honda',
    model: 'Civic Si',
    mileage: 50_000,
    titleStatus: 'clean',
    damage: 'none',
    runsAndDrives: true,
    saleType: 'buy-now',
    buyNowUsd: 20_000,
    photos: [],
    kind: 'SAMPLE',
    fetchedAt: 0,
    ...over,
  }
}

const RULES: StarterRules = { ...config.starter }

test('a clean, undamaged, running, cheap, low-mileage, recent car passes', () => {
  assert.deepEqual(starterCheck(fx(), RULES), [])
})

test('title: unknown is blocked with "Title status is not stated"', () => {
  const blocks = starterCheck(fx({ titleStatus: 'unknown' }), RULES)
  assert.equal(blocks.length, 1)
  assert.ok(blocks[0].startsWith('Title status is not stated'), blocks[0])
})

test('title: salvage, rebuilt, flood, lemon and parts-only are each blocked and explained', () => {
  for (const t of ['salvage', 'rebuilt', 'flood', 'lemon', 'parts-only'] as const) {
    const blocks = starterCheck(fx({ titleStatus: t }), RULES)
    assert.equal(blocks.length, 1, t)
    assert.ok(blocks[0].includes(`Title is ${t}`), blocks[0])
    assert.ok(blocks[0].includes('clean title'), blocks[0])
  }
})

test('title: with cleanTitleOnly off, a salvage title is not a block', () => {
  assert.deepEqual(starterCheck(fx({ titleStatus: 'salvage' }), { ...RULES, cleanTitleOnly: false }), [])
})

test('damage above the cap blocks; minor and unknown do not under the default cap', () => {
  assert.deepEqual(starterCheck(fx({ damage: 'minor' }), RULES), [])
  assert.deepEqual(starterCheck(fx({ damage: 'unknown' }), RULES), [])
  const moderate = starterCheck(fx({ damage: 'moderate' }), RULES)
  assert.equal(moderate.length, 1)
  assert.ok(moderate[0].startsWith('Damage is described as moderate'), moderate[0])
  const severe = starterCheck(fx({ damage: 'severe' }), RULES)
  assert.ok(severe[0].startsWith('Damage is described as severe'), severe[0])
})

test('damage: with maxDamage none, even minor damage blocks', () => {
  const blocks = starterCheck(fx({ damage: 'minor' }), { ...RULES, maxDamage: 'none' })
  assert.equal(blocks.length, 1)
  assert.ok(blocks[0].includes('no damage at all'), blocks[0])
})

test('runs and drives: false and undefined each have their own sentence', () => {
  const no = starterCheck(fx({ runsAndDrives: false }), RULES)
  assert.equal(no.length, 1)
  assert.ok(no[0].startsWith('Seller says it does not run and drive.'), no[0])
  const unknown = starterCheck(fx({ runsAndDrives: undefined }), RULES)
  assert.equal(unknown.length, 1)
  assert.ok(unknown[0].startsWith('Nobody says whether it runs and drives.'), unknown[0])
  assert.deepEqual(starterCheck(fx({ runsAndDrives: undefined }), { ...RULES, mustRunAndDrive: false }), [])
})

test('price cap uses the asking price (current bid first) and names both numbers', () => {
  const blocks = starterCheck(fx({ saleType: 'auction', currentBidUsd: 70_000, buyNowUsd: undefined }), RULES)
  assert.equal(blocks.length, 1)
  assert.ok(blocks[0].includes('$70,000'), blocks[0])
  assert.ok(blocks[0].includes('above the starter cap of $60,000'), blocks[0])
  assert.deepEqual(starterCheck(fx({ buyNowUsd: 60_000 }), RULES), [])
  assert.deepEqual(starterCheck(fx({ buyNowUsd: undefined, currentBidUsd: undefined }), RULES), [])
})

test('mileage cap names both numbers', () => {
  const blocks = starterCheck(fx({ mileage: 130_000 }), RULES)
  assert.equal(blocks.length, 1)
  assert.ok(blocks[0].startsWith('Mileage is 130,000, above the starter cap of 120,000'), blocks[0])
  assert.deepEqual(starterCheck(fx({ mileage: 120_000 }), RULES), [])
  assert.deepEqual(starterCheck(fx({ mileage: undefined }), RULES), [])
})

test('model-year floor names both years', () => {
  const blocks = starterCheck(fx({ year: 2005 }), RULES)
  assert.equal(blocks.length, 1)
  assert.ok(blocks[0].startsWith('Model year is 2005, older than the starter floor of 2008'), blocks[0])
  assert.deepEqual(starterCheck(fx({ year: 2008 }), RULES), [])
})

test('several broken rules give several sentences, one each', () => {
  const blocks = starterCheck(fx({ titleStatus: 'salvage', runsAndDrives: false, year: 2005 }), RULES)
  assert.equal(blocks.length, 3)
})

test('the default rules are config.starter', () => {
  assert.deepEqual(starterCheck(fx({ year: 2005 })), starterCheck(fx({ year: 2005 }), config.starter))
})
