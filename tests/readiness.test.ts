import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readiness } from '@/lib/readiness'
import { resetRateLimitStore } from '@/lib/ratelimit'

/**
 * The readiness report.
 *
 * These tests are mostly about *severity*, because that is the part a report
 * like this gets wrong. Marking everything unset as a problem trains the reader
 * to ignore it; marking a real hazard as a note is how it ships.
 */

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VAULT_MASTER_KEY',
  'VAULT_MASTER_KEY_ID',
  'VAULT_KMS_KEY_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_GROWTH',
  'STRIPE_PRICE_SCALE',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'CRON_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
]

let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const key of KEYS) delete process.env[key]
  resetRateLimitStore()
})

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetRateLimitStore()
})

const check = (id: string) => readiness().checks.find((c) => c.id === id)!

describe('readiness', () => {
  it('calls a missing database a blocker', () => {
    expect(check('database').level).toBe('blocker')
    expect(readiness().safeForCustomerData).toBe(false)
  })

  it('calls a static vault key a blocker, not a note', () => {
    // Encryption is real; the key has no hardware boundary. That is fine for
    // your own data and not fine for custodying other businesses' API keys,
    // and the report has to say which.
    process.env.VAULT_MASTER_KEY = 'a'.repeat(64)
    const vault = check('vault')
    expect(vault.level).toBe('blocker')
    expect(vault.detail).toMatch(/hardware boundary/)
  })

  it('calls a missing vault key a warning rather than a blocker', () => {
    // Refusing to store a secret it cannot defend is the correct failure, so
    // it is not dangerous — it just means nobody can connect anything.
    expect(check('vault').level).toBe('warning')
  })

  it('accepts a KMS-held key as ready', () => {
    process.env.VAULT_MASTER_KEY = 'a'.repeat(64)
    process.env.VAULT_KMS_KEY_ID = 'arn:aws:kms:eu-west-2:1:key/abc'
    expect(check('vault').level).toBe('ok')
  })

  it('never puts key material in the report', () => {
    process.env.VAULT_MASTER_KEY = 'b'.repeat(64)
    process.env.STRIPE_SECRET_KEY = 'sk-not-a-real-key-000000'
    process.env.ANTHROPIC_API_KEY = 'anthropic-not-real-000000'
    process.env.CRON_SECRET = 'cron-not-real-000000'

    const serialised = JSON.stringify(readiness())
    expect(serialised).not.toContain('b'.repeat(64))
    expect(serialised).not.toContain('not-a-real-key')
    expect(serialised).not.toContain('anthropic-not-real')
    expect(serialised).not.toContain('cron-not-real')
  })

  it('calls an in-memory rate limiter degraded, and says what it costs', () => {
    const limit = check('ratelimit')
    expect(limit.level).toBe('warning')
    expect(limit.detail).toMatch(/instance count/)
  })

  it('calls Stripe without a webhook secret a blocker', () => {
    // Worse than no billing at all: checkout takes money and no plan ever
    // changes, because entitlements come from our mirror.
    process.env.STRIPE_SECRET_KEY = 'sk-test-placeholder-000'
    const billing = check('billing')
    expect(billing.level).toBe('blocker')
    expect(billing.detail).toMatch(/no plan will ever change/)
  })

  it('calls no billing at all a note, because everything else still works', () => {
    expect(check('billing').level).toBe('note')
  })

  it('warns when only some plans can be bought', () => {
    process.env.STRIPE_SECRET_KEY = 'sk-test-placeholder-000'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec-placeholder-000'
    process.env.STRIPE_PRICE_STARTER = 'price_1'
    expect(check('billing').level).toBe('warning')
    expect(check('billing').detail).toMatch(/1 of 3/)
  })

  it('distinguishes live mode from test mode', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_placeholder'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec-placeholder-000'
    expect(check('billing').detail).toMatch(/live mode/)
  })

  it('calls a missing assistant a note, because the product works without it', () => {
    expect(check('assistant').level).toBe('note')
    expect(check('assistant').detail).toMatch(/unaffected/)
  })

  it('calls a missing email provider a note, not a failure', () => {
    expect(check('email').level).toBe('note')
    expect(check('email').detail).toMatch(/still raised/)
  })

  it('warns when no scheduler secret is set, because nothing runs on its own', () => {
    const cron = check('cron')
    expect(cron.level).toBe('warning')
    expect(cron.detail).toMatch(/404/)
  })

  it('gives every problem something to do about it', () => {
    for (const entry of readiness().checks) {
      if (entry.level === 'ok') continue
      expect(entry.remedy, `${entry.id} has no remedy`).toBeTruthy()
    }
  })

  it('is safe for customer data only when nothing blocks', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
    process.env.VAULT_MASTER_KEY = 'c'.repeat(64)
    process.env.VAULT_KMS_KEY_ID = 'kms'

    const report = readiness()
    expect(report.blockers).toBe(0)
    expect(report.safeForCustomerData).toBe(true)
    // Still degraded — an in-memory limiter and no scheduler — and that is the
    // point of keeping the two counts separate.
    expect(report.warnings).toBeGreaterThan(0)
  })
})
