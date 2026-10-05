import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canRecord, canReport, mileage, validReading } from '../trip-record.ts'

describe('trip record rules', () => {
  it('opens pickup the day before and return once the trip starts', () => {
    assert.equal(canRecord('pickup', '2026-10-10', '2026-10-12', '2026-10-09', false), true)
    assert.equal(canRecord('pickup', '2026-10-10', '2026-10-12', '2026-10-08', false), false)
    assert.equal(canRecord('return', '2026-10-10', '2026-10-12', '2026-10-12', false), false, 'needs a pickup reading')
    assert.equal(canRecord('return', '2026-10-10', '2026-10-12', '2026-10-12', true), true)
    assert.equal(canRecord('return', '2026-10-10', '2026-10-12', '2026-10-14', true), false)
  })

  it('gives hosts three days after the trip to report, and guests the trip itself', () => {
    assert.equal(canReport('host', '2026-10-10', '2026-10-12', '2026-10-15'), true)
    assert.equal(canReport('host', '2026-10-10', '2026-10-12', '2026-10-16'), false)
    assert.equal(canReport('guest', '2026-10-10', '2026-10-12', '2026-10-13'), true)
    assert.equal(canReport('guest', '2026-10-10', '2026-10-12', '2026-10-14'), false)
    assert.equal(canReport('host', '2026-10-10', '2026-10-12', '2026-10-09'), false)
  })

  it('counts miles against the allowance', () => {
    assert.deepEqual(mileage(1000, 1650, 3, 200, false), { driven: 650, allowance: 600, over: 50 })
    assert.deepEqual(mileage(1000, 1650, 3, 200, true), { driven: 650, allowance: null, over: 0 })
    assert.equal(mileage(1000, null, 3, 200, false), null)
  })

  it('refuses readings that cannot be right', () => {
    assert.equal(validReading('pickup', 42000, 80, null), null)
    assert.match(validReading('return', 41000, 80, 42000)!, /lower/)
    assert.match(validReading('return', 99000, 80, 42000)!, /more miles/)
    assert.match(validReading('pickup', 42000, 120, null)!, /percentage/)
    assert.match(validReading('pickup', 1.5, 50, null)!, /whole miles/)
  })
})
