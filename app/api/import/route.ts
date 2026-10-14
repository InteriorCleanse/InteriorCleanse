import { z } from 'zod'
import { can } from '@/lib/authz'
import { commitImport, MAX_IMPORT_BYTES, rollbackImport } from '@/lib/import/commit'
import { limitKey, rateLimit, rateLimitHeaders } from '@/lib/ratelimit-configured'
import { getSessionContext } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Committing and rolling back a CSV import.
 *
 * Both run through the **person's own client**. Inserting is allowed by RLS
 * from the Member role, deleting from Admin, and `rollback_import_batch()`
 * checks the role itself — so the authorization here is the same policy the
 * database enforces, stated early so the person gets a sentence instead of a
 * constraint error. The workspace is the caller's membership; the request
 * body cannot name one.
 *
 * The file travels as text and is parsed again on the server with the same
 * pure functions that produced the preview. A list of "validated rows" from
 * the browser would be a list of whatever the browser said.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CommitBody = z.object({
  kind: z.enum(['orders', 'expenses']),
  filename: z.string().min(1).max(200),
  text: z.string().min(1).max(MAX_IMPORT_BYTES),
  mapping: z.record(z.string(), z.string().max(200).nullable()),
})

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = { userId: session.userId, tenantRole: membership.role, platformRole: session.platformRole }
  if (!can(actor, 'data:import')) {
    return Response.json({ error: 'Importing requires the Member role or above.' }, { status: 403 })
  }
  if (membership.isDemo) {
    return Response.json(
      { error: 'A demo workspace keeps its own figures. Create a workspace of your own to import.' },
      { status: 409 },
    )
  }

  const limit = await rateLimit({
    key: limitKey('api', membership.organizationId, session.userId),
    policy: 'api',
    cost: 10,
  })
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many imports in a short time. Try again shortly.' },
      { status: 429, headers: rateLimitHeaders(limit) },
    )
  }

  const length = Number(request.headers.get('content-length') ?? '0')
  if (length > MAX_IMPORT_BYTES * 1.1) {
    return Response.json({ error: 'That file is too large for one import. Split it and import in parts.' }, { status: 413 })
  }

  let body: z.infer<typeof CommitBody>
  try {
    body = CommitBody.parse(await request.json())
  } catch {
    return Response.json({ error: 'The import request was not understood.' }, { status: 400 })
  }

  const supabase = await supabaseServer()
  try {
    const result = await commitImport(supabase, {
      organizationId: membership.organizationId,
      userId: session.userId,
      kind: body.kind,
      filename: body.filename,
      text: body.text,
      mapping: body.mapping,
      defaultCurrency: membership.baseCurrency,
    })

    if (result.status === 'duplicate_file') {
      return Response.json(
        { error: 'This exact file has already been imported into this workspace.', status: result.status },
        { status: 409 },
      )
    }
    if (result.status === 'failed') {
      return Response.json(
        { error: `The import stopped partway: ${result.message}. An admin can roll back batch ${result.batchId}.`, status: result.status, batchId: result.batchId },
        { status: 500 },
      )
    }
    return Response.json(result)
  } catch (error) {
    // The message is the database's, about this person's own write; no row
    // content and no other tenant's data can be in it.
    return Response.json(
      { error: error instanceof Error ? error.message : 'Import failed.' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = { userId: session.userId, tenantRole: membership.role, platformRole: session.platformRole }
  if (!can(actor, 'data:import')) {
    return Response.json({ error: 'Rolling back requires the Member role or above.' }, { status: 403 })
  }

  const batchId = new URL(request.url).searchParams.get('batch') ?? ''
  if (!z.string().uuid().safeParse(batchId).success) {
    return Response.json({ error: 'Which batch?' }, { status: 400 })
  }

  const limit = await rateLimit({
    key: limitKey('api', membership.organizationId, session.userId),
    policy: 'api',
    cost: 5,
  })
  if (!limit.allowed) {
    return Response.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: rateLimitHeaders(limit) })
  }

  const supabase = await supabaseServer()
  try {
    // The function finds the batch under RLS (another tenant's does not
    // exist here) and refuses below Admin, so no organization check is
    // needed or possible to get wrong.
    const { removed } = await rollbackImport(supabase, batchId)
    return Response.json({ removed })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rollback failed.'
    const status = /not found/i.test(message) ? 404 : /only an admin/i.test(message) ? 403 : 500
    return Response.json({ error: message }, { status })
  }
}
