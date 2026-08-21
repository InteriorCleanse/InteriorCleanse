import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  PLANS,
  PLAN_ORDER,
  downgradeImpact,
  formatPlanPrice,
  isUpgrade,
  planFor,
} from '@/lib/billing/plans'
import {
  GRACE_PERIOD_DAYS,
  checkFeature,
  checkLimit,
  resolveAccess,
  type Subscription,
} from '@/lib/billing/entitlements'
import {
  SIGNATURE_TOLERANCE_SECONDS,
  StripeError,
  encodeForm,
  mapStatus,
  verifyWebhook,
} from '@/lib/billing/stripe'

const NOW = new Date('2026-06-01T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

function subscription(over: Partial<Subscription> = {}): Subscription {
  return {
    planKey: 'growth',
    status: 'active',
    currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
    cancelAt: null,
    pastDueSince: null,
    ...over,
  }
}

describe('plan catalogue', () => {
  it('orders plans from least to most capable', () => {
    for (let i = 1; i < PLAN_ORDER.length; i += 1) {
      const lower = PLANS[PLAN_ORDER[i - 1]!].entitlements
      const higher = PLANS[PLAN_ORDER[i]!].entitlements
      const lowerSeats = lower.members ?? Infinity
      const higherSeats = higher.members ?? Infinity
      expect(higherSeats).toBeGreaterThanOrEqual(lowerSeats)
    }
  })

  it('falls back to free for an unknown plan key, never to unlimited', () => {
    // A typo in a webhook must not grant the top tier.
    expect(planFor('enterprise-platinum').key).toBe('free')
    expect(planFor(null).key).toBe('free')
    expect(planFor(undefined).key).toBe('free')
  })

  it('states what each plan does not include', () => {
    expect(PLANS.free.limitations.length).toBeGreaterThan(0)
    expect(PLANS.starter.limitations.length).toBeGreaterThan(0)
  })

  it('knows which way a change goes', () => {
    expect(isUpgrade('free', 'growth')).toBe(true)
    expect(isUpgrade('growth', 'starter')).toBe(false)
    expect(isUpgrade('scale', 'scale')).toBe(false)
  })

  it('formats free as free rather than as zero', () => {
    expect(formatPlanPrice(PLANS.free)).toBe('Free')
    expect(formatPlanPrice(PLANS.starter)).toBe('$49')
  })
})

describe('downgradeImpact', () => {
  it('spells out what would be lost before it is lost', () => {
    const losses = downgradeImpact('growth', 'free')
    expect(losses.length).toBeGreaterThan(3)
    expect(losses.join(' ')).toMatch(/seats/)
    expect(losses.join(' ')).toMatch(/Email alerts switched off/)
  })

  it('names an unlimited-to-limited change explicitly', () => {
    expect(downgradeImpact('scale', 'starter').join(' ')).toMatch(/currently unlimited/)
  })

  it('reports nothing lost on an upgrade', () => {
    expect(downgradeImpact('free', 'scale')).toHaveLength(0)
  })
})

describe('resolveAccess', () => {
  it('gives an active subscription its plan in full', () => {
    const access = resolveAccess(subscription(), NOW)
    expect(access.level).toBe('full')
    expect(access.plan.key).toBe('growth')
    expect(access.notice).toBeNull()
  })

  it('keeps everything working during the grace period after a failed payment', () => {
    // A card expires while someone is on holiday. Cutting access on the hour
    // loses a customer who would happily have paid.
    const access = resolveAccess(
      subscription({ status: 'past_due', pastDueSince: daysAgo(3) }),
      NOW,
    )
    expect(access.level).toBe('grace')
    expect(access.entitlements.assistantMessagesPerMonth).toBe(
      PLANS.growth.entitlements.assistantMessagesPerMonth,
    )
    expect(access.graceDaysLeft).toBe(GRACE_PERIOD_DAYS - 3)
    expect(access.notice).toMatch(/keeps working/)
  })

  it('goes read-only once the grace period is spent', () => {
    const access = resolveAccess(
      subscription({ status: 'past_due', pastDueSince: daysAgo(GRACE_PERIOD_DAYS + 1) }),
      NOW,
    )
    expect(access.level).toBe('read_only')
    expect(access.entitlements.assistantMessagesPerMonth).toBe(0)
  })

  it('never switches off export, even in arrears', () => {
    // Holding someone's own numbers hostage is not a retention strategy.
    const access = resolveAccess(
      subscription({ status: 'unpaid', pastDueSince: daysAgo(60) }),
      NOW,
    )
    expect(access.level).toBe('read_only')
    expect(access.entitlements.csvExport).toBe(true)
  })

  it('says the data is intact when it goes read-only', () => {
    const access = resolveAccess(
      subscription({ status: 'past_due', pastDueSince: daysAgo(30) }),
      NOW,
    )
    expect(access.notice).toMatch(/data is intact/i)
  })

  it('drops a cancelled subscription to free rather than to nothing', () => {
    const access = resolveAccess(subscription({ status: 'canceled' }), NOW)
    expect(access.level).toBe('full')
    expect(access.plan.key).toBe('free')
    expect(access.notice).toMatch(/data is intact/i)
  })

  it('tells someone their scheduled cancellation has not happened yet', () => {
    const access = resolveAccess(
      subscription({ cancelAt: new Date('2026-07-01T00:00:00Z') }),
      NOW,
    )
    expect(access.level).toBe('full')
    expect(access.notice).toMatch(/2026-07-01/)
  })

  it('treats a trial as full access', () => {
    expect(resolveAccess(subscription({ status: 'trialing' }), NOW).level).toBe('full')
  })

  it('leaves a free workspace alone', () => {
    const access = resolveAccess(subscription({ planKey: 'free', status: 'active' }), NOW)
    expect(access.level).toBe('full')
    expect(access.notice).toBeNull()
  })
})

describe('checkLimit', () => {
  const growth = resolveAccess(subscription(), NOW)
  const free = resolveAccess(subscription({ planKey: 'free' }), NOW)

  it('allows an action below the limit', () => {
    expect(checkLimit({ access: free, resource: 'members', current: 0 }).allowed).toBe(true)
  })

  it('blocks at the limit, not one past it', () => {
    // Asked before adding: being exactly at the limit must block, or everyone
    // gets one extra seat.
    const result = checkLimit({ access: free, resource: 'members', current: 1 })
    expect(result.allowed).toBe(false)
  })

  it('never blocks an unlimited resource', () => {
    expect(
      checkLimit({ access: growth, resource: 'connectedIntegrations', current: 9_999 }).allowed,
    ).toBe(true)
  })

  it('explains a post-downgrade overage without implying anything was removed', () => {
    const result = checkLimit({ access: free, resource: 'members', current: 6 })
    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.reason).toMatch(/Nothing has been removed/)
  })

  it('names the plan that would allow more', () => {
    const result = checkLimit({ access: free, resource: 'members', current: 1 })
    expect(result.allowed === false && result.upgradeTo).toBe('starter')
  })

  it('blocks everything limited in a read-only workspace, and says why', () => {
    const arrears = resolveAccess(
      subscription({ status: 'past_due', pastDueSince: daysAgo(60) }),
      NOW,
    )
    const result = checkLimit({ access: arrears, resource: 'members', current: 0 })
    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.reason).toMatch(/read-only/)
  })
})

describe('checkFeature', () => {
  const free = resolveAccess(subscription({ planKey: 'free' }), NOW)

  it('blocks a feature the plan does not include, and names the upgrade', () => {
    const result = checkFeature(free, 'emailNotifications')
    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.upgradeTo).toBe('starter')
  })

  it('allows a feature the plan includes', () => {
    const growth = resolveAccess(subscription(), NOW)
    expect(checkFeature(growth, 'apiAccess').allowed).toBe(true)
  })
})

describe('verifyWebhook', () => {
  const secret = 'whsec_test_secret'
  const body = JSON.stringify({
    id: 'evt_1',
    type: 'customer.subscription.updated',
    created: 1_780_000_000,
    data: { object: { id: 'sub_1', status: 'active' } },
  })

  function sign(payload: string, at: Date, withSecret = secret): string {
    const t = Math.floor(at.getTime() / 1000)
    const signature = createHmac('sha256', withSecret).update(`${t}.${payload}`).digest('hex')
    return `t=${t},v1=${signature}`
  }

  it('accepts a correctly signed event', () => {
    const event = verifyWebhook({
      rawBody: body,
      signatureHeader: sign(body, NOW),
      secret,
      now: NOW,
    })
    expect(event.id).toBe('evt_1')
  })

  it('rejects a forged signature', () => {
    expect(() =>
      verifyWebhook({ rawBody: body, signatureHeader: sign(body, NOW, 'wrong'), secret, now: NOW }),
    ).toThrow(StripeError)
  })

  it('rejects a body that changed after signing', () => {
    const header = sign(body, NOW)
    const tampered = body.replace('"active"', '"trialing"')
    expect(() =>
      verifyWebhook({ rawBody: tampered, signatureHeader: header, secret, now: NOW }),
    ).toThrow(/does not match/)
  })

  it('rejects a replayed request outside the tolerance window', () => {
    const old = new Date(NOW.getTime() - (SIGNATURE_TOLERANCE_SECONDS + 60) * 1000)
    expect(() =>
      verifyWebhook({ rawBody: body, signatureHeader: sign(body, old), secret, now: NOW }),
    ).toThrow(/tolerance/)
  })

  it('accepts a delivery inside the tolerance window', () => {
    const recent = new Date(NOW.getTime() - 60_000)
    expect(
      verifyWebhook({ rawBody: body, signatureHeader: sign(body, recent), secret, now: NOW }).id,
    ).toBe('evt_1')
  })

  it('accepts any one of several signatures during secret rotation', () => {
    const t = Math.floor(NOW.getTime() / 1000)
    const good = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
    const header = `t=${t},v1=deadbeef,v1=${good}`
    expect(verifyWebhook({ rawBody: body, signatureHeader: header, secret, now: NOW }).id).toBe(
      'evt_1',
    )
  })

  it('rejects a missing or malformed header', () => {
    expect(() => verifyWebhook({ rawBody: body, signatureHeader: null, secret })).toThrow(/Missing/)
    expect(() => verifyWebhook({ rawBody: body, signatureHeader: 'nonsense', secret })).toThrow(
      /Malformed/,
    )
  })

  it('refuses to run without a configured secret', () => {
    expect(() =>
      verifyWebhook({ rawBody: body, signatureHeader: sign(body, NOW), secret: '' }),
    ).toThrow(/No webhook secret/)
  })

  it('rejects a signed body that is not a valid event', () => {
    const junk = JSON.stringify({ hello: 'world' })
    expect(() =>
      verifyWebhook({ rawBody: junk, signatureHeader: sign(junk, NOW), secret, now: NOW }),
    ).toThrow(/required fields/)
  })
})

describe('mapStatus', () => {
  it('passes through statuses we model', () => {
    expect(mapStatus('active')).toBe('active')
    expect(mapStatus('past_due')).toBe('past_due')
  })

  it('maps anything unknown to incomplete, which grants nothing', () => {
    // Stripe adds statuses over time. Guessing generously gives the product away.
    expect(mapStatus('paused')).toBe('incomplete')
    expect(mapStatus('some_future_status')).toBe('incomplete')
  })
})

describe('encodeForm', () => {
  it('encodes nested objects the way Stripe expects', () => {
    expect(encodeForm({ metadata: { organization_id: 'org-1' } })).toBe(
      'metadata%5Borganization_id%5D=org-1',
    )
  })

  it('skips null and undefined rather than sending the string "null"', () => {
    expect(encodeForm({ a: 1, b: null, c: undefined })).toBe('a=1')
  })

  it('encodes arrays of objects', () => {
    expect(encodeForm({ line_items: [{ price: 'price_1', quantity: 1 }] })).toContain(
      'line_items%5B0%5D%5Bprice%5D=price_1',
    )
  })
})
