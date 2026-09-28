import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COVERAGE_PLANS, EXTRAS, TRIP_FEE_PCT, getPlan } from '../catalog.ts'
import { allInDaily, discountFor, pct, quote } from '../pricing.ts'

const plus = getPlan('plus')
const base = {
  dailyRateCents: 8000,
  weeklyDiscountPct: 10,
  monthlyDiscountPct: 20,
  plan: plus,
  delivery: false,
  deliveryFeeCents: 0,
  extras: [],
  taxRate: 0.1,
  youngDriverFeeCents: 0,
}

describe('quote', () => {
  it('prices a short trip with the flat trip fee and untaxed coverage', () => {
    const q = quote({ ...base, days: 3 })
    assert.equal(q.tripCents, 24000)
    assert.equal(q.tripFeeCents, pct(24000, TRIP_FEE_PCT))
    assert.equal(q.protectionCents, Math.max(pct(24000, plus.pctOfTrip), plus.minPerDayCents * 3))
    assert.equal(q.taxCents, pct(24000 + q.tripFeeCents, 10))
    assert.equal(q.depositCents, plus.depositCents)
  })

  it('applies the coverage daily minimum on cheap cars', () => {
    const q = quote({ ...base, dailyRateCents: 2000, days: 2 })
    assert.equal(q.protectionCents, plus.minPerDayCents * 2)
  })

  it('taxes the young driver fee and lists it', () => {
    const q = quote({ ...base, days: 2, youngDriverFeeCents: 3800 })
    assert.equal(q.youngDriverCents, 3800)
    assert.ok(q.lines.some((l) => l.id === 'young' && l.cents === 3800))
    assert.equal(q.taxCents, pct(16000 + q.tripFeeCents + 3800, 10))
  })

  it('makes the lines add up to the total for every plan', () => {
    for (const plan of COVERAGE_PLANS) {
      const q = quote({ ...base, days: 9, plan, delivery: true, deliveryFeeCents: 3500, extras: EXTRAS, youngDriverFeeCents: 12900 })
      assert.equal(q.lines.reduce((s, l) => s + l.cents, 0), q.totalCents, plan.id)
    }
  })

  it('discounts weekly and monthly trips', () => {
    assert.equal(discountFor(6, 10, 20), 0)
    assert.equal(discountFor(7, 10, 20), 10)
    assert.equal(discountFor(30, 10, 20), 20)
  })

  it('computes an all-in daily price that is never below the rate', () => {
    const a = allInDaily(8000, plus.pctOfTrip, plus.minPerDayCents)
    assert.equal(a, 8000 + 960 + Math.max(2800, 1500))
    assert.ok(allInDaily(1000, plus.pctOfTrip, plus.minPerDayCents) > 1000)
  })
})
