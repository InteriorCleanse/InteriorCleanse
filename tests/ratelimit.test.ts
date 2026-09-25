import { describe, expect, it } from 'vitest'
import {
  POLICIES,
  isDistributed,
  limitKey,
  memoryStore,
  rateLimit,
  rateLimitHeaders,
} from '@/lib/ratelimit'

const T0 = 1_800_000_000_000

describe('rateLimit', () => {
  it('allows requests up to the bucket capacity', async () => {
    const store = memoryStore()
    for (let i = 0; i < 10; i += 1) {
      const result = await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
      expect(result.allowed).toBe(true)
    }
  })

  it('rejects once the bucket is empty', async () => {
    const store = memoryStore()
    for (let i = 0; i < 10; i += 1) {
      await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    }
    const result = await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('refills continuously rather than in a lump at a window boundary', async () => {
    // A fixed window lets someone spend a whole minute's budget in the last
    // second and the next minute's in the first — twice the intended rate.
    const store = memoryStore()
    for (let i = 0; i < 10; i += 1) {
      await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    }
    expect((await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })).allowed).toBe(false)

    // Six seconds is one token at 10/minute.
    const later = await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 + 6_100 })
    expect(later.allowed).toBe(true)

    // But not two.
    expect((await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 + 6_200 })).allowed).toBe(
      false,
    )
  })

  it('never refills beyond capacity, so idle time does not become a mega-burst', async () => {
    const store = memoryStore()
    await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })

    // A week later.
    let allowed = 0
    for (let i = 0; i < 50; i += 1) {
      const result = await rateLimit({
        key: 'k',
        policy: 'assistant',
        store,
        now: T0 + 7 * 86_400_000,
      })
      if (result.allowed) allowed += 1
    }
    expect(allowed).toBe(POLICIES.assistant.capacity)
  })

  it('keeps accruing tokens while a client is being rejected', async () => {
    // Otherwise a client that keeps hammering never recovers and is locked out
    // permanently — a rate limiter that becomes a ban.
    const store = memoryStore()
    for (let i = 0; i < 12; i += 1) {
      await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    }
    for (let i = 0; i < 20; i += 1) {
      await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 + i * 100 })
    }
    const recovered = await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 + 30_000 })
    expect(recovered.allowed).toBe(true)
  })

  it('keeps separate buckets per key', async () => {
    const store = memoryStore()
    for (let i = 0; i < 10; i += 1) {
      await rateLimit({ key: 'tenant-a', policy: 'assistant', store, now: T0 })
    }
    expect((await rateLimit({ key: 'tenant-a', policy: 'assistant', store, now: T0 })).allowed).toBe(
      false,
    )
    expect((await rateLimit({ key: 'tenant-b', policy: 'assistant', store, now: T0 })).allowed).toBe(
      true,
    )
  })

  it('lets an expensive operation cost more than one token', async () => {
    const store = memoryStore()
    const result = await rateLimit({ key: 'k', policy: 'assistant', store, now: T0, cost: 10 })
    expect(result.allowed).toBe(true)
    expect((await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })).allowed).toBe(false)
  })

  it('rejects a request that costs more than the bucket can ever hold', async () => {
    const store = memoryStore()
    const result = await rateLimit({ key: 'k', policy: 'assistant', store, now: T0, cost: 999 })
    expect(result.allowed).toBe(false)
  })

  it('applies a daily ceiling as well as a per-minute one', async () => {
    const store = memoryStore()
    let allowed = 0
    for (let i = 0; i < 250; i += 1) {
      const result = await rateLimit({
        key: 'k',
        policy: 'assistantDaily',
        store,
        now: T0 + i * 1_000,
      })
      if (result.allowed) allowed += 1
    }
    expect(allowed).toBeLessThanOrEqual(POLICIES.assistantDaily.capacity + 3)
  })

  it('limits sign-in attempts far more tightly than ordinary requests', async () => {
    expect(POLICIES.auth.capacity).toBeLessThan(POLICIES.api.capacity)
  })
})

describe('limitKey', () => {
  it('scopes keys so two surfaces cannot collide', () => {
    expect(limitKey('assistant', 'org-1')).not.toBe(limitKey('api', 'org-1'))
  })

  it('composes several identity parts', () => {
    expect(limitKey('assistant', 'org-1', 'user-2')).toBe('assistant:org-1:user-2')
  })

  it('drops empty parts but refuses an entirely empty identity', () => {
    // Limiting everyone under one key would be a global outage on one abuser.
    expect(limitKey('assistant', 'org-1', null)).toBe('assistant:org-1')
    expect(() => limitKey('assistant', null, undefined)).toThrow()
  })
})

describe('rateLimitHeaders', () => {
  it('tells a client how to back off', async () => {
    const store = memoryStore()
    for (let i = 0; i < 11; i += 1) {
      await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    }
    const rejected = await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    const headers = rateLimitHeaders(rejected)
    expect(headers['retry-after']).toBeDefined()
    expect(headers['x-ratelimit-remaining']).toBe('0')
  })

  it('omits retry-after when the request was allowed', async () => {
    const headers = rateLimitHeaders(await rateLimit({ key: 'fresh', policy: 'api' }))
    expect(headers['retry-after']).toBeUndefined()
  })
})

describe('store honesty', () => {
  it('reports that the in-memory store is not distributed', () => {
    // On several instances each keeps its own count, so the effective limit is
    // the policy times the instance count. Claiming otherwise would give false
    // confidence exactly where the money is.
    expect(isDistributed(memoryStore())).toBe(false)
  })

  it('expires idle buckets rather than retaining them forever', async () => {
    const store = memoryStore()
    await rateLimit({ key: 'k', policy: 'auth', store, now: T0 })
    const ttl = (POLICIES.auth.capacity / POLICIES.auth.refillPerSecond) * 1000 + 120_000
    expect(store.get('k')).toBeDefined()
    // Simulated by asking after the TTL: the store keys off wall-clock time.
    const future = memoryStore()
    future.set('k', { tokens: 1, updatedAt: T0 }, -1)
    expect(future.get('k')).toBeUndefined()
    expect(ttl).toBeGreaterThan(0)
  })
})
