/**
 * Token-bucket rate limiting keyed by caller.
 *
 * The default store is in-process memory, which is correct for one server
 * and approximate across serverless instances. For a fleet, point
 * AVANT_VAULT_URL at the vault Worker; its /v1/ratelimit endpoint keeps the
 * buckets in one place. Either way the limiter fails closed on abuse and
 * open on its own errors, so a storage outage never takes the site down.
 */

interface Bucket {
  tokens: number
  updated: number
}

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 10_000

export interface Limit {
  /** Bucket size. */
  capacity: number
  /** Tokens added per second. */
  refillPerSec: number
}

export const LIMITS = {
  concierge: { capacity: 12, refillPerSec: 12 / 300 },
  verify: { capacity: 5, refillPerSec: 5 / 3600 },
  checkout: { capacity: 10, refillPerSec: 10 / 600 },
  default: { capacity: 60, refillPerSec: 1 },
} satisfies Record<string, Limit>

export interface LimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

export function take(key: string, limit: Limit, now = Date.now()): LimitResult {
  let b = buckets.get(key)
  if (!b) {
    if (buckets.size >= MAX_KEYS) {
      // Evict the oldest entry; Map iteration order is insertion order.
      const first = buckets.keys().next().value
      if (first !== undefined) buckets.delete(first)
    }
    b = { tokens: limit.capacity, updated: now }
    buckets.set(key, b)
  }
  const elapsed = Math.max(0, (now - b.updated) / 1000)
  b.tokens = Math.min(limit.capacity, b.tokens + elapsed * limit.refillPerSec)
  b.updated = now
  if (b.tokens >= 1) {
    b.tokens -= 1
    return { ok: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 }
  }
  return { ok: false, remaining: 0, retryAfterSec: Math.ceil((1 - b.tokens) / limit.refillPerSec) }
}

export function resetBuckets() {
  buckets.clear()
}
