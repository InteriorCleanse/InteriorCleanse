import { describe, expect, it } from 'vitest'
import { MIN_INTERVAL_MS, isCalendarDue, tokenToStore } from '@/lib/calendar/sync'

/**
 * The two decisions in calendar refresh that quietly kill a connection when
 * wrong. Everything else in `lib/calendar/sync.ts` is plumbing over the vault
 * and the vendor, and is covered by the OAuth tests and the RLS assertions on
 * calendar credentials.
 */

describe('isCalendarDue', () => {
  const now = new Date('2025-06-01T12:00:00Z')

  it('refreshes a connection that has never synced', () => {
    expect(isCalendarDue({ status: 'connected', last_synced_at: null }, now)).toBe(true)
  })

  it('does not refresh more often than the minimum interval, however often cron fires', () => {
    const recent = new Date(now.getTime() - MIN_INTERVAL_MS + 60_000).toISOString()
    expect(isCalendarDue({ status: 'connected', last_synced_at: recent }, now)).toBe(false)
  })

  it('refreshes once the interval has passed', () => {
    const stale = new Date(now.getTime() - MIN_INTERVAL_MS).toISOString()
    expect(isCalendarDue({ status: 'connected', last_synced_at: stale }, now)).toBe(true)
  })

  it('retries a degraded connection but never a revoked one', () => {
    // Degraded is a vendor having a bad minute; revoked is a person who must
    // reconnect. Retrying the second on a schedule forever is noise at best
    // and, for a provider counting failed grants, a lockout at worst.
    const stale = new Date(now.getTime() - 86_400_000).toISOString()
    expect(isCalendarDue({ status: 'degraded', last_synced_at: stale }, now)).toBe(true)
    expect(isCalendarDue({ status: 'revoked', last_synced_at: stale }, now)).toBe(false)
    expect(isCalendarDue({ status: 'not_connected', last_synced_at: null }, now)).toBe(false)
  })
})

describe('tokenToStore', () => {
  it('keeps the existing token when the provider returns none', () => {
    // Google's behaviour. Overwriting with nothing would end the connection at
    // the next refresh.
    expect(tokenToStore('original', null)).toBeNull()
  })

  it('keeps the existing token when the provider returns the same one', () => {
    // No write, so the vault row is not re-sealed for nothing.
    expect(tokenToStore('original', 'original')).toBeNull()
  })

  it('stores a rotated token', () => {
    // Microsoft's behaviour. The old one is dead the moment the new one is
    // issued; failing to store it is a connection that works exactly once more.
    expect(tokenToStore('original', 'rotated')).toBe('rotated')
  })
})
