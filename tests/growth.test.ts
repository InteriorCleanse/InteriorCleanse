import { describe, expect, it } from 'vitest'
import { calculateRoi, type RoiInputs } from '@/lib/growth/roi'
import {
  captureAttribution,
  checkReferral,
  generateReferralCode,
  normaliseReferralCode,
  sanitiseTag,
} from '@/lib/growth/attribution'

function inputs(over: Partial<RoiInputs> = {}): RoiInputs {
  return {
    monthlyRevenue: 100_000,
    monthlyAdSpend: 20_000,
    hoursOnReporting: 12,
    hourlyCost: 60,
    planCostPerMonth: 149,
    currency: 'USD',
    ...over,
  }
}

describe('calculateRoi', () => {
  it('reports a range, never a single number', () => {
    const result = calculateRoi(inputs())
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.high).toBeGreaterThan(result.low)
  })

  it('can say it will not pay for itself', () => {
    // The test of whether a calculator is honest. If no input produces a
    // negative answer, it is an advertisement wearing a spreadsheet's clothes.
    const result = calculateRoi(
      inputs({ monthlyRevenue: 2_000, monthlyAdSpend: 0, hoursOnReporting: 0, planCostPerMonth: 399 }),
    )
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.verdict).toBe('not_worth_it')
    expect(result.netHigh).toBeLessThan(0)
    expect(result.headline).toMatch(/free plan/i)
  })

  it('refuses to extrapolate from a business too small to model', () => {
    const result = calculateRoi(inputs({ monthlyRevenue: 200 }))
    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toMatch(/guesswork/i)
  })

  it('rejects nonsense input rather than producing a number', () => {
    expect(calculateRoi(inputs({ monthlyRevenue: Number.NaN })).available).toBe(false)
    expect(calculateRoi(inputs({ monthlyRevenue: -5_000 })).available).toBe(false)
  })

  it('subtracts the subscription rather than quoting a gross figure', () => {
    const result = calculateRoi(inputs({ planCostPerMonth: 149 }))
    if (!result.available) throw new Error('expected a result')
    expect(result.netLow).toBe(result.low - 149)
    expect(result.netHigh).toBe(result.high - 149)
  })

  it('shows every component with the assumption behind it', () => {
    const result = calculateRoi(inputs())
    if (!result.available) throw new Error('expected a result')
    expect(result.breakdown).toHaveLength(3)
    for (const line of result.breakdown) {
      expect(line.basis.length).toBeGreaterThan(10)
      expect(line.lowDisplay).toContain('$')
    }
  })

  it('carries a disclaimer in the result, not in the caller’s small print', () => {
    const result = calculateRoi(inputs())
    if (!result.available) throw new Error('expected a result')
    expect(result.disclaimer).toMatch(/not a promise/i)
    expect(result.assumptions.length).toBeGreaterThanOrEqual(4)
  })

  it('says plainly that the bands are illustrative, not measured', () => {
    const result = calculateRoi(inputs())
    if (!result.available) throw new Error('expected a result')
    expect(result.assumptions[0]).toMatch(/not measured results/i)
  })

  it('scales with the inputs that should drive it', () => {
    const small = calculateRoi(inputs({ monthlyAdSpend: 1_000 }))
    const large = calculateRoi(inputs({ monthlyAdSpend: 100_000 }))
    if (!small.available || !large.available) throw new Error('expected results')
    expect(large.high).toBeGreaterThan(small.high)
  })

  it('does not credit time savings to someone who spends no time reporting', () => {
    const result = calculateRoi(inputs({ hoursOnReporting: 0 }))
    if (!result.available) throw new Error('expected a result')
    expect(result.breakdown[0]!.lowDisplay).toBe('$0.00')
  })
})

describe('captureAttribution', () => {
  it('captures the known campaign parameters', () => {
    const result = captureAttribution({
      url: 'https://example.com/pricing?utm_source=twitter&utm_campaign=launch',
    })
    expect(result.utm_source).toBe('twitter')
    expect(result.utm_campaign).toBe('launch')
  })

  it('ignores parameters that are not on the list', () => {
    // A greedy capture stores password-reset tokens and invite codes.
    const result = captureAttribution({
      url: 'https://example.com/reset?token=SECRET123&utm_source=email',
    })
    expect(JSON.stringify(result)).not.toContain('SECRET123')
    expect(result.utm_source).toBe('email')
  })

  it('keeps the landing path without its query string', () => {
    const result = captureAttribution({
      url: 'https://example.com/invite/accept?code=SECRET',
    })
    expect(result.landingPath).toBe('/invite/accept')
    expect(JSON.stringify(result)).not.toContain('SECRET')
  })

  it('reduces the referrer to a hostname', () => {
    const result = captureAttribution({
      url: 'https://example.com/',
      referrer: 'https://news.site/article/private-thing?u=123',
    })
    expect(result.referrerHost).toBe('news.site')
    expect(JSON.stringify(result)).not.toContain('private-thing')
  })

  it('drops a value carrying markup or a scheme', () => {
    const result = captureAttribution({
      url: 'https://example.com/?utm_source=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E',
    })
    expect(result.utm_source).toBeUndefined()
  })

  it('drops a javascript: payload rather than storing it', () => {
    const result = captureAttribution({
      url: 'https://example.com/?utm_content=javascript%3Aalert(1)',
    })
    expect(result.utm_content).toBeUndefined()
  })

  it('survives a malformed URL', () => {
    expect(captureAttribution({ url: 'not a url' })).toEqual({})
  })

  it('survives a malformed referrer without losing the rest', () => {
    const result = captureAttribution({ url: 'https://example.com/?ref=ABCD', referrer: 'nope' })
    expect(result.ref).toBe('ABCD')
    expect(result.referrerHost).toBeUndefined()
  })
})

describe('sanitiseTag', () => {
  it('allows what real campaign tags contain', () => {
    expect(sanitiseTag('spring-sale_2026')).toBe('spring-sale_2026')
    expect(sanitiseTag('  paid social  ')).toBe('paid social')
  })

  it('rejects anything else, rather than escaping it', () => {
    expect(sanitiseTag('<script>')).toBeNull()
    expect(sanitiseTag("'; drop table--")).toBeNull()
    expect(sanitiseTag('')).toBeNull()
  })

  it('bounds the length', () => {
    expect(sanitiseTag('a'.repeat(500))!.length).toBeLessThanOrEqual(120)
  })
})

describe('checkReferral', () => {
  const base = {
    code: 'ABCD1234',
    ownerUserId: 'owner',
    newUserId: 'newcomer',
    ownerEmailDomain: 'acme.com',
    newEmailDomain: 'other.com',
    alreadyReferred: false,
    active: true,
  }

  it('credits an ordinary referral', () => {
    expect(checkReferral(base).credited).toBe(true)
  })

  it('refuses self-referral', () => {
    const result = checkReferral({ ...base, newUserId: 'owner' })
    expect(result.credited).toBe(false)
    expect(result.credited === false && result.reason).toMatch(/who owns it/)
  })

  it('refuses a second credit for the same account', () => {
    expect(checkReferral({ ...base, alreadyReferred: true }).credited).toBe(false)
  })

  it('refuses an inactive code', () => {
    expect(checkReferral({ ...base, active: false }).credited).toBe(false)
  })

  it('refuses colleagues at the same company', () => {
    const result = checkReferral({ ...base, newEmailDomain: 'acme.com' })
    expect(result.credited).toBe(false)
    expect(result.credited === false && result.reason).toMatch(/colleagues/)
  })

  it('still credits two people who both happen to use Gmail', () => {
    // Blocking on a consumer domain would reject most legitimate referrals.
    expect(
      checkReferral({ ...base, ownerEmailDomain: 'gmail.com', newEmailDomain: 'gmail.com' })
        .credited,
    ).toBe(true)
  })
})

describe('referral codes', () => {
  it('avoids characters that are misread from a phone screen', () => {
    const code = generateReferralCode(() => 0.999, 12)
    expect(code).not.toMatch(/[O0I1L]/)
  })

  it('normalises how people actually type a code', () => {
    expect(normaliseReferralCode(' abcd-1234 ')).toBe('ABCD1234')
  })

  it('rejects something that is not a code', () => {
    expect(normaliseReferralCode('ab')).toBeNull()
    expect(normaliseReferralCode('x'.repeat(40))).toBeNull()
  })
})
