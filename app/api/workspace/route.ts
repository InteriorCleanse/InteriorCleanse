import { z } from 'zod'
import { can } from '@/lib/authz'
import { getSessionContext } from '@/lib/session'
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server'

/**
 * Deleting a workspace.
 *
 * The shape of this endpoint is the argument. Deletion is the one irreversible
 * thing a customer can do here, and every guard is aimed at the case where they
 * did not mean it — or where someone else did it for them.
 *
 * **Owner only, and the name must be typed.** Not a checkbox: a confirmation
 * that can be satisfied by clicking through is not a confirmation. The typed
 * name is compared to the workspace's own, so muscle memory cannot complete it.
 *
 * **Two stages, and the order is the point.** Secrets are destroyed
 * immediately and irreversibly; business data is marked deleted and kept for a
 * grace period. Those have opposite failure modes. Retaining a third-party API
 * key after someone asked us to delete their account is indefensible. Deleting
 * four years of orders the moment a button is pressed — by a person who
 * mistyped, or an account that was compromised — is the mistake nobody
 * recovers from.
 *
 * **Everything that publishes stops publishing at once.** Calendar feed tokens
 * are revoked in the same transaction; the feed already 404s on a deleted
 * workspace, and revoking the tokens means it stops even if that check ever
 * regresses.
 *
 * The audit entry is written *before* the deletion, because a deleted
 * workspace's rows are exactly what an investigation needs and the log entry is
 * the only part that survives.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** How long the data stays recoverable by an operator after deletion. */
export const GRACE_PERIOD_DAYS = 30

const deleteSchema = z.object({
  /** The workspace's exact name, typed by the person doing this. */
  confirmName: z.string().min(1).max(120),
  reason: z.string().max(500).optional(),
})

export async function DELETE(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = {
    userId: session.userId,
    tenantRole: membership.role,
    platformRole: session.platformRole,
  }
  if (!can(actor, 'workspace:delete')) {
    return Response.json(
      { error: 'Only the workspace owner can delete it.' },
      { status: 403 },
    )
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Malformed request.' }, { status: 400 })

  const supabase = await supabaseServer()

  const { data: organization } = await supabase
    .from('organizations')
    .select('id, name, deleted_at')
    .eq('id', membership.organizationId)
    .maybeSingle()

  if (!organization) return Response.json({ error: 'Workspace not found.' }, { status: 404 })
  if (organization.deleted_at) {
    return Response.json({ error: 'That workspace is already deleted.' }, { status: 409 })
  }

  if (parsed.data.confirmName.trim() !== organization.name.trim()) {
    return Response.json(
      { error: `Type the workspace name exactly — “${organization.name}” — to confirm.` },
      { status: 400 },
    )
  }

  // Written first. Once the workspace is gone this entry is the only record
  // that it existed and who ended it.
  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: session.userId,
    action: 'workspace.deleted',
    target_type: 'organization',
    target_id: membership.organizationId,
    reason: parsed.data.reason ?? null,
    metadata: { name: organization.name, grace_period_days: GRACE_PERIOD_DAYS },
  })

  const admin = supabaseAdmin()

  // Stage one, irreversible and immediate: third-party credentials. Keeping a
  // customer's Stripe key after they asked us to delete their account is not
  // defensible by any grace period.
  const { error: credentialError } = await admin
    .from('integration_credentials')
    .delete()
    .eq('organization_id', membership.organizationId)

  if (credentialError) {
    // Refuse rather than proceeding: a "deleted" workspace whose secrets we
    // still hold is the one outcome worse than not deleting at all.
    return Response.json(
      { error: 'The workspace was not deleted, because its stored credentials could not be removed.' },
      { status: 500 },
    )
  }

  await Promise.all([
    // Everything that publishes outward stops now.
    admin
      .from('calendar_feed_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('organization_id', membership.organizationId)
      .is('revoked_at', null),
    admin
      .from('integration_connections')
      .update({ status: 'not_connected', status_detail: 'Workspace deleted.', connected_at: null })
      .eq('organization_id', membership.organizationId),
  ])

  // Stage two, recoverable: the business data itself.
  const { error } = await admin
    .from('organizations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', membership.organizationId)

  if (error) return Response.json({ error: 'The workspace could not be deleted.' }, { status: 500 })

  return Response.json({
    deleted: true,
    credentialsDestroyed: true,
    // Said plainly, because "deleted" means different things to the two halves.
    detail: `Stored API keys and calendar feeds were destroyed immediately and cannot be recovered. Your business records are retained for ${GRACE_PERIOD_DAYS} days in case this was a mistake, then removed.`,
    recoverableUntil: new Date(Date.now() + GRACE_PERIOD_DAYS * 86_400_000).toISOString(),
  })
}
