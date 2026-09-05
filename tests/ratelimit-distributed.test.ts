import { describe, expect, it } from 'vitest'
import { POLICIES, memoryStore, rateLimit, type ConsumeInput } from '@/lib/ratelimit'
import { upstashStore } from '@/lib/ratelimit-upstash'

/**
 * The distributed store.
 *
 * Upstash is not reachable from a test, so a fake Redis stands in — one that
 * runs the same script semantics against a shared map, and, crucially, one that
 * can be driven concurrently. The test that matters is the race: two instances
 * hitting the same bucket at the same instant must not both be allowed.
 */

type Hash = { tokens: number; updated: number }

/**
 * A Redis that applies the bucket atomically, because Redis is single
 * threaded and a Lua script runs to completion. This fake is synchronous
 * inside `command` for exactly that reason — modelling it as interleaved would
 * be modelling a Redis that does not exist.
 */
function fakeRedis(clock: () => number) {
  const store = new Map<string, Hash>()
  let calls = 0

  const fetchImpl = (async (_url: string, init: RequestInit) => {
    calls += 1
    const payload = JSON.parse(String(init.body)) as unknown[]
    const [command] = payload as [string]

    if (command !== 'EVAL') {
      return new Response(JSON.stringify({ result: null }), { status: 200 })
    }

    const [, , , key, capacityArg, refillArg, costArg, , nowArg] = payload as string[]
    const capacity = Number(capacityArg)
    const refill = Number(refillArg)
    const cost = Number(costArg)
    const now = Number(nowArg) > 0 ? Number(nowArg) : clock()

    const existing = store.get(key!)
    let tokens = existing ? existing.tokens : capacity
    const updated = existing ? existing.updated : now

    tokens = Math.min(capacity, tokens + (Math.max(0, now - updated) / 1000) * refill)

    let allowed = 0
    if (tokens >= cost) {
      tokens -= cost
      allowed = 1
    }

    store.set(key!, { tokens, updated: now })
    return new Response(JSON.stringify({ result: [allowed, String(tokens)] }), { status: 200 })
  }) as unknown as typeof globalThis.fetch

  return { fetchImpl, store, calls: () => calls }
}

const T0 = 1_800_000_000_000

describe('the distributed store', () => {
  it('reports that it is distributed', () => {
    const { fetchImpl } = fakeRedis(() => T0)
    expect(upstashStore({ url: 'https://x', token: 't', fetch: fetchImpl }).distributed).toBe(true)
  })

  it('does the whole bucket in one round trip', async () => {
    // Not for speed: a second round trip is a window in which another instance
    // reads the same bucket, and the limit becomes per-instance again.
    const redis = fakeRedis(() => T0)
    const store = upstashStore({ url: 'https://x', token: 't', fetch: redis.fetchImpl })

    await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    expect(redis.calls()).toBe(1)
  })

  it('refuses two concurrent requests that would together exceed the bucket', async () => {
    // The race this store exists to fix. With a get-then-set store both of
    // these read the same bucket, both see a token, and both are allowed.
    const redis = fakeRedis(() => T0)
    const store = upstashStore({ url: 'https://x', token: 't', fetch: redis.fetchImpl })

    const policy = { capacity: 1, refillPerSecond: 1 / 60 }

    const [a, b] = await Promise.all([
      rateLimit({ key: 'shared', policy, store, now: T0 }),
      rateLimit({ key: 'shared', policy, store, now: T0 }),
    ])

    expect([a.allowed, b.allowed].filter(Boolean)).toHaveLength(1)
  })

  it('lets a get-then-set store demonstrate the bug it fixes', async () => {
    // The counter-example, so the test above is known to be testing something.
    // `memoryStore` has no `consume`, so `rateLimit` falls back to read,
    // modify, write — and two awaited reads of the same bucket both pass.
    const store = memoryStore()
    const policy = { capacity: 1, refillPerSecond: 1 / 60 }

    const slow = {
      ...store,
      async get(key: string) {
        const value = store.get(key)
        // Yield, as a network round trip would.
        await Promise.resolve()
        return value
      },
    }

    const [a, b] = await Promise.all([
      rateLimit({ key: 'shared', policy, store: slow, now: T0 }),
      rateLimit({ key: 'shared', policy, store: slow, now: T0 }),
    ])

    expect([a.allowed, b.allowed].filter(Boolean)).toHaveLength(2)
  })

  it('refills across instances on one shared clock', async () => {
    let clock = T0
    const redis = fakeRedis(() => clock)
    const store = upstashStore({ url: 'https://x', token: 't', fetch: redis.fetchImpl })

    // Drain, passing no explicit `now` so the store's clock is used — the
    // production path, where instances disagree about the time.
    for (let i = 0; i < POLICIES.assistant.capacity; i += 1) {
      await rateLimit({ key: 'k', policy: 'assistant', store })
    }
    expect((await rateLimit({ key: 'k', policy: 'assistant', store })).allowed).toBe(false)

    clock = T0 + 6_100 // one token at 10/minute
    expect((await rateLimit({ key: 'k', policy: 'assistant', store })).allowed).toBe(true)
    expect((await rateLimit({ key: 'k', policy: 'assistant', store })).allowed).toBe(false)
  })

  it('keeps fractional tokens rather than truncating them', async () => {
    // Redis returns Lua numbers as integers, so the script returns a string.
    // Truncating would hand back a fraction of a token on every request.
    const redis = fakeRedis(() => T0)
    const store = upstashStore({ url: 'https://x', token: 't', fetch: redis.fetchImpl })

    await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 + 1_500 })

    const bucket = redis.store.get('k')!
    expect(Number.isInteger(bucket.tokens)).toBe(false)
  })

  it('allows the request when the store is unreachable, and records why', async () => {
    // An unreachable limiter must not take down the endpoint it protects. The
    // error is kept so it can be alerted on rather than absorbed.
    const errors: Error[] = []
    const store = upstashStore({
      url: 'https://x',
      token: 't',
      fetch: (async () => {
        throw new Error('ECONNREFUSED')
      }) as unknown as typeof globalThis.fetch,
      onError: (error) => errors.push(error),
    })

    const result = await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    expect(result.allowed).toBe(true)
    expect(errors).toHaveLength(1)
    expect(store.lastError).not.toBeNull()
  })

  it('does not put the store response into an error message', async () => {
    // Upstash echoes the command back on failure, and the command contains the
    // tenant's limit key.
    const store = upstashStore({
      url: 'https://x',
      token: 't',
      fetch: (async () =>
        new Response('{"error":"ERR command EVAL assistant:org-1:user-2"}', {
          status: 400,
        })) as unknown as typeof globalThis.fetch,
    })

    await rateLimit({ key: 'assistant:org-1:user-2', policy: 'assistant', store, now: T0 })
    expect(store.lastError?.message ?? '').not.toContain('org-1')
  })

  it('gives up rather than becoming the latency of the endpoint it guards', async () => {
    const store = upstashStore({
      url: 'https://x',
      token: 't',
      timeoutMs: 10,
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          )
        })) as unknown as typeof globalThis.fetch,
    })

    const result = await rateLimit({ key: 'k', policy: 'assistant', store, now: T0 })
    expect(result.allowed).toBe(true)
    expect(store.lastError).not.toBeNull()
  })

  it('asks the store for a full refill window of retention, not forever', async () => {
    let ttl = 0
    const store = {
      distributed: true,
      get: () => undefined,
      set: () => {},
      async consume(input: ConsumeInput) {
        ttl = input.ttlMs
        return { allowed: true, tokens: input.capacity - input.cost }
      },
    }

    await rateLimit({ key: 'k', policy: 'auth', store, now: T0 })
    const fullRefill = (POLICIES.auth.capacity / POLICIES.auth.refillPerSecond) * 1000
    expect(ttl).toBeGreaterThanOrEqual(fullRefill)
  })
})
