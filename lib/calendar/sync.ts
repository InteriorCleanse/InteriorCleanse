import type { SupabaseClient } from '@supabase/supabase-js'
import { maskSecret, openSecret, sealSecret, vaultProvider, type SealedSecret } from '@/lib/vault'
import {
  OAuthError,
  calendarCredentials,
  fetchEvents,
  refreshAccessToken,
  type CalendarProvider,
} from './oauth'

/**
 * Keeping a connected calendar current.
 *
 * At connect time the callback pulled events once. Without this, that pull
 * was the last: a meeting added the next morning never appeared until the
 * person reconnected, which the launch checklist named as a gap. This is the
 * incremental refresh, run on the hourly sweep, and it is built around the one
 * thing that makes calendar sync different from commerce sync — the credential
 * itself expires.
 *
 * **The refresh token is opened, used, and — if the provider rotated it —
 * written back, all inside one call.** Microsoft rotates refresh tokens on
 * every use; Google does not. A rotated token that is not written back is a
 * connection that works exactly once more. So the write-back is not an
 * optimisation, it is the difference between a connection and a countdown.
 *
 * **A rejected refresh is permanent and says so.** `invalid_grant` means the
 * person revoked access, changed their password, or the token aged out. No
 * amount of retrying helps; the connection is marked `revoked` and the health
 * page tells them to reconnect. A vendor 5xx is `degraded` and retries next
 * sweep. Conflating the two is how a customer is told to rotate a working key.
 *
 * **Events are replaced within the window, not appended.** A meeting moved or
 * cancelled has to disappear. Upsert on the vendor's id handles moves; the
 * delete-then-upsert of the window handles cancellations, which the vendor
 * simply stops returning.
 *
 * **The plaintext token never leaves this module.** Not returned, not logged,
 * not placed in an error message. `syncCalendar` reports outcomes, not
 * credentials.
 */

/** How far ahead to keep. Deadlines and briefings live in this range. */
export const HORIZON_DAYS = 60
/** Do not refresh a calendar more often than this, however often cron runs. */
export const MIN_INTERVAL_MS = 55 * 60_000

export type CalendarConnectionRow = {
  id: string
  organization_id: string
  user_id: string
  provider: string
  status: string
  last_synced_at: string | null
}

export type CalendarSyncOutcome = {
  status: 'succeeded' | 'failed' | 'skipped'
  eventsWritten: number
  connectionStatus: 'connected' | 'degraded' | 'revoked' | 'error'
  error: string | null
}

/**
 * Which connections are due, decided in one place so the sweep and a future
 * "refresh now" button cannot disagree about it.
 */
export function isCalendarDue(
  connection: { status: string; last_synced_at: string | null },
  now: Date = new Date(),
): boolean {
  if (connection.status !== 'connected' && connection.status !== 'degraded') return false
  if (!connection.last_synced_at) return true
  return now.getTime() - new Date(connection.last_synced_at).getTime() >= MIN_INTERVAL_MS
}

/**
 * Decides whether a refresh response changes what is stored.
 *
 * Separated out because it is the one decision that silently kills a
 * connection when wrong: Google returns no refresh token on refresh and the
 * old one must be kept; Microsoft returns a new one and the old one is dead.
 */
export function tokenToStore(previous: string, refreshed: string | null): string | null {
  if (!refreshed || refreshed === previous) return null
  return refreshed
}

export async function syncCalendar(
  admin: SupabaseClient,
  connection: CalendarConnectionRow,
  options: { now?: Date; fetch?: typeof globalThis.fetch } = {},
): Promise<CalendarSyncOutcome> {
  const now = options.now ?? new Date()
  const provider = connection.provider as CalendarProvider

  const credentials = calendarCredentials(provider)
  if (!credentials) {
    return {
      status: 'skipped',
      eventsWritten: 0,
      connectionStatus: 'error',
      error: `${provider} is not configured on this deployment, so the connection cannot refresh.`,
    }
  }

  const stored = await openRefreshToken(admin, connection)
  if (!stored) {
    return {
      status: 'failed',
      eventsWritten: 0,
      connectionStatus: 'revoked',
      error: 'No usable refresh token is stored. Reconnect the calendar.',
    }
  }

  let tokens
  try {
    tokens = await refreshAccessToken({
      provider,
      refreshToken: stored.token,
      credentials,
      fetch: options.fetch,
      now,
    })
  } catch (error) {
    const permanent = error instanceof OAuthError && !error.retryable
    const outcome: CalendarSyncOutcome = {
      status: 'failed',
      eventsWritten: 0,
      connectionStatus: permanent ? 'revoked' : 'degraded',
      error: error instanceof Error ? error.message : 'The token could not be refreshed.',
    }
    await recordOutcome(admin, connection, outcome, now, false)
    return outcome
  }

  const rotated = tokenToStore(stored.token, tokens.refreshToken)
  if (rotated) {
    // Written before events are fetched: if the fetch fails, the new token
    // must already be the one we hold, or the next sweep uses a dead one.
    await storeRefreshToken(admin, {
      organizationId: connection.organization_id,
      calendarConnectionId: connection.id,
      refreshToken: rotated,
      existingCredentialId: stored.credentialId,
    })
  }

  let written = 0
  try {
    written = await importEvents(admin, {
      provider,
      accessToken: tokens.accessToken,
      organizationId: connection.organization_id,
      calendarConnectionId: connection.id,
      fetch: options.fetch,
      now,
    })
  } catch (error) {
    const outcome: CalendarSyncOutcome = {
      status: 'failed',
      eventsWritten: 0,
      connectionStatus:
        error instanceof OAuthError && !error.retryable ? 'revoked' : 'degraded',
      error: error instanceof Error ? error.message : 'Events could not be fetched.',
    }
    await recordOutcome(admin, connection, outcome, now, false)
    return outcome
  }

  const outcome: CalendarSyncOutcome = {
    status: 'succeeded',
    eventsWritten: written,
    connectionStatus: 'connected',
    error: null,
  }
  await recordOutcome(admin, connection, outcome, now, true)
  return outcome
}

async function recordOutcome(
  admin: SupabaseClient,
  connection: CalendarConnectionRow,
  outcome: CalendarSyncOutcome,
  now: Date,
  succeeded: boolean,
): Promise<void> {
  await admin
    .from('calendar_connections')
    .update({
      status: outcome.connectionStatus,
      // The watermark only moves on success. A failed refresh must be
      // retried at the next sweep, not treated as done.
      ...(succeeded ? { last_synced_at: now.toISOString() } : {}),
    })
    .eq('id', connection.id)
}

async function openRefreshToken(
  admin: SupabaseClient,
  connection: CalendarConnectionRow,
): Promise<{ token: string; credentialId: string } | null> {
  const { data } = await admin
    .from('integration_credentials')
    .select('id, sealed')
    .eq('calendar_connection_id', connection.id)
    .eq('field', 'refresh_token')
    .is('revoked_at', null)
    .maybeSingle()

  if (!data) return null

  try {
    const token = await openSecret(
      data.sealed as SealedSecret,
      {
        organizationId: connection.organization_id,
        credentialId: data.id,
        field: 'refresh_token',
      },
      vaultProvider(),
    )
    return { token, credentialId: data.id }
  } catch {
    // A token that will not open — a key rotated away too early, or a row
    // moved between tenants — surfaces as a connection needing reconnection,
    // never as a vault exception naming key ids.
    return null
  }
}

/**
 * Seals a refresh token into the vault under the calendar connection.
 *
 * Shared with the OAuth callback so there is one way a calendar token is
 * stored. The credential id is part of the sealed context, so it is fixed
 * before sealing: a row moved to another tenant or another connection then
 * fails to open.
 */
export async function storeRefreshToken(
  admin: SupabaseClient,
  input: {
    organizationId: string
    calendarConnectionId: string
    refreshToken: string
    /** Reuse the row's id on rotation so the sealed context stays stable. */
    existingCredentialId?: string
  },
): Promise<boolean> {
  const credentialId = input.existingCredentialId ?? crypto.randomUUID()

  const sealed = await sealSecret(
    input.refreshToken,
    {
      organizationId: input.organizationId,
      credentialId,
      field: 'refresh_token',
    },
    vaultProvider(),
  )

  const { error } = await admin.from('integration_credentials').upsert(
    {
      id: credentialId,
      organization_id: input.organizationId,
      calendar_connection_id: input.calendarConnectionId,
      connection_id: null,
      field: 'refresh_token',
      sealed,
      key_id: sealed.wrappedKey.keyId,
      masked_hint: maskSecret(input.refreshToken),
      rotated_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'calendar_connection_id,field' },
  )

  // Never surface the driver's message: a constraint violation echoes the
  // row, and the row contains ciphertext.
  return !error
}

/**
 * Replaces the upcoming window of events for one connection.
 *
 * Delete-then-upsert rather than upsert alone: a cancelled meeting is one the
 * vendor stops returning, and only a delete makes it disappear here.
 */
export async function importEvents(
  admin: SupabaseClient,
  input: {
    provider: CalendarProvider
    accessToken: string
    organizationId: string
    calendarConnectionId: string
    fetch?: typeof globalThis.fetch
    now?: Date
  },
): Promise<number> {
  const from = input.now ?? new Date()
  const to = new Date(from.getTime() + HORIZON_DAYS * 86_400_000)

  const events = await fetchEvents({
    provider: input.provider,
    accessToken: input.accessToken,
    from,
    to,
    fetch: input.fetch,
  })

  // Only this connection's external events in this window. Goals and
  // briefings the product generates have connection_id null and are untouched.
  const { error: clearError } = await admin
    .from('calendar_events')
    .delete()
    .eq('connection_id', input.calendarConnectionId)
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
  if (clearError) throw new Error('Existing events could not be cleared.')

  if (events.length === 0) return 0

  const { error } = await admin.from('calendar_events').upsert(
    events.map((event) => ({
      organization_id: input.organizationId,
      connection_id: input.calendarConnectionId,
      external_id: event.externalId,
      title: event.title,
      description: event.description,
      starts_at: event.startsAt.toISOString(),
      ends_at: event.endsAt.toISOString(),
      all_day: event.allDay,
      source: 'external',
    })),
    { onConflict: 'connection_id,external_id' },
  )
  if (error) throw new Error('Events could not be saved.')

  return events.length
}
