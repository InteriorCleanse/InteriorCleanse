/**
 * Rate limiting.
 *
 * The assistant endpoint is the most expensive request in the product — every
 * call spends real money at a model provider — and until now it was unmetered
 * per tenant. That is the difference between a bug and a bill.
 *
 * A token bucket rather than a fixed window, because a fixed window lets
 * someone spend an entire minute's budget in the last second and the next
 * minute's in the first, producing a burst of twice the intended rate at every
 * boundary. A bucket refills continuously and the burst is bounded by its size.
 *
 * The store is behind an interface. The in-memory one is correct for a single
 * process and honest about not being correct across several — a serverless
 * deployment needs Redis, and pretending otherwise would give a false sense of
 * protection exactly where the money is.
 */

export type RateLimitResult = {
  allowed: boolean
  /** Tokens left after this request. */
  remaining: number
  /** Seconds until the next token, for a Retry-After header. */
  retryAfterSeconds: number
  limit: number
}

export type Bucket = { tokens: number; updatedAt: number }

export type RateLimitStore = {
  get: (key: string) => Promise<Bucket | undefined> | Bucket | undefined
  set: (key: string, bucket: Bucket, ttlMs: number) => Promise<void> | void
  readonly distributed: boolean
}

export type Policy = {
  /** Bucket size: the largest burst allowed. */
  capacity: number
  /** Tokens added per second. */
  refillPerSecond: number
}

/**
 * Policies are per-surface because the costs differ by orders of magnitude.
 * The assistant spends money at a provider; a page view does not.
 */
export const POLICIES = {
  assistant: { capacity: 10, refillPerSecond: 10 / 60 },
  assistantDaily: { capacity: 200, refillPerSecond: 200 / 86_400 },
  auth: { capacity: 5, refillPerSecond: 5 / 300 },
  webhook: { capacity: 100, refillPerSecond: 100 / 60 },
  api: { capacity: 60, refillPerSecond: 60 / 60 },
} as const satisfies Record<string, Policy>

export type PolicyName = keyof typeof POLICIES

/**
 * In-memory store.
 *
 * Correct for one process. On several — any serverless or multi-instance
 * deployment — each instance keeps its own count, so the effective limit is
 * the policy multiplied by the instance count. `distributed: false` says so,
 * and the launch checklist requires a distributed store before production.
 */
export function memoryStore(): RateLimitStore {
  const buckets = new Map<string, { bucket: Bucket; expiresAt: number }>()

  return {
    distributed: false,
    get(key) {
      const entry = buckets.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= Date.now()) {
        buckets.delete(key)
        return undefined
      }
      return entry.bucket
    },
    set(key, bucket, ttlMs) {
      buckets.set(key, { bucket, expiresAt: Date.now() + ttlMs })

      // Bounded so a flood of distinct keys cannot become a memory leak — which
      // would turn a rate limiter into a denial-of-service amplifier.
      if (buckets.size > 10_000) {
        const now = Date.now()
        for (const [k, v] of buckets) {
          if (v.expiresAt <= now) buckets.delete(k)
          if (buckets.size <= 8_000) break
        }
      }
    },
  }
}

const defaultStore = memoryStore()

export async function rateLimit(input: {
  /** Identity being limited. Must never be attacker-chosen — see `limitKey`. */
  key: string
  policy: PolicyName | Policy
  store?: RateLimitStore
  now?: number
  /** Tokens this request costs. A batch operation may cost more than one. */
  cost?: number
}): Promise<RateLimitResult> {
  const policy = typeof input.policy === 'string' ? POLICIES[input.policy] : input.policy
  const store = input.store ?? defaultStore
  const now = input.now ?? Date.now()
  const cost = input.cost ?? 1

  const existing = await store.get(input.key)
  const elapsedSeconds = existing ? Math.max(0, (now - existing.updatedAt) / 1000) : 0

  const tokens = Math.min(
    policy.capacity,
    (existing?.tokens ?? policy.capacity) + elapsedSeconds * policy.refillPerSecond,
  )

  // Time to live covers a full refill, so an idle key expires rather than being
  // retained forever.
  const ttlMs = Math.ceil((policy.capacity / policy.refillPerSecond) * 1000) + 60_000

  if (tokens < cost) {
    const deficit = cost - tokens
    // Persist the refilled value even on rejection: otherwise a client that
    // keeps hammering never accrues tokens and is locked out permanently.
    await store.set(input.key, { tokens, updatedAt: now }, ttlMs)
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(deficit / policy.refillPerSecond)),
      limit: policy.capacity,
    }
  }

  const remaining = tokens - cost
  await store.set(input.key, { tokens: remaining, updatedAt: now }, ttlMs)

  return {
    allowed: true,
    remaining: Math.floor(remaining),
    retryAfterSeconds: 0,
    limit: policy.capacity,
  }
}

/**
 * Builds a limit key.
 *
 * Scope comes first so keys from different surfaces cannot collide, and the
 * identity must be something the caller cannot choose. Limiting on a
 * client-supplied header is not rate limiting — it is a rate limit the
 * attacker configures.
 */
export function limitKey(scope: PolicyName, ...identity: (string | null | undefined)[]): string {
  const parts = identity.filter((part): part is string => Boolean(part))
  if (parts.length === 0) throw new Error('A rate-limit key needs an identity.')
  return `${scope}:${parts.join(':')}`
}

/** Standard headers, so a client can back off intelligently rather than retry blindly. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
  }
  if (!result.allowed) headers['retry-after'] = String(result.retryAfterSeconds)
  return headers
}

/** Whether the configured store is safe for a multi-instance deployment. */
export function isDistributed(store: RateLimitStore = defaultStore): boolean {
  return store.distributed
}
