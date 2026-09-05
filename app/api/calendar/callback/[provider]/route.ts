import { cookies } from 'next/headers'
import { FLOW_COOKIE, callbackUrl } from '@/app/api/calendar/connect/[provider]/route'
import {
  CALENDAR_PROVIDERS,
  calendarCredentials,
  exchangeCode,
  fetchAccountEmail,
  fetchEvents,
  stateMatches,
  type CalendarProvider,
} from '@/lib/calendar/oauth'
import { getSessionContext } from '@/lib/session'
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server'
import { isVaultConfigured, maskSecret, sealSecret, vaultProvider } from '@/lib/vault'

/**
 * Completing a calendar OAuth flow.
 *
 * Order matters here and it is not the obvious one. Everything that can fail
 * without side effects is checked first — cookie, state, session, workspace —
 * and only then is the code redeemed. A code exchanged before the state check
 * has already granted us a token we had no business holding.
 *
 * The flow cookie is cleared on every path, including the failures. A verifier
 * left in a browser is a replayable half of a PKCE pair.
 *
 * The refresh token goes straight into the vault under the same envelope
 * scheme as every other credential, and the plaintext does not outlive this
 * function. It is never returned, never logged, and never put in the redirect.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** How far ahead to pull events on the first sync. */
const HORIZON_DAYS = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params
  const store = await cookies()
  const raw = store.get(FLOW_COOKIE)?.value
  // Cleared unconditionally and immediately: no failure path may leave a
  // verifier behind.
  store.delete(FLOW_COOKIE)

  const url = new URL(request.url)
  const settings = '/app/integrations'

  // The provider reports a user's refusal here. It is not an error worth a
  // stack trace — the person pressed "no".
  const denied = url.searchParams.get('error')
  if (denied) {
    return redirect(settings, denied === 'access_denied' ? 'Calendar not connected.' : 'The calendar provider refused the request.')
  }

  if (provider !== 'google' && provider !== 'outlook') {
    return redirect(settings, 'Unknown calendar provider.')
  }
  if (!raw) return redirect(settings, 'That connection attempt expired. Try again.')

  let flow: { provider?: string; state?: string; verifier?: string; organizationId?: string }
  try {
    flow = JSON.parse(raw)
  } catch {
    return redirect(settings, 'That connection attempt could not be verified. Try again.')
  }

  const state = url.searchParams.get('state') ?? ''
  if (flow.provider !== provider || !stateMatches(state, flow.state ?? '')) {
    // The CSRF check. Nothing is exchanged.
    return redirect(settings, 'That connection attempt could not be verified. Try again.')
  }

  const session = await getSessionContext()
  if (!session) return redirect('/login', 'Sign in and try again.')

  const membership = session.memberships.find((m) => m.organizationId === flow.organizationId)
  if (!membership) return redirect(settings, 'That workspace is no longer available.')

  if (!isVaultConfigured()) {
    return redirect(
      settings,
      'Credential storage is not configured on this deployment, so a calendar cannot be connected.',
    )
  }

  const credentials = calendarCredentials(provider as CalendarProvider)
  if (!credentials) {
    return redirect(settings, `${CALENDAR_PROVIDERS[provider].name} is not configured here.`)
  }

  const code = url.searchParams.get('code')
  if (!code) return redirect(settings, 'The provider did not return an authorization code.')

  let tokens
  try {
    tokens = await exchangeCode({
      provider: provider as CalendarProvider,
      code,
      redirectUri: callbackUrl(provider),
      codeVerifier: flow.verifier ?? '',
      credentials,
    })
  } catch (error) {
    return redirect(settings, error instanceof Error ? error.message : 'The exchange failed.')
  }

  if (!tokens.refreshToken) {
    // Without one the connection works for an hour and then dies silently.
    // Refusing now, with the reason, beats a connection that rots overnight.
    return redirect(
      settings,
      `${CALENDAR_PROVIDERS[provider].name} did not return a refresh token, so the connection would stop working within the hour. Remove this app from your account's connected apps and try again.`,
    )
  }

  const accountEmail =
    (await fetchAccountEmail(provider as CalendarProvider, tokens.accessToken)) ??
    session.email ??
    'unknown'

  const supabase = await supabaseServer()
  const { data: connection, error } = await supabase
    .from('calendar_connections')
    .upsert(
      {
        organization_id: membership.organizationId,
        user_id: session.userId,
        provider,
        account_email: accountEmail,
        status: 'connected',
      },
      { onConflict: 'organization_id,user_id,provider,account_email' },
    )
    .select('id')
    .single()

  if (error || !connection) return redirect(settings, 'The connection could not be saved.')

  const admin = supabaseAdmin()
  const stored = await storeRefreshToken({
    admin,
    organizationId: membership.organizationId,
    calendarConnectionId: connection.id,
    refreshToken: tokens.refreshToken,
  })
  if (!stored) return redirect(settings, 'The calendar credential could not be stored.')

  // A first pull, so the connection visibly does something. A failure here is
  // not a failure of the connection — the token is stored and the next sweep
  // will try again.
  const imported = await importEvents({
    admin,
    provider: provider as CalendarProvider,
    accessToken: tokens.accessToken,
    organizationId: membership.organizationId,
    calendarConnectionId: connection.id,
  })

  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: session.userId,
    action: 'calendar.connected',
    target_type: 'calendar_connection',
    target_id: connection.id,
    // The address is the point of the record; no token appears anywhere.
    metadata: { provider, account_email: accountEmail, events_imported: imported },
  })

  return redirect(
    settings,
    `${CALENDAR_PROVIDERS[provider].name} connected as ${accountEmail}. ${imported} upcoming events imported.`,
  )
}

async function storeRefreshToken(input: {
  admin: ReturnType<typeof supabaseAdmin>
  organizationId: string
  calendarConnectionId: string
  refreshToken: string
}): Promise<boolean> {
  // Reserved before sealing: the id is part of the sealed context, so a row
  // moved to another tenant or another connection fails to open.
  const credentialId = crypto.randomUUID()

  const sealed = await sealSecret(
    input.refreshToken,
    {
      organizationId: input.organizationId,
      credentialId,
      field: 'refresh_token',
    },
    vaultProvider(),
  )

  const { error } = await input.admin.from('integration_credentials').upsert(
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

  // Never surface the driver's message: on a constraint violation Postgres
  // echoes the offending row, and the offending row contains ciphertext.
  return !error
}

async function importEvents(input: {
  admin: ReturnType<typeof supabaseAdmin>
  provider: CalendarProvider
  accessToken: string
  organizationId: string
  calendarConnectionId: string
}): Promise<number> {
  const from = new Date()
  const to = new Date(from.getTime() + HORIZON_DAYS * 86_400_000)

  try {
    const events = await fetchEvents({
      provider: input.provider,
      accessToken: input.accessToken,
      from,
      to,
    })
    if (events.length === 0) return 0

    const { error } = await input.admin.from('calendar_events').upsert(
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

    return error ? 0 : events.length
  } catch {
    return 0
  }
}

function redirect(path: string, notice: string): Response {
  return Response.redirect(
    `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? ''}${path}?notice=${encodeURIComponent(notice)}`,
    302,
  )
}
