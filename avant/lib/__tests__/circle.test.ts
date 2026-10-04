import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getPlan, TRIP_FEE_PCT } from '../catalog.ts'
import { CIRCLE_TIERS, circleSavings, creditToApply, MIN_CARD_CHARGE_CENTS, nextTier, referralCode, splitRefund, tierFor } from '../circle.ts'
import { cancellationOutcome } from '../policy.ts'
import { pct, quote } from '../pricing.ts'

const base = {
  dailyRateCents: 10_000,
  days: 4,
  weeklyDiscountPct: 10,
  monthlyDiscountPct: 20,
  plan: getPlan('plus'),
  delivery: false,
  deliveryFeeCents: 0,
  extras: [],
  taxRate: 0.1,
  youngDriverFeeCents: 0,
}

describe('AVANT Circle', () => {
  it('moves up a tier with completed trips', () => {
    assert.equal(tierFor(0).id, 'member')
    assert.equal(tierFor(3).id, 'silver')
    assert.equal(tierFor(10).id, 'gold')
    assert.deepEqual(nextTier(1), { tier: CIRCLE_TIERS[1], tripsToGo: 2 })
    assert.equal(nextTier(25), null)
  })

  it('never charges more than the standard fee, and the fee only falls', () => {
    for (let i = 1; i < CIRCLE_TIERS.length; i++) assert.ok(CIRCLE_TIERS[i].feePct < CIRCLE_TIERS[i - 1].feePct)
    assert.equal(CIRCLE_TIERS[0].feePct, TRIP_FEE_PCT)
  })

  it('prices the trip fee at the guest’s tier and says what it saved', () => {
    const gold = tierFor(10)
    const standard = quote(base)
    const q = quote({ ...base, circle: { tier: gold.name, feePct: gold.feePct, freeCancelHours: gold.freeCancelHours } })
    assert.equal(q.tripFeeCents, pct(40_000, gold.feePct))
    assert.equal(q.circle?.savedCents, circleSavings(40_000, gold))
    assert.equal(standard.totalCents - q.totalCents, Math.round(circleSavings(40_000, gold) * 1.1), 'the saving carries through tax')
    assert.match(q.lines.find((l) => l.id === 'fee')!.label, /Circle Gold/)
  })

  it('gives Gold a later free-cancellation window', () => {
    const gold = tierFor(10)
    const q = quote({ ...base, circle: { tier: gold.name, feePct: gold.feePct, freeCancelHours: gold.freeCancelHours } })
    const pickup = Date.UTC(2026, 9, 10, 16)
    const sixteenHoursBefore = pickup - 16 * 3_600_000
    assert.equal(cancellationOutcome(q, pickup, sixteenHoursBefore, 'guest').free, true)
    assert.equal(cancellationOutcome(quote(base), pickup, sixteenHoursBefore, 'guest').free, false)
  })
})

describe('AVANT credit', () => {
  it('applies credit up to the total, leaving the smallest card charge when payments are live', () => {
    assert.equal(creditToApply(2_500, 40_000, true), 2_500)
    assert.equal(creditToApply(90_000, 40_000, true), 40_000 - MIN_CARD_CHARGE_CENTS)
    assert.equal(creditToApply(90_000, 40_000, false), 40_000)
    assert.equal(creditToApply(0, 40_000, true), 0)
  })

  it('returns credit as credit and money as money, in proportion', () => {
    assert.deepEqual(splitRefund(40_000, 40_000, 5_000), { cardCents: 35_000, creditCents: 5_000 })
    assert.deepEqual(splitRefund(30_000, 40_000, 5_000), { cardCents: 26_250, creditCents: 3_750 })
    assert.deepEqual(splitRefund(30_000, 40_000, 0), { cardCents: 30_000, creditCents: 0 })
    assert.deepEqual(splitRefund(0, 40_000, 5_000), { cardCents: 0, creditCents: 0 })
  })

  it('makes readable referral codes', () => {
    const code = referralCode(new Uint8Array([0, 1, 2, 3, 4, 250, 255, 9]))
    assert.match(code, /^[A-HJ-NP-Z2-9]{7}$/)
  })
})
