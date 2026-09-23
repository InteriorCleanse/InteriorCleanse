import { describe, expect, it } from 'vitest'
import {
  needsAttention,
  statusHealth,
  summarizePortfolio,
  type CompanySummary,
} from '@/lib/owner/portfolio'

const company = (over: Partial<CompanySummary> & { id: string }): CompanySummary => ({
  name: over.id,
  isDemo: false,
  planKey: 'growth',
  subscriptionStatus: 'active',
  memberCount: 3,
  currency: 'USD',
  createdAt: '2026-01-01T00:00:00.000Z',
  netRevenueMinor: null,
  contributionProfitMinor: null,
  ...over,
})

describe('needsAttention', () => {
  it('flags a real company that is past due or canceled', () => {
    expect(needsAttention(company({ id: 'a', subscriptionStatus: 'past_due' }))).toBe(true)
    expect(needsAttention(company({ id: 'b', subscriptionStatus: 'canceled' }))).toBe(true)
    expect(needsAttention(company({ id: 'c', subscriptionStatus: 'active' }))).toBe(false)
  })

  it('never flags a demo, whatever its status', () => {
    expect(needsAttention(company({ id: 'd', isDemo: true, subscriptionStatus: 'past_due' }))).toBe(false)
  })
})

describe('summarizePortfolio', () => {
  it('separates real from demo and counts them', () => {
    const s = summarizePortfolio([
      company({ id: 'r1' }),
      company({ id: 'r2' }),
      company({ id: 'd1', isDemo: true }),
    ])
    expect(s.total).toBe(3)
    expect(s.real).toBe(2)
    expect(s.demo).toBe(1)
  })

  it('never lets a demo workspace inflate a real total', () => {
    // Demo revenue is reported only under demoRevenueByCurrency, never mixed in.
    const s = summarizePortfolio([
      company({ id: 'demo', isDemo: true, currency: 'USD', netRevenueMinor: 1_631_550 }),
      company({ id: 'real', netRevenueMinor: null }),
    ])
    expect(s.demoRevenueByCurrency).toEqual([{ currency: 'USD', minor: 1_631_550 }])
  })

  it('totals demo revenue per currency and never across them', () => {
    const s = summarizePortfolio([
      company({ id: 'us', isDemo: true, currency: 'USD', netRevenueMinor: 1000 }),
      company({ id: 'us2', isDemo: true, currency: 'USD', netRevenueMinor: 2000 }),
      company({ id: 'gb', isDemo: true, currency: 'GBP', netRevenueMinor: 5000 }),
    ])
    expect(s.demoRevenueByCurrency).toEqual([
      { currency: 'GBP', minor: 5000 },
      { currency: 'USD', minor: 3000 },
    ])
  })

  it('excludes a null (real) revenue from the currency totals rather than counting it as zero', () => {
    const s = summarizePortfolio([
      company({ id: 'real', currency: 'USD', netRevenueMinor: null }),
      company({ id: 'demo', isDemo: true, currency: 'USD', netRevenueMinor: 400 }),
    ])
    expect(s.demoRevenueByCurrency).toEqual([{ currency: 'USD', minor: 400 }])
  })

  it('lists the companies needing attention, most-urgent first in the roster', () => {
    const s = summarizePortfolio([
      company({ id: 'healthy', subscriptionStatus: 'active' }),
      company({ id: 'zebra-late', name: 'Zebra', subscriptionStatus: 'past_due' }),
      company({ id: 'apple-late', name: 'Apple', subscriptionStatus: 'unpaid' }),
      company({ id: 'demo', isDemo: true }),
    ])
    expect(s.attention.map((c) => c.name)).toEqual(['Apple', 'Zebra'])
    // Roster order: attention first (by name), then real, then demo.
    expect(s.companies.map((c) => c.id)).toEqual(['apple-late', 'zebra-late', 'healthy', 'demo'])
  })

  it('buckets statuses and plans, largest first', () => {
    const s = summarizePortfolio([
      company({ id: 'a', subscriptionStatus: 'active', planKey: 'growth' }),
      company({ id: 'b', subscriptionStatus: 'active', planKey: 'growth' }),
      company({ id: 'c', subscriptionStatus: 'trialing', planKey: 'starter' }),
    ])
    expect(s.byStatus[0]).toEqual({ key: 'active', count: 2 })
    expect(s.byPlan[0]).toEqual({ key: 'growth', count: 2 })
  })

  it('labels a missing status and plan as none rather than empty', () => {
    const s = summarizePortfolio([company({ id: 'x', subscriptionStatus: '', planKey: '' })])
    expect(s.byStatus).toEqual([{ key: 'none', count: 1 }])
    expect(s.byPlan).toEqual([{ key: 'none', count: 1 }])
  })

  it('handles an empty deployment', () => {
    expect(summarizePortfolio([])).toMatchObject({ total: 0, real: 0, demo: 0, attention: [], companies: [] })
  })
})

describe('statusHealth', () => {
  it('maps statuses to a health word', () => {
    expect(statusHealth('active')).toBe('healthy')
    expect(statusHealth('trialing')).toBe('healthy')
    expect(statusHealth('past_due')).toBe('attention')
    expect(statusHealth('canceled')).toBe('attention')
    expect(statusHealth('none')).toBe('idle')
    expect(statusHealth('')).toBe('idle')
  })
})
