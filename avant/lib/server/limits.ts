/**
 * Rate limits shared across every server instance, in Postgres. The
 * in-memory limiter (lib/security/rate-limit.ts) stays as a cheap first
 * line; this one is what holds on serverless, where each instance would
 * otherwise keep its own count and an attacker gets a fresh allowance on
 * every cold start.
 *
 * A token bucket per key, refilled continuously, updated in one atomic
 * statement. Keys are stored as SHA-256 hashes, so the table never holds an
 * email address or an IP.
 */

import { createHash } from 'node:crypto'
import type { Limit } from '../security/rate-limit.ts'
import { db } from './db.ts'

export interface SharedResult {
  ok: boolean
  retryAfterSec: number
}

export async function takeShared(key: string, limit: Limit): Promise<SharedResult> {
  const hash = createHash('sha256').update(key).digest('hex')
  const [row] = await (await db()).query<{ tokens: number }>(
    `insert into rate_limits (key_hash, tokens, updated) values ($1, $2::double precision - 1, now())
     on conflict (key_hash) do update set
       tokens = greatest(-1, least($2::double precision, rate_limits.tokens + extract(epoch from (now() - rate_limits.updated)) * $3::double precision) - 1),
       updated = now()
     returning tokens`,
    [hash, limit.capacity, limit.refillPerSec],
  )
  const tokens = Number(row.tokens)
  // A request that took the bucket below zero is refused.
  return tokens >= 0 ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.ceil((0 - tokens) / limit.refillPerSec) }
}

/** Checks every key; the first one over its limit refuses the request. */
export async function sharedLimit(limit: Limit, ...keys: string[]): Promise<Response | null> {
  for (const key of keys) {
    const r = await takeShared(key, limit)
    if (!r.ok) {
      return Response.json(
        { error: 'Too many attempts. Try again in a few minutes.' },
        { status: 429, headers: { 'Retry-After': String(r.retryAfterSec), 'Cache-Control': 'no-store' } },
      )
    }
  }
  return null
}
