/**
 * Tests for src/paper.ts — the watchlist and PAPER bids. Runs against the
 * temp data directory that test/setup.ts provides, never ./data.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addWatch, listPaper, listWatch, paperSummary, placePaperBid, removeWatch, setOutcome } from '../src/paper.ts'
import { DATA_DIR } from '../src/store.ts'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { Listing } from '../src/types.ts'

/** TEST FIXTURE — a SAMPLE-shaped listing. Not a real car. */
function listing(id: string, title: string): Listing {
  return {
    id,
    source: 'sample',
    externalId: id.split(':')[1] ?? id,
    url: '#sample',
    title,
    year: 2018,
    make: 'Honda',
    model: 'Civic Si',
    titleStatus: 'clean',
    damage: 'none',
    runsAndDrives: true,
    saleType: 'auction',
    currentBidUsd: 13_900,
    photos: [],
    kind: 'SAMPLE',
    fetchedAt: Date.now(),
  }
}

test('the store is pointed at a temp directory by test/setup.ts', () => {
  assert.ok(resolve(DATA_DIR).startsWith(resolve(tmpdir())), `DATA_DIR ${DATA_DIR} must be under ${tmpdir()}`)
})

test('watchlist: add is idempotent, remove is idempotent', () => {
  assert.deepEqual(listWatch(), [])
  const a = listing('sample:1', '2018 Honda Civic Si')
  const once = addWatch(a)
  assert.equal(once.length, 1)
  assert.equal(once[0].listingId, 'sample:1')
  assert.equal(once[0].title, a.title)
  assert.equal(once[0].url, a.url)
  assert.equal(once[0].snapshot.id, a.id)
  assert.ok(typeof once[0].addedAt === 'number')

  const twice = addWatch(a)
  assert.equal(twice.length, 1, 'watching the same car twice changes nothing')

  addWatch(listing('sample:2', '2017 Mazda MX-5 Miata Club'))
  assert.equal(listWatch().length, 2)

  assert.equal(removeWatch('sample:1').length, 1)
  assert.equal(removeWatch('sample:1').length, 1, 'removing a car that is not there changes nothing')
  assert.equal(listWatch()[0].listingId, 'sample:2')
  assert.equal(removeWatch('sample:2').length, 0)
})

test('paper bids: place, list, set the outcome, summarise', () => {
  assert.deepEqual(listPaper(), [])
  const a = listing('sample:3', '2019 Toyota Camry SE')
  const bid = placePaperBid(a, 12_500, '  first practice bid  ')
  assert.match(bid.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.equal(bid.mode, 'PAPER')
  assert.equal(bid.outcome, 'open')
  assert.equal(bid.listingId, 'sample:3')
  assert.equal(bid.title, a.title)
  assert.equal(bid.url, a.url)
  assert.equal(bid.maxBidUsd, 12_500)
  assert.equal(bid.note, 'first practice bid')
  assert.ok(typeof bid.placedAt === 'number')

  const second = placePaperBid(listing('sample:4', '2016 Ford Mustang GT Premium'), 15_200.456)
  assert.equal(second.maxBidUsd, 15_200.46, 'rounded to cents')
  assert.equal(second.note, undefined)

  assert.equal(listPaper().length, 2)
  assert.deepEqual(paperSummary(), { open: 2, won: 0, lost: 0, withdrawn: 0, totalMaxUsd: 27_700.46 })

  const won = setOutcome(bid.id, 'won')
  assert.equal(won?.outcome, 'won')
  assert.equal(listPaper().find((b) => b.id === bid.id)?.outcome, 'won', 'persisted')
  assert.equal(setOutcome(second.id, 'withdrawn')?.outcome, 'withdrawn')
  assert.equal(setOutcome('no-such-id', 'lost'), undefined)
  assert.equal(setOutcome(bid.id, 'maybe' as 'won'), undefined, 'an unknown outcome is refused')

  assert.deepEqual(paperSummary(), { open: 0, won: 1, lost: 0, withdrawn: 1, totalMaxUsd: 27_700.46 })
})

test('paper bids: bad amounts are rejected and nothing is saved', () => {
  const before = listPaper().length
  const a = listing('sample:5', '2015 Subaru WRX Limited')
  for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '12500' as unknown as number, undefined as unknown as number]) {
    assert.throws(() => placePaperBid(a, bad), /positive number of dollars/)
  }
  assert.equal(listPaper().length, before)
})
