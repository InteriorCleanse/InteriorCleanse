import { describe, expect, it } from 'vitest'
import { briefingDedupeKey, dueBriefings, localMoment } from '@/lib/notifications/schedule'
import { isCronAuthorized, timingSafeEqual } from '@/lib/cron'

describe('localMoment', () => {
  it('reports the recipient’s local date, not the server’s', () => {
    // 23:30 UTC on the 1st is already the 2nd in Tokyo and still the 1st in
    // New York. A briefing dated by the server would be wrong for both.
    const at = new Date('2025-06-01T23:30:00Z')
    expect(localMoment('Asia/Tokyo', at).date).toBe('2025-06-02')
    expect(localMoment('America/New_York', at).date).toBe('2025-06-01')
  })

  it('follows daylight saving', () => {
    expect(localMoment('Europe/London', new Date('2025-01-15T08:00:00Z')).hour).toBe(8)
    expect(localMoment('Europe/London', new Date('2025-07-15T08:00:00Z')).hour).toBe(9)
  })

  it('normalises midnight to hour 0 rather than 24', () => {
    // Some locale/zone combinations render midnight as "24", which would never
    // match an hour comparison and would silently drop a briefing.
    expect(localMoment('UTC', new Date('2025-06-01T00:15:00Z')).hour).toBe(0)
  })

  it('reports weekday with Sunday as 0, matching Date#getDay', () => {
    // 2025-06-02 is a Monday.
    expect(localMoment('UTC', new Date('2025-06-02T09:00:00Z')).weekday).toBe(1)
    expect(localMoment('UTC', new Date('2025-06-01T09:00:00Z')).weekday).toBe(0)
  })

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    const at = new Date('2025-06-01T09:00:00Z')
    expect(localMoment('Nowhere/Real', at).hour).toBe(9)
  })
})

describe('dueBriefings', () => {
  const moment = (over: Partial<ReturnType<typeof localMoment>> = {}) => ({
    hour: 8,
    weekday: 3,
    dayOfMonth: 15,
    date: '2025-06-15',
    ...over,
  })

  it('sends only what the person subscribed to', () => {
    expect(dueBriefings(['morning'], moment())).toEqual(['morning'])
    expect(dueBriefings([], moment())).toEqual([])
  })

  it('sends nothing outside the scheduled hour', () => {
    expect(dueBriefings(['morning'], moment({ hour: 9 }))).toEqual([])
  })

  it('does not send a late briefing when an hour was missed', () => {
    // A briefing is a statement about a moment. An hour late is fine; a day
    // late is misinformation, so the window is exactly one hour.
    expect(dueBriefings(['morning'], moment({ hour: 11 }))).toEqual([])
  })

  it('sends the weekly on Monday only', () => {
    expect(dueBriefings(['weekly'], moment({ weekday: 1 }))).toEqual(['weekly'])
    expect(dueBriefings(['weekly'], moment({ weekday: 2 }))).toEqual([])
  })

  it('sends the monthly on the first only', () => {
    expect(dueBriefings(['monthly'], moment({ dayOfMonth: 1 }))).toEqual(['monthly'])
    expect(dueBriefings(['monthly'], moment({ dayOfMonth: 2 }))).toEqual([])
  })

  it('can send several at once on a Monday the first', () => {
    const due = dueBriefings(['morning', 'weekly', 'monthly'], {
      hour: 8,
      weekday: 1,
      dayOfMonth: 1,
      date: '2025-09-01',
    })
    expect(due).toEqual(['morning', 'weekly', 'monthly'])
  })

  it('ignores a subscription to something that is not a briefing', () => {
    expect(dueBriefings(['nonsense'], moment())).toEqual([])
  })
})

describe('briefingDedupeKey', () => {
  const moment = { hour: 8, weekday: 1, dayOfMonth: 1, date: '2025-06-01' }

  it('is stable within a period, so a double-fired scheduler sends once', () => {
    expect(briefingDedupeKey('morning', 'u1', moment)).toBe(
      briefingDedupeKey('morning', 'u1', { ...moment, hour: 9 }),
    )
  })

  it('differs per person, because two people subscribe to different things', () => {
    expect(briefingDedupeKey('morning', 'u1', moment)).not.toBe(
      briefingDedupeKey('morning', 'u2', moment),
    )
  })

  it('collapses a monthly briefing to the month', () => {
    expect(briefingDedupeKey('monthly', 'u1', moment)).toContain('2025-06')
    expect(briefingDedupeKey('monthly', 'u1', moment)).not.toContain('2025-06-01')
  })

  it('separates the morning and evening briefings on the same day', () => {
    expect(briefingDedupeKey('morning', 'u1', moment)).not.toBe(
      briefingDedupeKey('end_of_day', 'u1', moment),
    )
  })
})

describe('cron authorization', () => {
  const request = (headers: Record<string, string>) =>
    new Request('https://x.example.com/api/cron', { headers })

  it('refuses everything when no secret is configured', () => {
    delete process.env.CRON_SECRET
    expect(isCronAuthorized(request({ 'x-cron-secret': 'anything' }))).toBe(false)
  })

  it('accepts the configured secret', () => {
    process.env.CRON_SECRET = 'topsecretvalue'
    expect(isCronAuthorized(request({ 'x-cron-secret': 'topsecretvalue' }))).toBe(true)
    expect(isCronAuthorized(request({ 'x-cron-secret': 'wrong-value-xx' }))).toBe(false)
    delete process.env.CRON_SECRET
  })

  it('accepts a bearer token, so the platform scheduler needs no second secret', () => {
    process.env.CRON_SECRET = 'topsecretvalue'
    expect(isCronAuthorized(request({ authorization: 'Bearer topsecretvalue' }))).toBe(true)
    delete process.env.CRON_SECRET
  })

  it('compares in constant time', () => {
    // A comparison that returns early on the first differing byte leaks the
    // length of the matching prefix, which is enough to recover the secret.
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('', '')).toBe(true)
  })
})
