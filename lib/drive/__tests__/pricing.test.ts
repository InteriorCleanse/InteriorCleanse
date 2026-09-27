import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EXTRAS, PROTECTION_PLANS, TRIP_FEE_PCT, getPlan } from '../catalog.ts'
import { discountFor, extrasTotal, hostMonthlyEstimate, pct, quote } from '../pricing.ts'

const standard = getPlan('standard')

describe('pct', () => {
  it('rounds half up on cents', () => {
    assert.equal(pct(1000, 10), 100)
    assert.equal(pct(1001, 10), 100)
    assert.equal(pct(1005, 10), 101)
  })
})

describe('discountFor', () => {
  it('gives nothing under a week', () => {
    assert.equal(discountFor(6, 10, 20), 0)
  })
  it('gives the weekly rate from seven days', () => {
    assert.equal(discountFor(7, 10, 20), 10)
    assert.equal(discountFor(29, 10, 20), 10)
  })
  it('gives the monthly rate from thirty days, and never a zero monthly over a weekly', () => {
    assert.equal(discountFor(30, 10, 20), 20)
    assert.equal(discountFor(30, 10, 0), 10)
  })
})

describe('quote', () => {
  const base = {
    dailyRateCents: 8000,
    weeklyDiscountPct: 10,
    monthlyDiscountPct: 20,
    plan: standard,
    delivery: false,
    deliveryFeeCents: 0,
    extras: [],
    taxRate: 0.1,
  }

  it('itemises a three-day trip with no discount', () => {
    const q = quote({ ...base, days: 3 })
    assert.equal(q.baseCents, 24000)
    assert.equal(q.discountCents, 0)
    assert.equal(q.tripCents, 24000)
    assert.equal(q.tripFeeCents, pct(24000, TRIP_FEE_PCT))
    assert.equal(q.protectionCents, pct(24000, standard.pctOfTrip))
    // Protection is not taxed.
    assert.equal(q.taxCents, pct(24000 + q.tripFeeCents, 10))
    assert.equal(q.totalCents, q.tripCents + q.tripFeeCents + q.protectionCents + q.taxCents)
    assert.deepEqual(
      q.lines.map((l) => l.id),
      ['trip', 'fee', 'protection', 'tax'],
    )
  })

  it('applies the weekly discount before fees and protection', () => {
    const q = quote({ ...base, days: 7 })
    assert.equal(q.discountPct, 10)
    assert.equal(q.discountCents, 5600)
    assert.equal(q.tripCents, 50400)
    assert.equal(q.tripFeeCents, 5040)
    assert.ok(q.lines.some((l) => l.id === 'discount' && l.cents === -5600))
  })

  it('adds delivery and extras, per trip and per day', () => {
    const childSeat = EXTRAS.find((e) => e.id === 'child-seat')!
    const refuel = EXTRAS.find((e) => e.id === 'prepaid-refuel')!
    const q = quote({ ...base, days: 2, delivery: true, deliveryFeeCents: 3500, extras: [childSeat, refuel] })
    assert.equal(q.deliveryCents, 3500)
    assert.equal(q.extrasCents, 2 * 1000 + 4500)
    assert.equal(extrasTotal([childSeat, refuel], 2), 6500)
  })

  it('never bills less than one day', () => {
    assert.equal(quote({ ...base, days: 0 }).days, 1)
    assert.equal(quote({ ...base, days: 0.4 }).days, 1)
  })

  it('makes the lines sum to the total for every plan', () => {
    for (const plan of PROTECTION_PLANS) {
      const q = quote({ ...base, days: 9, plan, delivery: true, deliveryFeeCents: 2500, extras: EXTRAS })
      const sum = q.lines.reduce((s, l) => s + l.cents, 0)
      assert.equal(sum, q.totalCents, plan.id)
    }
  })
})

describe('hostMonthlyEstimate', () => {
  it('pays the host their share of the booked days and clamps the days', () => {
    assert.equal(hostMonthlyEstimate(10000, 10), 75000)
    assert.equal(hostMonthlyEstimate(10000, 40), pct(10000 * 31, 75))
    assert.equal(hostMonthlyEstimate(10000, -3), 0)
  })
})
