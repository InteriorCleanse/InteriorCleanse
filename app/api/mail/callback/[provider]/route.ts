import { cookies } from 'next/headers'
import { MAIL_FLOW_COOKIE, mailCallbackUrl } from '@/app/api/mail/connect/[provider]/route'
import {
  OAUTH_PROVIDERS,
  calendarCredentials,
  exchangeCode,
  fetchAccountEmail,
  stateMatches,
} from '@/lib/calendar/oauth'
import { storeMailRefreshToken } from '@/lib/mail/read'
import { getSessionContext } from '@/lib/session'
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server'
import { isVaultConfigured } from '@/lib/vault'

/**
 * Completing a mailbox OAuth flow.
 *
 * Everything that can fail without side effects is checked before the code
 * is redeemed — cookie, state, session, workspace, vault — because a code
 * exchanged before the state check has already granted a token we had no
 * business holding. The flow cookie is cleared on every path.
 *
 * The refresh token goes into the vault under the mailbox connection and the
 * plaintext does not outlive this function. No mail is read here: the first
 * read happens when the person asks, which is also the first moment they
 * see what the assistant sees.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params
  const store = await cookies()
  const raw = store.get(MAIL_FLOW_COOKIE)?.value
  store.delete(MAIL_FLOW_COOKIE)

  const url = new URL(request.url)
  const settings = '/app/integrations'

  const denied = url.searchParams.get('error')
  if (denied) {
    return redirect(
      settings,
      denied === 'access_denied' ? 'Mailbox not connected.' : 'The mail provider refused the request.',
    )
  }

  if (provider !== 'gmail') return redirect(settings, 'Unknown mail provider.')
  if (!raw) return redirect(settings, 'That connection attempt expired. Try again.')

  let flow: { provider?: string; state?: string; verifier?: string; organizationId?: string }
  try {
    flow = JSON.parse(raw)
  } catch {
    return redirect(settings, 'That connection attempt could not be verified. Try again.')
  }

  const state = url.searchParams.get('state') ?? ''
  if (flow.provider !== provider || !stateMatches(state, flow.state ?? '')) {
    return redirect(settings, 'That connection attempt could not be verified. Try again.')
  }

  const session = await getSessionContext()
  if (!session) return redirect('/login', 'Sign in and try again.')

  const membership = session.memberships.find((m) => m.organizationId === flow.organizationId)
  if (!membership) return redirect(settings, 'That workspace is no longer available.')

  if (!isVaultConfigured()) {
    return redirect(
      settings,
      'Credential storage is not configured on this deployment, so a mailbox cannot be connected.',
    )
  }

  const credentials = calendarCredentials('gmail')
  if (!credentials) return redirect(settings, `${OAUTH_PROVIDERS.gmail.name} is not configured here.`)

  const code = url.searchParams.get('code')
  if (!code) return redirect(settings, 'The provider did not return an authorization code.')

  let tokens
  try {
    tokens = await exchangeCode({
      provider: 'gmail',
      code,
      redirectUri: mailCallbackUrl(provider),
      codeVerifier: flow.verifier ?? '',
      credentials,
    })
  } catch (error) {
    return redirect(settings, error instanceof Error ? error.message : 'The exchange failed.')
  }

  if (!tokens.refreshToken) {
    return redirect(
      settings,
      'Google did not return a refresh token, so the connection would stop working within the hour. Remove this app from your Google account’s connected apps and try again.',
    )
  }

  // The scope actually granted is what matters, not what was asked. A person
  // can untick "read mail" on Google's consent screen and still land here.
  if (tokens.scope && !/gmail\.readonly/.test(tokens.scope)) {
    return redirect(settings, 'Reading mail was not granted on the consent screen, so nothing was connected.')
  }

  const accountEmail =
    (await fetchAccountEmail('gmail', tokens.accessToken)) ?? session.email ?? 'unknown'

  const supabase = await supabaseServer()
  const { data: connection, error } = await supabase
    .from('mail_connections')
    .upsert(
      {
        organization_id: membership.organizationId,
        user_id: session.userId,
        provider,
        account_email: accountEmail,
        status: 'connected',
        status_detail: null,
      },
      { onConflict: 'organization_id,user_id,provider,account_email' },
    )
    .select('id')
    .single()

  if (error || !connection) return redirect(settings, 'The connection could not be saved.')

  const stored = await storeMailRefreshToken(supabaseAdmin(), {
    organizationId: membership.organizationId,
    mailConnectionId: connection.id,
    refreshToken: tokens.refreshToken,
  })
  if (!stored) return redirect(settings, 'The mailbox credential could not be stored.')

  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: session.userId,
    action: 'mail.connected',
    target_type: 'mail_connection',
    target_id: connection.id,
    metadata: { provider, account_email: accountEmail },
  })

  return redirect(
    settings,
    `${OAUTH_PROVIDERS.gmail.name} connected as ${accountEmail}. Ask the assistant to read your inbox.`,
  )
}

function redirect(path: string, notice: string): Response {
  return Response.redirect(
    `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? ''}${path}?notice=${encodeURIComponent(notice)}`,
    302,
  )
}
