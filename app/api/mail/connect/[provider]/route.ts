import { cookies } from 'next/headers'
import {
  OAUTH_PROVIDERS,
  authorizationUrl,
  beginFlow,
  calendarCredentials,
} from '@/lib/calendar/oauth'
import { publicEnv } from '@/lib/env'
import { getSessionContext } from '@/lib/session'

/**
 * Starting a mailbox OAuth flow.
 *
 * The same shape as the calendar's, and for the same reasons: PKCE and the
 * `state` live in one httpOnly, SameSite=Lax cookie, so an abandoned flow
 * leaves nothing behind and a forged callback cannot connect a stranger's
 * mailbox to this person's workspace. The cookie has its own name so a
 * calendar flow and a mail flow started in two tabs cannot complete each
 * other.
 *
 * Gmail is asked for `gmail.readonly` and the account's address, nothing
 * else. The assistant summarises unread mail; it never sends, replies, or
 * deletes, and it does not ask for the right to.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const MAIL_FLOW_COOKIE = 'mail_oauth'
const FLOW_TTL_SECONDS = 600

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const { provider } = await params
  if (provider !== 'gmail') {
    return Response.json({ error: 'Unknown mail provider.' }, { status: 404 })
  }

  const credentials = calendarCredentials('gmail')
  if (!credentials) {
    return Response.json(
      { error: `${OAUTH_PROVIDERS.gmail.name} is not configured on this deployment.` },
      { status: 503 },
    )
  }

  const flow = beginFlow()

  const store = await cookies()
  store.set(
    MAIL_FLOW_COOKIE,
    JSON.stringify({
      provider,
      state: flow.state,
      verifier: flow.codeVerifier,
      organizationId: membership.organizationId,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: FLOW_TTL_SECONDS,
    },
  )

  return Response.redirect(
    authorizationUrl({
      provider: 'gmail',
      clientId: credentials.clientId,
      redirectUri: mailCallbackUrl(provider),
      state: flow.state,
      codeChallenge: flow.codeChallenge,
    }),
    302,
  )
}

export function mailCallbackUrl(provider: string): string {
  const base = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
  return `${base}/api/mail/callback/${provider}`
}
