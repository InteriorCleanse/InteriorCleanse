import { can } from '@/lib/authz'
import { buildWorkspaceExport, EXPORTED_TABLES } from '@/lib/workspace/export'
import { limitKey, rateLimit, rateLimitHeaders } from '@/lib/ratelimit-configured'
import { getSessionContext } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Downloading everything in a workspace.
 *
 * Read through the **user's own client**, so RLS decides what comes out. That
 * is not belt-and-braces: an export is the one endpoint whose whole job is to
 * emit rows in bulk, and doing it with the service role would mean a single
 * wrong `organization_id` in this file becomes a cross-tenant data dump. With
 * RLS in front, the worst a bug here can produce is an empty file.
 *
 * Deliberately available while the workspace is read-only. A past-due account
 * that cannot get its data out is being held hostage, and `readOnly()` keeps
 * `csvExport: true` for exactly this reason.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = {
    userId: session.userId,
    tenantRole: membership.role,
    platformRole: session.platformRole,
  }
  // Everything in the workspace in one file is an admin-level act, even though
  // every individual row in it is already visible to the person asking.
  if (!can(actor, 'integrations:view')) {
    return Response.json({ error: 'Exporting requires the Analyst role or above.' }, { status: 403 })
  }

  const limit = await rateLimit({
    key: limitKey('api', membership.organizationId, session.userId),
    policy: 'api',
    cost: 20,
  })
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many exports in a short time. Try again shortly.' },
      { status: 429, headers: rateLimitHeaders(limit) },
    )
  }

  const supabase = await supabaseServer()

  const data = await buildWorkspaceExport({
    organizationId: membership.organizationId,
    read: async (table) => {
      const { data: rows, error } = await supabase.from(table).select('*')
      if (error) throw new Error(error.message)
      return (rows ?? []) as Record<string, unknown>[]
    },
  })

  // Recorded like any other consequential act. An export is the event most
  // worth being able to point at after someone leaves.
  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: session.userId,
    action: 'workspace.exported',
    target_type: 'organization',
    target_id: membership.organizationId,
    metadata: {
      tables: EXPORTED_TABLES.length,
      rows: data.tables.reduce((sum, t) => sum + t.rows.length, 0),
    },
  })

  const filename = `workspace-export-${data.exportedAt.slice(0, 10)}.json`

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      // Never cached anywhere: this is the whole of a customer's business.
      'cache-control': 'no-store, private',
      ...(new URL(request.url).searchParams.has('debug') ? {} : {}),
    },
  })
}
