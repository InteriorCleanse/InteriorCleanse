import { describe, expect, it } from 'vitest'
import {
  CONNECTORS,
  connector,
  validateCredential,
} from '@/lib/integrations/registry'
import { shopifyToken, stripeLiveKey, stripeRestrictedTestKey } from './fixtures/secrets'
import {
  assessConnection,
  summariseHealth,
  type ConnectionRecord,
} from '@/lib/integrations/health'
import { buildIcalFeed, escapeText, foldLine } from '@/lib/calendar/ical'

const NOW = new Date('2026-06-01T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)

function record(over: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    provider: 'stripe',
    displayName: 'Stripe',
    status: 'connected',
    statusDetail: null,
    lastSuccessAt: hoursAgo(1),
    lastAttemptAt: hoursAgo(1),
    ...over,
  }
}

describe('connector registry', () => {
  it('states what each connector cannot tell you, not just what it can', () => {
    for (const c of CONNECTORS) {
      expect(c.provides.length).toBeGreaterThan(0)
      // A connected integration implies completeness to most people. The gap
      // has to be written down next to the connector or it becomes a wrong
      // number three months later.
      expect(c.doesNotProvide.length).toBeGreaterThan(0)
      expect(c.purpose.length).toBeGreaterThan(20)
    }
  })

  it('is honest about which connectors are not built yet', () => {
    const planned = CONNECTORS.filter((c) => c.status === 'planned')
    const available = CONNECTORS.filter((c) => c.status === 'available')
    expect(available.length).toBeGreaterThan(0)
    expect(planned.every((c) => c.credentials.length >= 0)).toBe(true)
  })

  it('rejects a key from the wrong vendor before it is ever stored', () => {
    const stripe = connector('stripe')!
    const wrong = validateCredential(stripe, 'api_key', shopifyToken('abcdefghijklmnop'))
    expect(wrong.ok).toBe(false)
    expect(wrong.ok === false && wrong.reason).toMatch(/Stripe secret key/i)
  })

  it('accepts a well-formed key', () => {
    const stripe = connector('stripe')!
    expect(validateCredential(stripe, 'api_key', stripeLiveKey('51QxAbCdEfGhIjKlMnOp')).ok).toBe(true)
    expect(validateCredential(stripe, 'api_key', stripeRestrictedTestKey('51QxAbCdEfGhIjKlMnOp')).ok).toBe(true)
  })

  it('rejects an empty value with a field-specific message', () => {
    const stripe = connector('stripe')!
    const result = validateCredential(stripe, 'api_key', '   ')
    expect(result.ok === false && result.reason).toMatch(/Secret key is required/)
  })

  it('rejects a field the connector does not take', () => {
    const stripe = connector('stripe')!
    expect(validateCredential(stripe, 'shop_domain', 'x').ok).toBe(false)
  })

  it('validates a Shopify shop domain through its settings schema', () => {
    const shopify = connector('shopify')!
    expect(shopify.settings!.safeParse({ shopDomain: 'my-shop.myshopify.com' }).success).toBe(true)
    expect(shopify.settings!.safeParse({ shopDomain: 'my-shop.com' }).success).toBe(false)
  })

  it('needs no credentials for CSV, so it works with no keys at all', () => {
    expect(connector('csv')!.credentials).toHaveLength(0)
  })
})

describe('integration health', () => {
  it('calls a recently synced connection healthy', () => {
    const health = assessConnection(record(), NOW)
    expect(health.tone).toBe('ok')
    expect(health.dataIsCurrent).toBe(true)
  })

  it('treats a connection that authenticated days ago as stale, not healthy', () => {
    // The distinction the whole module exists for: "connected" is a statement
    // about credentials, not about whether today's numbers are real.
    const health = assessConnection(record({ lastSuccessAt: hoursAgo(96) }), NOW)
    expect(health.tone).toBe('bad')
    expect(health.dataIsCurrent).toBe(false)
    expect(health.detail).toMatch(/4 days ago/)
  })

  it('flags a connection that is merely behind', () => {
    const health = assessConnection(record({ lastSuccessAt: hoursAgo(30) }), NOW)
    expect(health.tone).toBe('warn')
    expect(health.dataIsCurrent).toBe(false)
  })

  it('distinguishes a revoked credential from a transient failure', () => {
    const revoked = assessConnection(record({ status: 'revoked' }), NOW)
    expect(revoked.label).toMatch(/revoked/i)
    expect(revoked.detail).toMatch(/rotated or deleted/i)

    const failing = assessConnection(record({ status: 'error' }), NOW)
    expect(failing.label).toBe('Failing')
  })

  it('says a connected-but-never-synced source has nothing yet', () => {
    const health = assessConnection(record({ lastSuccessAt: null }), NOW)
    expect(health.label).toBe('Never synced')
    expect(health.dataIsCurrent).toBe(false)
  })

  it('does not nag about a source that was never connected', () => {
    const health = assessConnection(record({ status: 'not_connected', lastSuccessAt: null }), NOW)
    expect(health.tone).toBe('idle')
  })

  it('prefers the operator-facing detail when one was recorded', () => {
    const health = assessConnection(
      record({ status: 'error', statusDetail: 'Stripe returned 401 on the last three attempts.' }),
      NOW,
    )
    expect(health.detail).toBe('Stripe returned 401 on the last three attempts.')
  })
})

describe('summariseHealth', () => {
  const ok = assessConnection(record(), NOW)
  const behind = assessConnection(record({ provider: 'shopify', displayName: 'Shopify', lastSuccessAt: hoursAgo(30) }), NOW)
  const broken = assessConnection(record({ provider: 'stripe', displayName: 'Stripe', status: 'error' }), NOW)

  it('leads with the failure rather than the score', () => {
    // "3 of 4 healthy" buries the fact that the missing one is the payment
    // processor.
    const summary = summariseHealth([ok, behind, broken])
    expect(summary.tone).toBe('bad')
    expect(summary.message).toMatch(/Stripe/)
    expect(summary.message).not.toMatch(/healthy/)
  })

  it('warns when sources are merely behind', () => {
    expect(summariseHealth([ok, behind]).tone).toBe('warn')
  })

  it('says all clear only when everything is current', () => {
    expect(summariseHealth([ok]).tone).toBe('ok')
  })

  it('says there is nothing to show when nothing is connected', () => {
    const none = assessConnection(record({ status: 'not_connected', lastSuccessAt: null }), NOW)
    expect(summariseHealth([none]).tone).toBe('idle')
  })
})

describe('iCalendar feed', () => {
  const feed = buildIcalFeed({
    calendarName: 'Northwind Supply Co',
    domain: 'aurelis.test',
    events: [
      {
        id: 'goal-1',
        title: 'Goal: reach £250,000',
        description: 'Contribution profit target; semi-colons; and, commas',
        startsAt: new Date('2026-06-30T00:00:00Z'),
        endsAt: new Date('2026-06-30T00:00:00Z'),
        allDay: true,
        updatedAt: NOW,
      },
      {
        id: 'briefing-1',
        title: 'Weekly review',
        startsAt: new Date('2026-06-01T08:00:00Z'),
        endsAt: new Date('2026-06-01T08:30:00Z'),
        updatedAt: NOW,
      },
    ],
  })

  it('uses CRLF line endings, which Outlook requires and Google forgives', () => {
    expect(feed).toContain('\r\n')
    expect(feed.split('\r\n').some((line) => line.includes('\n'))).toBe(false)
  })

  it('is a well-formed calendar', () => {
    expect(feed.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(feed.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(feed.match(/END:VEVENT/g)).toHaveLength(2)
  })

  it('announces itself as a one-way publication', () => {
    expect(feed).toContain('METHOD:PUBLISH')
  })

  it('keeps subscribed events out of free/busy', () => {
    expect(feed.match(/TRANSP:TRANSPARENT/g)).toHaveLength(2)
  })

  it('renders an all-day event as a date with an exclusive end', () => {
    expect(feed).toContain('DTSTART;VALUE=DATE:20260630')
    // A one-day event ends the next day, or half the world sees it a day early.
    expect(feed).toContain('DTEND;VALUE=DATE:20260701')
  })

  it('renders a timed event as an instant', () => {
    expect(feed).toContain('DTSTART:20260601T080000Z')
    expect(feed).toContain('DTEND:20260601T083000Z')
  })

  it('gives every event a stable, domain-qualified UID', () => {
    expect(feed).toContain('UID:goal-1@aurelis.test')
  })
})

describe('escapeText', () => {
  it('escapes the characters that break parsers', () => {
    expect(escapeText('a,b;c')).toBe('a\\,b\\;c')
    expect(escapeText('line\nbreak')).toBe('line\\nbreak')
  })

  it('escapes backslashes first, so escapes do not escape each other', () => {
    expect(escapeText('back\\slash,here')).toBe('back\\\\slash\\,here')
  })
})

describe('foldLine', () => {
  it('leaves a short line alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short')
  })

  it('folds a long line with a leading space on continuations', () => {
    const folded = foldLine(`DESCRIPTION:${'x'.repeat(200)}`)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true)
    expect(Buffer.from(parts[0]!, 'utf8').length).toBeLessThanOrEqual(75)
  })

  it('never splits a multi-byte character across a fold', () => {
    const folded = foldLine(`SUMMARY:${'é'.repeat(100)}`)
    // A split mid-character produces a replacement char on re-decode.
    expect(folded).not.toContain('�')
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'é'.repeat(100)}`)
  })
})
