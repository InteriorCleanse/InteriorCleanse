import {
  memoryStore,
  registerStoreFactory,
  type Bucket,
  type ConsumeInput,
  type ConsumeResult,
  type RateLimitStore,
} from './ratelimit'

/**
 * A distributed rate-limit store, over Upstash's Redis REST API.
 *
 * Chosen because it is one authenticated POST with no persistent connection,
 * which is the only shape that works on a serverless runtime where a process
 * may not outlive a request. No SDK: the thing that decides whether an
 * expensive endpoint runs should have as little machinery under it as possible.
 *
 * Three decisions carry the correctness:
 *
 * **The whole bucket operation is one Lua script.** Refill, test and deduct
 * happen inside Redis, atomically. Doing it as `GET` then `SET` from the
 * application is a read-modify-write: two instances read the same bucket, both
 * see enough tokens, both allow — the effective limit becomes the policy times
 * the instance count, which is the exact failure a shared store is bought to
 * fix. Reporting `distributed: true` while doing that would be worse than the
 * in-memory store, because it would be believed.
 *
 * **Redis's clock decides, not ours.** Instances disagree about the time by
 * milliseconds to seconds, and a bucket refilled against a fast instance's
 * clock hands out tokens that have not accrued. The script reads `TIME` from
 * the server so every instance shares one clock. A caller-supplied `now` is
 * honoured only when it is passed explicitly, which is how the tests stay
 * deterministic.
 *
 * **A store failure allows the request.** If Redis is unreachable the endpoint
 * is unprotected for that moment, which is bad; refusing every request instead
 * would take the product down entirely because the *limiter* is down, which is
 * worse. The failure is surfaced through `lastError` so it can be alerted on
 * rather than absorbed silently.
 */

/**
 * The token bucket, atomically.
 *
 * Returns the token count as a string: Redis converts Lua numbers to integers
 * on the way out, and truncating fractional tokens would let a client spend a
 * fraction of a token every request forever.
 */
const SCRIPT = `
local key      = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local cost     = tonumber(ARGV[3])
local ttl      = tonumber(ARGV[4])
local nowArg   = tonumber(ARGV[5])

local now
if nowArg > 0 then
  now = nowArg
else
  local t = redis.call('TIME')
  now = (tonumber(t[1]) * 1000) + (tonumber(t[2]) / 1000)
end

local stored = redis.call('HMGET', key, 'tokens', 'updated')
local tokens = tonumber(stored[1])
local updated = tonumber(stored[2])

if tokens == nil or updated == nil then
  tokens = capacity
  updated = now
end

local elapsed = (now - updated) / 1000
if elapsed < 0 then elapsed = 0 end

tokens = math.min(capacity, tokens + (elapsed * refill))

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

-- Written on rejection as well as on success. Otherwise a client that keeps
-- hammering never accrues tokens and is locked out permanently: a rate limiter
-- that has quietly become a ban.
redis.call('HSET', key, 'tokens', tokens, 'updated', now)
redis.call('PEXPIRE', key, ttl)

return { allowed, tostring(tokens) }
`

export type UpstashOptions = {
  url: string
  token: string
  fetch?: typeof globalThis.fetch
  /** A slow limiter must not become the latency of the endpoint it guards. */
  timeoutMs?: number
  onError?: (error: Error) => void
}

const DEFAULT_TIMEOUT_MS = 1_500

export function upstashStore(options: UpstashOptions): RateLimitStore & {
  lastError: Error | null
} {
  const doFetch = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const base = options.url.replace(/\/+$/, '')

  const state: { lastError: Error | null } = { lastError: null }

  async function command(payload: unknown[]): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await doFetch(base, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!response.ok) {
        // The body is discarded rather than surfaced: Upstash echoes the
        // command, and the command contains the tenant's limit key.
        await response.text().catch(() => '')
        throw new Error(`The rate-limit store returned ${response.status}.`)
      }

      const body = (await response.json()) as { result?: unknown; error?: string }
      if (body.error) throw new Error('The rate-limit store rejected the command.')
      return body.result
    } finally {
      clearTimeout(timer)
    }
  }

  function fail(error: unknown): void {
    const wrapped = error instanceof Error ? error : new Error('Unknown rate-limit store error.')
    state.lastError = wrapped
    options.onError?.(wrapped)
  }

  return {
    distributed: true,

    get lastError() {
      return state.lastError
    },

    async consume(input: ConsumeInput): Promise<ConsumeResult> {
      try {
        const result = (await command([
          'EVAL',
          SCRIPT,
          '1',
          input.key,
          String(input.capacity),
          String(input.refillPerSecond),
          String(input.cost),
          String(Math.ceil(input.ttlMs)),
          // Zero means "use Redis's own clock", which is the production path.
          String(input.now ?? 0),
        ])) as [number, string]

        state.lastError = null
        return { allowed: result[0] === 1, tokens: Number(result[1]) }
      } catch (error) {
        fail(error)
        // Fail open. An unreachable limiter must not take down the endpoint it
        // exists to protect; the error is recorded so it can be alerted on.
        return { allowed: true, tokens: input.capacity }
      }
    },

    // `get` and `set` exist to satisfy the interface and are not used once
    // `consume` is present. They are implemented rather than thrown from, so a
    // caller that reaches for them gets correct-if-racy behaviour instead of a
    // crash — but nothing in this codebase does.
    async get(key: string): Promise<Bucket | undefined> {
      try {
        const result = (await command(['HMGET', key, 'tokens', 'updated'])) as
          | (string | null)[]
          | null
        const tokens = Number(result?.[0])
        const updatedAt = Number(result?.[1])
        if (!Number.isFinite(tokens) || !Number.isFinite(updatedAt)) return undefined
        return { tokens, updatedAt }
      } catch (error) {
        fail(error)
        return undefined
      }
    },

    async set(key: string, bucket: Bucket, ttlMs: number): Promise<void> {
      try {
        await command(['HSET', key, 'tokens', String(bucket.tokens), 'updated', String(bucket.updatedAt)])
        await command(['PEXPIRE', key, String(Math.ceil(ttlMs))])
      } catch (error) {
        fail(error)
      }
    },
  }
}

/**
 * Builds the store this deployment should use.
 *
 * Returns null when Upstash is not configured, so the caller falls back to the
 * in-memory store and `isDistributed()` reports false. Guessing at a local
 * Redis here would produce a store that silently does nothing.
 */
export function upstashFromEnv(): RateLimitStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) return null
  return upstashStore({ url, token })
}

registerStoreFactory(() => upstashFromEnv() ?? memoryStore())
