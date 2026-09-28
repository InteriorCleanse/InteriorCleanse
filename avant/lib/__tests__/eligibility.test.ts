import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ageOn, checkEligibility, youngDriverFee } from '../eligibility.ts'
import type { DriverFacts } from '../types.ts'

const TODAY = '2026-09-28'
const driver = (over: Partial<DriverFacts>): DriverFacts => ({
  age: 30,
  licenceYears: 8,
  licenceExpires: '2029-05',
  licenceState: 'CA',
  cleanRecord: false,
  verified: true,
  ...over,
})

describe('ageOn', () => {
  it('counts whole years and respects the birthday', () => {
    assert.equal(ageOn('2005-09-28', TODAY), 21)
    assert.equal(ageOn('2005-09-29', TODAY), 20)
    assert.equal(ageOn('2008-02-29', '2026-02-28'), 17)
  })
})

describe('youngDriverFee', () => {
  it('charges by band, caps per trip, halves for a clean record', () => {
    assert.equal(youngDriverFee(30, 5, false), 0)
    assert.equal(youngDriverFee(19, 2, false), 5800)
    assert.equal(youngDriverFee(19, 30, false), 19900)
    assert.equal(youngDriverFee(22, 3, false), 5700)
    assert.equal(youngDriverFee(22, 30, false), 12900)
    assert.equal(youngDriverFee(22, 30, true), 6450)
    assert.equal(youngDriverFee(null, 3, false), 0)
  })
})

describe('checkEligibility', () => {
  it('requires verification first', () => {
    const e = checkEligibility(driver({ verified: false, age: null }), 'everyday', null, TODAY)
    assert.deepEqual(e.reasons, ['unverified'])
  })

  it('lets an 18-year-old book everyday cars but not premium', () => {
    assert.equal(checkEligibility(driver({ age: 18, licenceYears: 1 }), 'everyday', null, TODAY).ok, true)
    assert.deepEqual(checkEligibility(driver({ age: 18, licenceYears: 1 }), 'premium', null, TODAY).reasons, ['tier-age'])
  })

  it('keeps luxury and exotic at 25+, exotic with five years licensed', () => {
    assert.deepEqual(checkEligibility(driver({ age: 24 }), 'luxury', null, TODAY).reasons, ['tier-age'])
    assert.deepEqual(checkEligibility(driver({ age: 27, licenceYears: 3 }), 'exotic', null, TODAY).reasons, ['licence-new'])
    assert.equal(checkEligibility(driver({ age: 27, licenceYears: 6 }), 'exotic', null, TODAY).ok, true)
  })

  it('refuses expired licences and licences that expire mid-trip', () => {
    assert.deepEqual(checkEligibility(driver({ licenceExpires: '2026-08' }), 'everyday', null, TODAY).reasons, ['licence-expired'])
    assert.deepEqual(checkEligibility(driver({ licenceExpires: '2026-10' }), 'everyday', '2026-11-02', TODAY).reasons, ['licence-expires-during-trip'])
    assert.equal(checkEligibility(driver({ licenceExpires: '2026-10' }), 'everyday', '2026-10-20', TODAY).ok, true)
  })

  it('reports the young driver rate for the caller', () => {
    const e = checkEligibility(driver({ age: 22, cleanRecord: true }), 'everyday', null, TODAY)
    assert.equal(e.youngDriverPerDayCents, 950)
    assert.equal(e.youngDriverCapCents, 6450)
  })
})
