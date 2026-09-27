/** Tests for src/fees.ts — published fee schedules, the unknown sliding scale, overrides. Offline. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FEE_SCHEDULES, buyerFee, feeScheduleFor } from '../src/fees.ts'
import { AUCTION_HOUSES } from '../src/sources/directory.ts'

test('every auction house in the directory has a fee schedule', () => {
  for (const h of AUCTION_HOUSES) {
    assert.ok(feeScheduleFor(h.id), `missing fee schedule for ${h.id}`)
  }
})

test('every schedule has a note and a verify link, and no percent unless basis is percent', () => {
  for (const s of FEE_SCHEDULES) {
    assert.ok(s.note.length > 10, s.houseId)
    assert.ok(s.verifyUrl.startsWith('https://'), s.houseId)
    if (s.basis !== 'percent') assert.equal(s.percent, undefined, `${s.houseId} must not invent a percent`)
  }
})

test('eBay charges no buyer fee on vehicles', () => {
  const f = buyerFee('ebay', 10_000)
  assert.equal(f.usd, 0)
  assert.ok(f.basis.startsWith('none'), f.basis)
  assert.ok(f.verifyUrl)
})

test('Cars & Bids and Bring a Trailer: 5% with a $250 minimum and $7,500 maximum', () => {
  for (const id of ['carsandbids', 'bat']) {
    assert.equal(buyerFee(id, 20_000).usd, 1_000, id)
    assert.equal(buyerFee(id, 1_000).usd, 250, `${id} min`)
    assert.equal(buyerFee(id, 500_000).usd, 7_500, `${id} max`)
    const f = buyerFee(id, 20_000)
    assert.ok(f.basis.includes('5%'), f.basis)
    assert.ok(f.basis.includes('verify'), f.basis)
    assert.ok(f.verifyUrl)
  }
})

test('collector auctions: 10% with no published min or max', () => {
  assert.equal(buyerFee('collector', 10_000).usd, 1_000)
  assert.equal(buyerFee('collector', 200_000).usd, 20_000)
})

test('sliding-scale houses return $0 and an "unknown — sliding scale" basis', () => {
  for (const id of ['copart', 'iaa', 'manheim', 'adesa', 'acv']) {
    const f = buyerFee(id, 10_000)
    assert.equal(f.usd, 0, id)
    assert.equal(f.basis, "unknown — sliding scale; enter the fee from the house's calculator", id)
    assert.ok(f.verifyUrl, id)
  }
})

test('stated-per-lot houses return $0 and an "unknown" basis', () => {
  for (const id of ['govdeals', 'local']) {
    const f = buyerFee(id, 10_000)
    assert.equal(f.usd, 0, id)
    assert.ok(f.basis.startsWith('unknown'), f.basis)
  }
})

test('an override percent always wins, even for a sliding-scale house or eBay', () => {
  const copart = buyerFee('copart', 10_000, 10)
  assert.equal(copart.usd, 1_000)
  assert.ok(copart.basis.includes('10%'), copart.basis)
  assert.ok(!copart.basis.startsWith('unknown'))
  assert.equal(buyerFee('ebay', 10_000, 5).usd, 500)
  assert.equal(buyerFee('carsandbids', 100_000, 2.5).usd, 2_500)
  assert.equal(buyerFee('copart', 10_000, 0).usd, 0)
})

test('an unknown house id or the sample source returns $0 and an "unknown" basis', () => {
  assert.equal(buyerFee('nowhere', 10_000).usd, 0)
  assert.ok(buyerFee('nowhere', 10_000).basis.startsWith('unknown'))
  assert.equal(buyerFee('sample', 10_000).usd, 0)
  assert.ok(buyerFee('sample', 10_000).basis.startsWith('unknown'))
})

test('a hammer price that is not a positive number is treated as $0', () => {
  assert.equal(buyerFee('collector', -5).usd, 0)
  assert.equal(buyerFee('collector', Number.NaN).usd, 0)
  assert.equal(buyerFee('ebay', -5, 5).usd, 0)
})
