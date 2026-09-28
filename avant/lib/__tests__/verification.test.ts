import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { recordFromOutcome } from '../verification/outcome.ts'

const EMPTY = {
  v: 1 as const,
  age: null,
  licenceYears: null,
  licenceExpires: null,
  licenceState: null,
  cleanRecord: false,
  verified: false,
  method: null,
  verifiedAt: null,
  providerRef: null,
  pendingProviderRef: 'vs_1',
  attestedLicenceYears: 4,
}

describe('recordFromOutcome', () => {
  it('keeps only derived facts from a verified licence', () => {
    const r = recordFromOutcome(
      EMPTY,
      { status: 'verified', recordKey: 'k', dob: { day: 2, month: 3, year: 2004 }, expires: { day: 1, month: 7, year: 2030 }, issuingState: 'ny' },
      'vs_1',
      '2026-09-28',
    )
    assert.equal(r.verified, true)
    assert.equal(r.age, 22)
    assert.equal(r.licenceExpires, '2030-07')
    assert.equal(r.licenceState, 'NY')
    assert.equal(r.licenceYears, 4)
    assert.equal(r.pendingProviderRef, null)
    assert.equal(JSON.stringify(r).includes('2004'), false, 'no birth date survives')
  })

  it('stays unverified while processing or after a failed check', () => {
    const processing = recordFromOutcome(EMPTY, { status: 'processing', recordKey: 'k', dob: null, expires: null, issuingState: null }, 'vs_1', '2026-09-28')
    assert.equal(processing.verified, false)
    assert.equal(processing.pendingProviderRef, 'vs_1')
    const failed = recordFromOutcome(EMPTY, { status: 'requires_input', recordKey: 'k', dob: null, expires: null, issuingState: null }, 'vs_1', '2026-09-28')
    assert.equal(failed.verified, false)
    assert.equal(failed.pendingProviderRef, null)
  })
})
