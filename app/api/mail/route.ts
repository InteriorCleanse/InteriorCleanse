import { z } from 'zod'
import { getSessionContext } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Disconnecting a mailbox.
 *
 * The one thing a person must always be able to do with a connected inbox is
 * take it away again. The delete runs through the person's own client, so RLS
 * limits it to their own rows; the sealed refresh token goes with the row by
 * cascade, and the audit log says it happened.
 *
 * This revokes our copy. Google's own grant is removed from the person's
 * account settings, and the response says so rather than implying otherwise.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ provider: z.literal('gmail') })

export async function DELETE(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Malformed request.' }, { status: 400 })

  const supabase = await supabaseServer()
  const { data: removed, error } = await supabase
    .from('mail_connections')
    .delete()
    .eq('organization_id', membership.organizationId)
    .eq('user_id', session.userId)
    .eq('provider', parsed.data.provider)
    .select('id, account_email')

  if (error) return Response.json({ error: 'The mailbox could not be disconnected.' }, { status: 500 })

  for (const row of removed ?? []) {
    await supabase.from('audit_logs').insert({
      organization_id: membership.organizationId,
      actor_user_id: session.userId,
      action: 'mail.disconnected',
      target_type: 'mail_connection',
      target_id: row.id,
      metadata: { provider: parsed.data.provider, account_email: row.account_email },
    })
  }

  return Response.json({
    removed: removed?.length ?? 0,
    message:
      (removed?.length ?? 0) > 0
        ? 'Disconnected. Nothing from that mailbox is stored here. To remove the grant on Google’s side too, open your Google account’s connected apps.'
        : 'No mailbox was connected.',
  })
}
