/**
 * The rate limiter, wired to whatever store this deployment has.
 *
 * **Every request path imports the limiter from here, never from
 * `@/lib/ratelimit` directly.** That is the whole point of this file: importing
 * it is what registers the distributed store, so it is impossible to use the
 * limiter without the store being configured. The alternative — a side-effect
 * import in a startup file — works right up until someone adds a new route, an
 * edge runtime skips the startup hook, or a refactor drops the import, at which
 * point the endpoint silently falls back to per-instance limits and nothing
 * says so.
 *
 * `lib/ratelimit.ts` stays free of any transport concern and testable with no
 * network; `lib/ratelimit-upstash.ts` knows about HTTP and nothing about
 * policies. This file is the one line that joins them.
 */

import './ratelimit-upstash'

export {
  POLICIES,
  isDistributed,
  limitKey,
  rateLimit,
  rateLimitHeaders,
  rateLimitStore,
  type PolicyName,
  type RateLimitResult,
} from './ratelimit'
