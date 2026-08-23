import { z } from 'zod'
import { can } from '@/lib/authz'
import { ADAPTERS, syncConnection, type ConnectionRow } from '@/lib/integrations/sync'
import { limitKey, rateLimit, rateLimitHeaders } from '@/lib/ratelimit'
import { getSessionContext } from '@/lib/session'
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server'
import { isVaultConfigured } from '@/lib/vault'

/**
 * Running a connector sync on demand.
 *
 * Two callers, deliberately kept apart:
 *
 *   **POST** — a signed-in admin pressing "Sync now". Authorization comes from
 *   the session; the workspace comes from the session's membership and never
 *   from the request body, so no caller can name a tenant they are not in.
 *
 *   **GET** — the scheduler. Authenticated by a shared secret in a header,
 *   compared in constant time, and it syncs every connection that is due. There
 *   is no session, so it uses the service role — which is exactly why it must
 *   never accept an organization id from the caller either.
 *
 * The sync itself is the slow part and runs inline. That is honest for a "sync
 * now" button, and `runSync`'s page budget is what keeps the request bounded
 * rather than a hope that the account is small.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const syncSchema = z.object({ provider: z.string().min(1).max(40) })

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = {
    userId: session.userId,
    tenantRole: membership.role,
    platformRole: session.platformRole,
  }
  if (!can(actor, 'integrations:connect')) {
    return Response.json({ error: 'Running a sync requires the Admin role.' }, { status: 403 })
  }

  // A sync is expensive for us and for the vendor, and a held button would
  // otherwise be a way to burn a workspace's rate limit at the vendor.
  const limit = await rateLimit({
    key: limitKey('api', membership.organizationId, session.userId),
    policy: 'api',
    cost: 10,
  })
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many syncs in a short time. Try again shortly.' },
      { status: 429, headers: rateLimitHeaders(limit) },
    )
  }

  const parsed = syncSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Malformed request.' }, { status: 400 })

  if (!ADAPTERS[parsed.data.provider]) {
    return Response.json(
      { error: `${parsed.data.provider} does not have an automatic sync.` },
      { status: 409 },
    )
  }

  if (!isVaultConfigured()) {
    return Response.json(
      { error: 'Credential storage is not configured, so no credential can be opened to sync.' },
      { status: 503 },
    )
  }

  // Read the connection through the user's own client so RLS confirms the
  // membership a second time, independently of the check above.
  const supabase = await supabaseServer()
  const { data: connection } = await supabase
    .from('integration_connections')
    .select('id, organization_id, provider, settings, last_success_at')
    .eq('organization_id', membership.organizationId)
    .eq('provider', parsed.data.provider)
    .maybeSingle()

  if (!connection) return Response.json({ error: 'Not connected.' }, { status: 404 })

  const outcome = await syncConnection(supabaseAdmin(), connection as ConnectionRow)

  return Response.json({
    status: outcome.status,
    recordsRead: outcome.recordsRead,
    recordsWritten: outcome.recordsWritten,
    truncated: outcome.truncated,
    // The operator-facing message, which by construction never contains a
    // credential or a vendor payload.
    detail: outcome.error,
  })
}

/**
 * Scheduled sweep. Called by cron with `x-sync-secret`.
 *
 * Returns 404 rather than 401 when the secret is unset or wrong: an endpoint
 * that answers "wrong password" confirms it exists and is worth attacking.
 */
export async function GET(request: Request) {
  const expected = process.env.SYNC_CRON_SECRET
  if (!expected || !timingSafeEqual(request.headers.get('x-sync-secret') ?? '', expected)) {
    return new Response('Not found', { status: 404 })
  }

  const admin = supabaseAdmin()
  const dueBefore = new Date(Date.now() - MIN_INTERVAL_MS).toISOString()

  const { data: connections } = await admin
    .from('integration_connections')
    .select('id, organization_id, provider, settings, last_success_at, last_attempt_at')
    .in('provider', Object.keys(ADAPTERS))
    .in('status', ['connected', 'degraded'])
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${dueBefore}`)
    .limit(BATCH_SIZE)

  const results: { connectionId: string; status: string; written: number }[] = []

  for (const connection of connections ?? []) {
    const outcome = await syncConnection(admin, connection as ConnectionRow)
    results.push({
      connectionId: connection.id,
      status: outcome.status,
      written: outcome.recordsWritten,
    })
  }

  // Counts only. This response is not a place to describe other tenants'
  // failures in detail, even behind a shared secret.
  return Response.json({ swept: results.length, results })
}

/** Do not re-sync a connection more often than this, however often cron runs. */
const MIN_INTERVAL_MS = 50 * 60_000
/** Bounded so one invocation terminates; the next sweep takes the rest. */
const BATCH_SIZE = 25

/**
 * Constant-time comparison.
 *
 * `a === b` on a secret returns as soon as two bytes differ, which leaks the
 * length of the matching prefix to anyone who can measure it.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
