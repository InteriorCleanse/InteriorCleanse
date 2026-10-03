import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FREE_CANCEL_HOURS, HOST_SHARE_PCT } from '../catalog.ts'
import { cancellationOutcome, hostEarnings, requestExpired, REQUEST_HOURS, zonedTime } from '../policy.ts'

const HOUR = 3_600_000

describe('zonedTime', () => {
  it('reads a pickup time in the city’s own zone, across daylight saving', () => {
    // Denver is UTC-6 in summer and UTC-7 in winter.
    assert.equal(new Date(zonedTime('2026-07-01', '10:00', 'America/Denver')).toISOString(), '2026-07-01T16:00:00.000Z')
    assert.equal(new Date(zonedTime('2026-12-01', '10:00', 'America/Denver')).toISOString(), '2026-12-01T17:00:00.000Z')
    assert.equal(new Date(zonedTime('2026-03-08', '09:30', 'America/New_York')).toISOString(), '2026-03-08T13:30:00.000Z')
  })
})

describe('cancellationOutcome', () => {
  const q = { totalCents: 40_000, days: 4 }
  const pickup = Date.UTC(2026, 9, 10, 16)

  it('refunds everything until the free window closes', () => {
    const out = cancellationOutcome(q, pickup, pickup - FREE_CANCEL_HOURS * HOUR, 'guest')
    assert.deepEqual(out, { refundCents: 40_000, keptCents: 0, free: true })
  })

  it('keeps a day’s share inside the window', () => {
    const out = cancellationOutcome(q, pickup, pickup - 2 * HOUR, 'guest')
    assert.deepEqual(out, { refundCents: 30_000, keptCents: 10_000, free: false })
  })

  it('keeps a one-day trip in full inside the window', () => {
    assert.equal(cancellationOutcome({ totalCents: 9_999, days: 1 }, pickup, pickup - HOUR, 'guest').refundCents, 0)
  })

  it('always refunds in full when the host cancels', () => {
    assert.equal(cancellationOutcome(q, pickup, pickup + HOUR, 'host').refundCents, 40_000)
  })
})

describe('hostEarnings', () => {
  const q = { tripCents: 30_000, days: 3, deliveryCents: 3_500, extrasCents: 1_000 }

  it('pays the host share of the trip plus delivery and extras', () => {
    assert.equal(hostEarnings(q, 'completed'), (30_000 * HOST_SHARE_PCT) / 100 + 3_500 + 1_000)
  })

  it('pays only the share of the kept day on a late cancellation', () => {
    assert.equal(hostEarnings(q, 'late-cancel'), (10_000 * HOST_SHARE_PCT) / 100)
  })
})

describe('requestExpired', () => {
  it('expires a request the host has not answered in time', () => {
    assert.equal(requestExpired(0, REQUEST_HOURS * HOUR - 1), false)
    assert.equal(requestExpired(0, REQUEST_HOURS * HOUR), true)
  })
})
