import { afterEach, describe, expect, it, vi } from 'vitest'
import { platformOwnerEmails, branding, isSupabaseConfigured } from '@/lib/env'

const original = { ...process.env }
afterEach(() => {
  process.env = { ...original }
  vi.unstubAllEnvs()
})

describe('platformOwnerEmails', () => {
  it('parses, lowercases, and de-duplicates', () => {
    process.env.PLATFORM_OWNER_EMAILS = 'A@x.com, b@y.com  a@x.com\nc@z.com'
    expect(platformOwnerEmails()).toEqual(['a@x.com', 'b@y.com', 'c@z.com'])
  })

  it('drops entries that are not addresses', () => {
    process.env.PLATFORM_OWNER_EMAILS = 'notanemail,,   ,ok@x.com'
    expect(platformOwnerEmails()).toEqual(['ok@x.com'])
  })

  it('is empty when unset, so nobody can claim ownership by accident', () => {
    delete process.env.PLATFORM_OWNER_EMAILS
    expect(platformOwnerEmails()).toEqual([])
  })
})

describe('branding', () => {
  it('falls back to defaults so the product is never unnamed', () => {
    delete process.env.NEXT_PUBLIC_APP_NAME
    delete process.env.NEXT_PUBLIC_ASSISTANT_NAME
    expect(branding.appName()).toBe('AURELIS OS')
    expect(branding.assistantName()).toBe('Aurelis')
  })

  it('is overridable without code changes', () => {
    process.env.NEXT_PUBLIC_APP_NAME = 'Northwind Intelligence'
    process.env.NEXT_PUBLIC_ASSISTANT_NAME = 'Vera'
    expect(branding.appName()).toBe('Northwind Intelligence')
    expect(branding.assistantName()).toBe('Vera')
  })
})

describe('isSupabaseConfigured', () => {
  it('is false when credentials are absent', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('is true only when both are present', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    expect(isSupabaseConfigured()).toBe(false)
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'a'.repeat(40)
    expect(isSupabaseConfigured()).toBe(true)
  })
})
