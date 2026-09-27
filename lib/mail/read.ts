import type { SupabaseClient } from '@supabase/supabase-js'
import { OAuthError, calendarCredentials, refreshAccessToken } from '@/lib/calendar/oauth'
import { tokenToStore } from '@/lib/calendar/sync'
import { maskSecret, openSecret, sealSecret, vaultProvider, type SealedSecret } from '@/lib/vault'
import { MailError, fetchUnread, type MailMessage } from './gmail'

/**
 * Reading a person's inbox through their stored connection.
 *
 * The shape is the calendar refresh's, for the same reasons: the refresh
 * token is opened, used, and written back if the provider rotated it, all in
 * one call; a rejected refresh is permanent and marks the connection
 * `revoked` so the person is told to reconnect rather than retried forever;
 * a vendor 5xx is `degraded` and is simply tried again next time.
 *
 * The difference from the calendar is what is kept: nothing. Messages are
 * returned to the caller and forgotten. The connection row records only
 * when it was last read and whether that worked.
 *
 * The plaintext token never leaves this module — not returned, not logged,
 * not placed in an error message.
 */

export type MailConnectionRow = {
  id: string
  organization_id: string
  user_id: string
  provider: string
  status: string
  last_checked_at: string | null
}

export type InboxRead = {
  status: 'succeeded' | 'failed' | 'skipped'
  messages: MailMessage[]
  connectionStatus: 'connected' | 'degraded' | 'revoked' | 'error'
  error: string | null
}

export async function readInbox(
  admin: SupabaseClient,
  connection: MailConnectionRow,
  options: { limit?: number; now?: Date; fetch?: typeof globalThis.fetch } = {},
): Promise<InboxRead> {
  const now = options.now ?? new Date()

  if (connection.provider !== 'gmail') {
    return { status: 'skipped', messages: [], connectionStatus: 'error', error: 'Unknown mail provider.' }
  }

  const credentials = calendarCredentials('gmail')
  if (!credentials) {
    return {
      status: 'skipped',
      messages: [],
      connectionStatus: 'error',
      error: 'Google is not configured on this deployment, so the mailbox cannot be read.',
    }
  }

  const stored = await openMailRefreshToken(admin, connection)
  if (!stored) {
    const outcome: InboxRead = {
      status: 'failed',
      messages: [],
      connectionStatus: 'revoked',
      error: 'No usable credential is stored. Reconnect the mailbox.',
    }
    await recordOutcome(admin, connection, outcome, now)
    return outcome
  }

  let tokens
  try {
    tokens = await refreshAccessToken({
      provider: 'gmail',
      refreshToken: stored.token,
      credentials,
      fetch: options.fetch,
      now,
    })
  } catch (error) {
    const permanent = error instanceof OAuthError && !error.retryable
    const outcome: InboxRead = {
      status: 'failed',
      messages: [],
      connectionStatus: permanent ? 'revoked' : 'degraded',
      error: error instanceof Error ? error.message : 'The mailbox token could not be refreshed.',
    }
    await recordOutcome(admin, connection, outcome, now)
    return outcome
  }

  const rotated = tokenToStore(stored.token, tokens.refreshToken)
  if (rotated) {
    await storeMailRefreshToken(admin, {
      organizationId: connection.organization_id,
      mailConnectionId: connection.id,
      refreshToken: rotated,
      existingCredentialId: stored.credentialId,
    })
  }

  let messages: MailMessage[]
  try {
    messages = await fetchUnread({
      accessToken: tokens.accessToken,
      limit: options.limit,
      fetch: options.fetch,
    })
  } catch (error) {
    const outcome: InboxRead = {
      status: 'failed',
      messages: [],
      connectionStatus: error instanceof MailError && !error.retryable ? 'revoked' : 'degraded',
      error: error instanceof Error ? error.message : 'Mail could not be fetched.',
    }
    await recordOutcome(admin, connection, outcome, now)
    return outcome
  }

  const outcome: InboxRead = { status: 'succeeded', messages, connectionStatus: 'connected', error: null }
  await recordOutcome(admin, connection, outcome, now)
  return outcome
}

async function recordOutcome(
  admin: SupabaseClient,
  connection: MailConnectionRow,
  outcome: InboxRead,
  now: Date,
): Promise<void> {
  await admin
    .from('mail_connections')
    .update({
      status: outcome.connectionStatus,
      status_detail: outcome.error,
      ...(outcome.status === 'succeeded' ? { last_checked_at: now.toISOString() } : {}),
    })
    .eq('id', connection.id)
}

async function openMailRefreshToken(
  admin: SupabaseClient,
  connection: MailConnectionRow,
): Promise<{ token: string; credentialId: string } | null> {
  const { data } = await admin
    .from('integration_credentials')
    .select('id, sealed')
    .eq('mail_connection_id', connection.id)
    .eq('field', 'refresh_token')
    .is('revoked_at', null)
    .maybeSingle()

  if (!data) return null

  try {
    const token = await openSecret(
      data.sealed as SealedSecret,
      { organizationId: connection.organization_id, credentialId: data.id, field: 'refresh_token' },
      vaultProvider(),
    )
    return { token, credentialId: data.id }
  } catch {
    // A token that will not open surfaces as a connection needing
    // reconnection, never as a vault exception naming key ids.
    return null
  }
}

/**
 * Seals a refresh token into the vault under the mailbox connection. Shared
 * with the OAuth callback so there is one way a mail token is stored.
 */
export async function storeMailRefreshToken(
  admin: SupabaseClient,
  input: {
    organizationId: string
    mailConnectionId: string
    refreshToken: string
    /** Reuse the row's id on rotation so the sealed context stays stable. */
    existingCredentialId?: string
  },
): Promise<boolean> {
  const credentialId = input.existingCredentialId ?? crypto.randomUUID()

  const sealed = await sealSecret(
    input.refreshToken,
    { organizationId: input.organizationId, credentialId, field: 'refresh_token' },
    vaultProvider(),
  )

  const row = {
    organization_id: input.organizationId,
    mail_connection_id: input.mailConnectionId,
    connection_id: null,
    calendar_connection_id: null,
    field: 'refresh_token',
    sealed,
    key_id: sealed.wrappedKey.keyId,
    masked_hint: maskSecret(input.refreshToken),
    rotated_at: new Date().toISOString(),
    revoked_at: null,
  }

  // An update on rotation and an insert on first connection, rather than an
  // upsert: a reconnect replaces the old row explicitly below, and neither
  // path depends on which index the database infers.
  const { error } = input.existingCredentialId
    ? await admin.from('integration_credentials').update(row).eq('id', credentialId)
    : await admin
        .from('integration_credentials')
        .delete()
        .eq('mail_connection_id', input.mailConnectionId)
        .eq('field', 'refresh_token')
        .then(() => admin.from('integration_credentials').insert({ id: credentialId, ...row }))

  // Never surface the driver's message: a constraint violation echoes the
  // row, and the row contains ciphertext.
  return !error
}
