import { describe, expect, it } from 'vitest'
import { applyPlanCopy, planCopySchema } from '@/lib/billing/plan-copy'
import { PLANS, PLAN_ORDER } from '@/lib/billing/plans'

/**
 * Owner-editable plan copy. The interesting assertions are the negative
 * ones: what an override cannot reach, however it is shaped.
 */

describe('applyPlanCopy', () => {
  it('returns the code catalogue untouched with no overrides', () => {
    expect(applyPlanCopy([])).toEqual(PLANS)
  })

  it('replaces the name and audience line', () => {
    const plans = applyPlanCopy([
      { plan_key: 'starter', name: 'Founder', audience: 'Just you.', highlights: null, limitations: null },
    ])
    expect(plans.starter.name).toBe('Founder')
    expect(plans.starter.audience).toBe('Just you.')
    expect(plans.growth).toEqual(PLANS.growth)
  })

  it('cannot change a price', () => {
    // The override shape has no price field; an operator with database access
    // still cannot make the pricing page disagree with Stripe through here.
    const plans = applyPlanCopy([
      {
        plan_key: 'scale',
        name: 'Scale',
        audience: null,
        highlights: null,
        limitations: null,
        // Smuggled past the type, as a stray column would be.
        ...({ display_price_minor: 1 } as object),
      },
    ])
    expect(plans.scale.displayPriceMinor).toBe(PLANS.scale.displayPriceMinor)
  })

  it('cannot change an entitlement', () => {
    const plans = applyPlanCopy([
      {
        plan_key: 'free',
        name: null,
        audience: null,
        highlights: null,
        limitations: null,
        ...({ entitlements: { members: 999 } } as object),
      },
    ])
    expect(plans.free.entitlements).toEqual(PLANS.free.entitlements)
  })

  it('cannot invent a plan', () => {
    const plans = applyPlanCopy([
      { plan_key: 'enterprise', name: 'Enterprise', audience: null, highlights: null, limitations: null },
    ])
    expect(Object.keys(plans).sort()).toEqual([...PLAN_ORDER].sort())
  })

  it('treats a blank field as no override, so clearing it restores the default', () => {
    const plans = applyPlanCopy([
      { plan_key: 'growth', name: '   ', audience: '', highlights: [], limitations: [' '] },
    ])
    expect(plans.growth.name).toBe(PLANS.growth.name)
    expect(plans.growth.audience).toBe(PLANS.growth.audience)
    expect(plans.growth.highlights).toEqual(PLANS.growth.highlights)
    expect(plans.growth.limitations).toEqual(PLANS.growth.limitations)
  })

  it('drops blank entries inside a list rather than rendering empty bullets', () => {
    const plans = applyPlanCopy([
      { plan_key: 'starter', name: null, audience: null, highlights: ['Kept', '', '  '], limitations: null },
    ])
    expect(plans.starter.highlights).toEqual(['Kept'])
  })
})

describe('planCopySchema', () => {
  it('rejects an unknown plan key', () => {
    expect(planCopySchema.safeParse({ planKey: 'enterprise' }).success).toBe(false)
  })

  it('bounds the copy so a form cannot post an essay onto the pricing page', () => {
    expect(planCopySchema.safeParse({ planKey: 'free', name: 'x'.repeat(41) }).success).toBe(false)
    expect(
      planCopySchema.safeParse({ planKey: 'free', highlights: Array(7).fill('a') }).success,
    ).toBe(false)
  })

  it('has no field for price or entitlements', () => {
    const shape = Object.keys(planCopySchema.shape)
    expect(shape).not.toContain('displayPriceMinor')
    expect(shape).not.toContain('price')
    expect(shape).not.toContain('entitlements')
  })
})
