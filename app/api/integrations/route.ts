import { z } from 'zod'
import { can } from '@/lib/authz'
import { getSessionContext } from '@/lib/session'
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server'
import { connector, validateCredential } from '@/lib/integrations/registry'
import { isVaultConfigured, maskSecret, sealSecret, vaultProvider } from '@/lib/vault'

/**
 * Connecting and disconnecting an integration.
 *
 * The only place in the product that writes a credential. Two rules it holds:
 *
 *   - **The plaintext never leaves this function.** It is validated, sealed,
 *     and the local reference dropped. It is never logged, never returned,
 *     never written to a non-sealed column, and never echoed in an error.
 *   - **The service role is used for exactly one table.** `integration_credentials`
 *     has no RLS policies at all, so it is unreachable from a user session;
 *     that means authorization for it happens here, explicitly, before the
 *     write. Everything else on this request goes through the user's own
 *     client so RLS still applies.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const connectSchema = z.object({
  provider: z.string().min(1).max(40),
  displayName: z.string().min(1).max(80).optional(),
  /** Field key → plaintext secret. Consumed here and discarded. */
  credentials: z.record(z.string().min(1).max(4_000)).default({}),
  settings: z.record(z.unknown()).default({}),
})

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = connectSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Malformed request.' }, { status: 400 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = {
    userId: session.userId,
    tenantRole: membership.role,
    platformRole: session.platformRole,
  }
  if (!can(actor, 'integrations:connect')) {
    return Response.json(
      { error: 'Connecting an integration requires the Admin role.' },
      { status: 403 },
    )
  }

  const definition = connector(parsed.data.provider)
  if (!definition) return Response.json({ error: 'Unknown integration.' }, { status: 404 })
  if (definition.status !== 'available') {
    return Response.json(
      { error: `${definition.name} is not available yet.` },
      { status: 409 },
    )
  }

  if (definition.credentials.length > 0 && !isVaultConfigured()) {
    // Refuse rather than storing a credential in a way we cannot defend.
    return Response.json(
      {
        error:
          'Credential storage is not configured on this deployment, so integrations that need a key cannot be connected. Set VAULT_MASTER_KEY.',
      },
      { status: 503 },
    )
  }

  // Validate everything before writing anything: a half-connected integration
  // with one good key and one rejected one is worse than a clean failure.
  const settings = definition.settings
    ? definition.settings.safeParse(parsed.data.settings)
    : { success: true as const, data: parsed.data.settings }
  if (!settings.success) {
    return Response.json(
      { error: settings.error.issues[0]?.message ?? 'Those settings are not valid.' },
      { status: 400 },
    )
  }

  for (const field of definition.credentials) {
    const value = parsed.data.credentials[field.key]
    if (!value) {
      if (field.optional) continue
      return Response.json({ error: `${field.label} is required.` }, { status: 400 })
    }
    const check = validateCredential(definition, field.key, value)
    if (!check.ok) return Response.json({ error: check.reason }, { status: 400 })
  }

  const supabase = await supabaseServer()

  // The connection row goes through the user's client, so RLS confirms the
  // membership independently of the check above.
  const { data: connection, error: connectionError } = await supabase
    .from('integration_connections')
    .upsert(
      {
        organization_id: membership.organizationId,
        provider: definition.provider,
        display_name: parsed.data.displayName ?? definition.name,
        status: 'connected',
        status_detail: null,
        connected_by: session.userId,
        connected_at: new Date().toISOString(),
        settings: settings.data as Record<string, unknown>,
      },
      { onConflict: 'organization_id,provider' },
    )
    .select('id')
    .single()

  if (connectionError || !connection) {
    return Response.json({ error: 'The connection could not be saved.' }, { status: 500 })
  }

  const admin = supabaseAdmin()
  const kek = vaultProvider()
  const masked: Record<string, string> = {}

  for (const field of definition.credentials) {
    const value = parsed.data.credentials[field.key]?.trim()
    if (!value) continue

    // The credential id is part of the sealed context, so it must exist before
    // the seal. Reserving it here also means a retry cannot orphan ciphertext
    // under a different id.
    const credentialId = crypto.randomUUID()

    const sealed = await sealSecret(
      value,
      {
        organizationId: membership.organizationId,
        credentialId,
        field: field.key,
      },
      kek,
    )

    const hint = maskSecret(value)
    masked[field.key] = hint

    const { error } = await admin.from('integration_credentials').upsert(
      {
        id: credentialId,
        organization_id: membership.organizationId,
        connection_id: connection.id,
        field: field.key,
        sealed,
        key_id: sealed.wrappedKey.keyId,
        masked_hint: hint,
        rotated_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'connection_id,field' },
    )

    if (error) {
      // Never surface the driver's message: on a constraint violation Postgres
      // echoes the offending row, and the offending row contains ciphertext.
      return Response.json({ error: 'The credential could not be stored.' }, { status: 500 })
    }
  }

  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: session.userId,
    action: 'integration.connected',
    target_type: 'integration_connection',
    target_id: connection.id,
    metadata: { provider: definition.provider },
  })

  // Masked hints only. This is the last point at which the plaintext existed,
  // and it does not travel back.
  return Response.json({ connected: true, provider: definition.provider, masked })
}

const disconnectSchema = z.object({ provider: z.string().min(1).max(40) })

export async function DELETE(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = disconnectSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Malformed request.' }, { status: 400 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = {
    userId: session.userId,
    tenantRole: membership.role,
    platformRole: session.platformRole,
  }
  if (!can(actor, 'integrations:disconnect')) {
    return Response.json({ error: 'Disconnecting requires the Admin role.' }, { status: 403 })
  }

  const supabase = await supabaseServer()
  const { data: connection } = await supabase
    .from('integration_connections')
    .select('id')
    .eq('organization_id', membership.organizationId)
    .eq('provider', parsed.data.provider)
    .maybeSingle()

  if (!connection) return Response.json({ error: 'Not connected.' }, { status: 404 })

  // Delete the credential rather than marking it revoked: a disconnected
  // integration has no reason to keep ciphertext around, and the smallest
  // amount of retained secret material is none.
  await supabaseAdmin().from('integration_credentials').delete().eq('connection_id', connection.id)

  await supabase
    .from('integration_connections')
    .update({ status: 'not_connected', status_detail: null, connected_at: null })
    .eq('id', connection.id)

  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: session.userId,
    action: 'integration.disconnected',
    target_type: 'integration_connection',
    target_id: connection.id,
    metadata: { provider: parsed.data.provider },
  })

  return Response.json({ disconnected: true })
}
