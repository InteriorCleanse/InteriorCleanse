import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE,
  agentDisplayName,
  agentProfileSchema,
  profileFromRow,
  standingOrdersBlock,
} from '@/lib/agents/profile'
import { TOOLS_BY_NAME, type ToolContext } from '@/lib/assistant/tools'
import { headlineFor, standingFor, watch, type WatchedCompany } from '@/lib/owner/mission'
import { HEADERS_SOURCE, contentSecurityPolicy, securityHeaders } from '@/lib/security/headers'
import { describeFactors, hasSecondFactor, needsStepUp, normaliseCode } from '@/lib/security/mfa'

/**
 * One agent per business, one assistant watching them all, and the two
 * hardening layers that make "untouchable" a property rather than a word:
 * the headers every page carries and the second-factor rule every session
 * is held to.
 */

describe('agent profile', () => {
  it('falls back to the deployment name and accepts a plain name', () => {
    expect(agentDisplayName(null, 'Arch')).toBe('Arch')
    expect(agentDisplayName({ ...DEFAULT_PROFILE, agentName: '  ' }, 'Arch')).toBe('Arch')
    expect(agentDisplayName({ ...DEFAULT_PROFILE, agentName: 'Nova' }, 'Arch')).toBe('Nova')
  })

  it('refuses a name that could read as markup or a prompt delimiter', () => {
    expect(agentProfileSchema.safeParse({ agentName: 'Nova' }).success).toBe(true)
    expect(agentProfileSchema.safeParse({ agentName: "D'Arcy-Two" }).success).toBe(true)
    expect(agentProfileSchema.safeParse({ agentName: '<system>' }).success).toBe(false)
    expect(agentProfileSchema.safeParse({ agentName: 'x'.repeat(41) }).success).toBe(false)
    expect(agentProfileSchema.safeParse({ standingOrders: 'x'.repeat(2_001) }).success).toBe(false)
  })

  it('shows standing orders beneath the rules, as preferences that cannot grant anything', () => {
    const block = standingOrdersBlock({
      ...DEFAULT_PROFILE,
      focus: 'Candles and diffusers, wholesale-led.',
      standingOrders: 'Judge the brand campaign on new customers, not ROAS.',
    })
    expect(block).toMatch(/standing orders/i)
    expect(block).toMatch(/cannot grant a tool, skip an approval/)
    expect(block).toContain('Focus: Candles and diffusers')
    expect(block).toContain('Judge the brand campaign')
  })

  it('says nothing when there is nothing to say', () => {
    expect(standingOrdersBlock(null)).toBe('')
    expect(standingOrdersBlock(DEFAULT_PROFILE)).toBe('')
    expect(profileFromRow(null)).toEqual(DEFAULT_PROFILE)
  })
})

describe('mission control', () => {
  const base: WatchedCompany = {
    id: 'c1',
    name: 'Northwind',
    isDemo: false,
    planKey: 'growth',
    subscriptionStatus: 'active',
    memberCount: 3,
    currency: 'GBP',
    createdAt: '2026-01-01T00:00:00Z',
    netRevenueMinor: 1_000_00,
    contributionProfitMinor: 300_00,
    agentName: 'Nova',
    reportsToOwner: true,
    signals: [],
  }

  it('ranks a critical signal above a billing problem above a quiet company', () => {
    const critical = { ...base, id: 'a', name: 'A', signals: [{ id: 's', severity: 'critical' as const, title: 'Revenue up, profit down', detail: '' }] }
    const billing = { ...base, id: 'b', name: 'B', subscriptionStatus: 'past_due' }
    const quiet = { ...base, id: 'c', name: 'C' }
    const unknown = { ...base, id: 'd', name: 'D', netRevenueMinor: null }

    expect(standingFor(critical)).toBe('critical')
    expect(standingFor(billing)).toBe('watch')
    expect(standingFor(quiet)).toBe('healthy')
    // A company nobody is measuring is not a company doing fine.
    expect(standingFor(unknown)).toBe('unknown')

    const mission = watch([quiet, unknown, billing, critical], 'Arch')
    expect(mission.companies.map((c) => c.id)).toEqual(['a', 'b', 'd', 'c'])
    expect(mission.needsYou.map((c) => c.id)).toEqual(['a', 'b'])
    expect(mission.summary).toBe('Arch is watching 4 companies; 2 need you.')
    expect(mission.counts).toEqual({ critical: 1, watch: 1, healthy: 1, unknown: 1 })
  })

  it('writes a headline a person can act on', () => {
    expect(headlineFor({ ...base, subscriptionStatus: 'past_due' }, 'watch')).toBe('Subscription past due')
    expect(headlineFor({ ...base, netRevenueMinor: null }, 'unknown')).toBe('No data source connected yet')
    expect(headlineFor({ ...base, reportsToOwner: false }, 'healthy')).toBe('Running quietly; not reporting in')
    expect(headlineFor(base, 'healthy')).toBe('Nothing needs a decision')
  })

  it('never lets a demo company outrank a real one at equal standing', () => {
    const demo = { ...base, id: 'demo', name: 'Aardvark Demo', isDemo: true }
    const real = { ...base, id: 'real', name: 'Zebra Ltd' }
    expect(watch([demo, real], 'Arch').companies.map((c) => c.id)).toEqual(['real', 'demo'])
  })

  it('handles an empty portfolio honestly', () => {
    expect(watch([], 'Arch').summary).toBe('Arch has no companies to watch yet.')
  })
})

describe('the portfolio tool', () => {
  const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
    organizationId: 'org-1',
    isDemo: false,
    currency: 'GBP',
    can: () => true,
    ...over,
  })

  it('is gated on the platform console capability, not on tenant data', () => {
    expect(TOOLS_BY_NAME.get('portfolio_overview')!.capability).toBe('platform:view_console')
  })

  it('says it is not available when the route did not inject it, and still cites', async () => {
    const tool = TOOLS_BY_NAME.get('portfolio_overview')!
    const result = await tool.execute({}, ctx())
    expect(result.data).toMatchObject({ available: false })
    expect(result.citations).toEqual(['portfolio'])
  })

  it('reports every company with its agent, standing and headline, cited', async () => {
    const tool = TOOLS_BY_NAME.get('portfolio_overview')!
    const result = await tool.execute(
      {},
      ctx({
        listPortfolio: async () => [
          {
            id: 'c1', name: 'Northwind', isDemo: true, planKey: 'growth', subscriptionStatus: 'active',
            memberCount: 2, currency: 'GBP', createdAt: '2026-01-01T00:00:00Z',
            netRevenueMinor: 1_200_00, contributionProfitMinor: 400_00, agentName: 'Nova', reportsToOwner: true,
            signals: [{ id: 's', severity: 'critical', title: 'Revenue up, profit down', detail: 'Spend outran sales.' }],
          },
          {
            id: 'c2', name: 'Harbour', isDemo: false, planKey: 'starter', subscriptionStatus: 'past_due',
            memberCount: 1, currency: 'USD', createdAt: '2026-02-01T00:00:00Z',
            netRevenueMinor: null, contributionProfitMinor: null, agentName: 'Arch', reportsToOwner: true, signals: [],
          },
        ],
      }),
    )
    const data = result.data as { summary: string; companies: { name: string; standing: string; agent: string; revenue: string | null }[] }
    expect(data.summary).toMatch(/watching 2 companies; 2 need you/)
    expect(data.companies[0]).toMatchObject({ name: 'Northwind', standing: 'critical', agent: 'Nova' })
    expect(data.companies[1]).toMatchObject({ name: 'Harbour', standing: 'watch', revenue: null })
    expect(result.citations).toEqual(['portfolio', 'company:c1', 'company:c2'])
    expect(result.sources!.map((s) => s.label)).toEqual(['Northwind', 'Harbour'])
  })
})

describe('security headers', () => {
  const headers = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]))

  it('carries the headers an audit looks for first', () => {
    expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d{8,}; includeSubDomains; preload/)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toMatch(/camera=\(\)/)
    expect(headers['Permissions-Policy']).toMatch(/microphone=\(self\)/)
  })

  it('lets scripts come from this origin only and lets nobody frame the app', () => {
    const csp = contentSecurityPolicy()
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline'(;|$)/)
    expect(csp).not.toMatch(/script-src[^;]*https?:/)
    expect(csp).not.toMatch(/\*(?!\.supabase)/)
  })

  it('reaches Supabase and nothing else over the network, and plays audio from a blob', () => {
    const csp = contentSecurityPolicy()
    expect(csp).toMatch(/connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/)
    expect(csp).toContain("media-src 'self' blob:")
  })

  it('leaves the built-site previews to their own sandboxing policy', () => {
    const matcher = new RegExp(`^${HEADERS_SOURCE.replace('(?!api/sites/)', '(?!api/sites/)')}$`)
    expect(matcher.test('/app/command-center')).toBe(true)
    expect(matcher.test('/api/sites/6f1a2b3c')).toBe(false)
  })
})

describe('second factor', () => {
  it('treats a session that could be stronger as not signed in', () => {
    expect(needsStepUp({ current: 'aal1', next: 'aal2' })).toBe(true)
    expect(needsStepUp({ current: 'aal2', next: 'aal2' })).toBe(false)
    expect(needsStepUp({ current: 'aal1', next: 'aal1' })).toBe(false)
    expect(needsStepUp({ current: null, next: null })).toBe(false)
    expect(hasSecondFactor({ current: 'aal1', next: 'aal2' })).toBe(true)
    expect(hasSecondFactor({ current: 'aal1', next: 'aal1' })).toBe(false)
  })

  it('names factors, verified first', () => {
    const list = describeFactors([
      { id: 'u', friendly_name: '', status: 'unverified', created_at: '2026-03-01T00:00:00Z' },
      { id: 'v', friendly_name: 'Phone', status: 'verified', created_at: '2026-02-01T00:00:00Z' },
    ])
    expect(list.map((f) => f.id)).toEqual(['v', 'u'])
    expect(list[1]!.friendlyName).toBe('Authenticator app')
  })

  it('accepts six digits with spaces and nothing else', () => {
    expect(normaliseCode('123 456')).toBe('123456')
    expect(normaliseCode('12345')).toBeNull()
    expect(normaliseCode('12345a')).toBeNull()
  })
})
