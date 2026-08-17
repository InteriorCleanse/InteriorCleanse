import { describe, expect, it } from 'vitest'
import {
  evaluateRules,
  type NotificationRule,
} from '@/lib/notifications/evaluate'
import {
  DEFAULT_PREFERENCES,
  decideEmail,
  decideInApp,
  emailSubject,
  inQuietHours,
  type Preferences,
} from '@/lib/notifications/delivery'

function rule(over: Partial<NotificationRule> = {}): NotificationRule {
  return {
    id: 'rule-1',
    organizationId: 'org-1',
    name: 'Spend guard',
    metricKey: 'adSpend',
    comparator: 'above',
    threshold: 1,
    channel: 'in_app',
    enabled: true,
    ...over,
  }
}

const base = { isDemo: true, currency: 'GBP' as const, preset: 'last_7' as const }

describe('evaluateRules', () => {
  it('raises when a threshold is crossed', () => {
    const { raised } = evaluateRules({ ...base, rules: [rule({ threshold: 1 })] })
    expect(raised).toHaveLength(1)
    expect(raised[0]!.ruleId).toBe('rule-1')
  })

  it('stays quiet when it is not', () => {
    const { raised } = evaluateRules({ ...base, rules: [rule({ threshold: 10_000_000 })] })
    expect(raised).toHaveLength(0)
  })

  it('does not fire on a workspace with no data at all', () => {
    const { raised, skipped } = evaluateRules({
      ...base,
      isDemo: false,
      rules: [rule({ comparator: 'below', threshold: 1_000_000 })],
    })
    // "Below threshold" is trivially true of nothing. Firing here is the single
    // fastest way to teach someone to ignore alerts.
    expect(raised).toHaveLength(0)
    expect(skipped[0]!.reason).toMatch(/no activity/i)
  })

  it('still judges a day whose only activity was refunds', () => {
    // The demo workspace's final day has no orders and no spend, but a refund
    // landed: net revenue is negative. That is real activity and a "revenue
    // below" rule should fire on it — refunds outrunning sales is exactly the
    // thing someone wants to hear about. The guard above is for a period where
    // nothing was recorded at all, not for a bad day.
    const { raised } = evaluateRules({
      ...base,
      preset: 'today',
      rules: [rule({ metricKey: 'netRevenue', comparator: 'below', threshold: 0 })],
    })
    expect(raised).toHaveLength(1)
    expect(raised[0]!.evidence.observed).toBeLessThan(0)
  })

  it('skips a rule whose metric is unavailable rather than treating it as zero', () => {
    const { raised, skipped } = evaluateRules({
      ...base,
      isDemo: false,
      rules: [rule({ metricKey: 'roas', comparator: 'below', threshold: 2 })],
    })
    expect(raised).toHaveLength(0)
    expect(skipped).toHaveLength(1)
  })

  it('skips a disabled rule and says so', () => {
    const { raised, skipped } = evaluateRules({
      ...base,
      rules: [rule({ enabled: false, threshold: 1 })],
    })
    expect(raised).toHaveLength(0)
    expect(skipped[0]!.reason).toMatch(/switched off/i)
  })

  it('reports an unknown metric instead of silently doing nothing', () => {
    const { skipped } = evaluateRules({ ...base, rules: [rule({ metricKey: 'vibes' })] })
    expect(skipped[0]!.reason).toMatch(/unknown metric/i)
  })

  it('is idempotent for the same rule and period', () => {
    const first = evaluateRules({ ...base, rules: [rule({ threshold: 1 })] })
    const second = evaluateRules({ ...base, rules: [rule({ threshold: 1 })] })
    // Identical dedupe keys — the unique index makes the second insert a no-op.
    expect(first.raised[0]!.dedupeKey).toBe(second.raised[0]!.dedupeKey)
  })

  it('gives different periods different dedupe keys', () => {
    const monday = evaluateRules({ ...base, rules: [rule({ threshold: 1 })], periodKey: '2026-06-01' })
    const tuesday = evaluateRules({ ...base, rules: [rule({ threshold: 1 })], periodKey: '2026-06-02' })
    expect(monday.raised[0]!.dedupeKey).not.toBe(tuesday.raised[0]!.dedupeKey)
  })

  it('carries the evidence that justified it', () => {
    const { raised } = evaluateRules({ ...base, rules: [rule({ threshold: 1 })] })
    const evidence = raised[0]!.evidence
    expect(evidence.metric).toBe('adSpend')
    expect(evidence.threshold).toBe(1)
    expect(evidence.period.length).toBeGreaterThan(0)
    expect(evidence.observedDisplay).toContain('£')
  })

  it('states the figures in the body, not just that something happened', () => {
    const { raised } = evaluateRules({ ...base, rules: [rule({ threshold: 1 })] })
    expect(raised[0]!.body).toMatch(/£/)
    expect(raised[0]!.body).toMatch(/above/)
  })

  it('escalates severity with the size of the breach', () => {
    const marginal = evaluateRules({ ...base, rules: [rule({ id: 'a', threshold: 0.95 })] })
    const gross = evaluateRules({ ...base, rules: [rule({ id: 'b', threshold: 0.01 })] })
    expect(RANKS[marginal.raised[0]!.severity]).toBeLessThanOrEqual(RANKS[gross.raised[0]!.severity])
    expect(gross.raised[0]!.severity).toBe('critical')
  })

  it('compares money in whole currency units, matching how the rule was written', () => {
    // A rule written as "above £1" must not be judged against pennies.
    const pounds = evaluateRules({ ...base, rules: [rule({ threshold: 1 })] })
    const impossible = evaluateRules({ ...base, rules: [rule({ threshold: 10_000_000 })] })
    expect(pounds.raised).toHaveLength(1)
    expect(impossible.raised).toHaveLength(0)
  })
})

const RANKS = { info: 0, warning: 1, critical: 2 } as const

describe('delivery decisions', () => {
  const prefs = (over: Partial<Preferences> = {}): Preferences => ({
    ...DEFAULT_PREFERENCES,
    ...over,
  })

  it('always delivers in-app', () => {
    expect(decideInApp()).toEqual({ deliver: true, channel: 'in_app' })
  })

  it('respects the email severity floor', () => {
    const decision = decideEmail({ severity: 'info', preferences: prefs(), localHour: 10 })
    expect(decision.deliver).toBe(false)
    expect(decision.deliver === false && decision.reason).toMatch(/threshold/i)
  })

  it('sends when severity clears the floor', () => {
    expect(decideEmail({ severity: 'warning', preferences: prefs(), localHour: 10 }).deliver).toBe(
      true,
    )
  })

  it('says why when email is switched off', () => {
    const decision = decideEmail({
      severity: 'critical',
      preferences: prefs({ emailEnabled: false }),
      localHour: 10,
    })
    expect(decision.deliver).toBe(false)
    expect(decision.deliver === false && decision.reason).toMatch(/switched off/i)
  })

  it('holds a warning during quiet hours', () => {
    const decision = decideEmail({
      severity: 'warning',
      preferences: prefs({ quietHoursStart: 22, quietHoursEnd: 7 }),
      localHour: 3,
    })
    expect(decision.deliver).toBe(false)
    expect(decision.deliver === false && decision.reason).toMatch(/quiet hours/i)
  })

  it('lets a critical break through quiet hours', () => {
    expect(
      decideEmail({
        severity: 'critical',
        preferences: prefs({ quietHoursStart: 22, quietHoursEnd: 7 }),
        localHour: 3,
      }).deliver,
    ).toBe(true)
  })
})

describe('inQuietHours', () => {
  const window = { ...DEFAULT_PREFERENCES, quietHoursStart: 22, quietHoursEnd: 7 }

  it('handles a window that wraps midnight', () => {
    expect(inQuietHours(23, window)).toBe(true)
    expect(inQuietHours(2, window)).toBe(true)
    expect(inQuietHours(6, window)).toBe(true)
    expect(inQuietHours(7, window)).toBe(false)
    expect(inQuietHours(12, window)).toBe(false)
    expect(inQuietHours(21, window)).toBe(false)
  })

  it('handles a same-day window', () => {
    const day = { ...DEFAULT_PREFERENCES, quietHoursStart: 9, quietHoursEnd: 17 }
    expect(inQuietHours(12, day)).toBe(true)
    expect(inQuietHours(17, day)).toBe(false)
    expect(inQuietHours(8, day)).toBe(false)
  })

  it('is disabled when unset, rather than meaning midnight to midnight', () => {
    expect(inQuietHours(3, DEFAULT_PREFERENCES)).toBe(false)
    expect(inQuietHours(3, { ...DEFAULT_PREFERENCES, quietHoursStart: 5, quietHoursEnd: 5 })).toBe(
      false,
    )
  })
})

describe('emailSubject', () => {
  it('leads with urgency, because an inbox shows about forty characters', () => {
    expect(emailSubject('critical', 'Spend guard', 'Northwind')).toMatch(/^Action needed/)
    expect(emailSubject('warning', 'Spend guard', 'Northwind')).toMatch(/^Heads up/)
    expect(emailSubject('info', 'Spend guard', 'Northwind')).toMatch(/^FYI/)
  })
})
