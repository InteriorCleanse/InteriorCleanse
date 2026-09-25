import { cookies } from 'next/headers'
import {
  CALENDAR_PROVIDERS,
  authorizationUrl,
  beginFlow,
  calendarCredentials,
  type CalendarProvider,
} from '@/lib/calendar/oauth'
import { publicEnv } from '@/lib/env'
import { getSessionContext } from '@/lib/session'

/**
 * Starting a calendar OAuth flow.
 *
 * The PKCE verifier and the `state` are put in one httpOnly cookie rather than
 * a database row. Two reasons, and the second is the important one:
 *
 *   1. A flow that is abandoned leaves nothing to clean up.
 *   2. The cookie is what makes `state` a real CSRF defence. An attacker can
 *      make a victim's browser hit our callback carrying the attacker's code,
 *      but cannot set this cookie — so the state comparison fails and the
 *      victim's workspace is not silently connected to someone else's calendar.
 *
 * `SameSite=Lax` is required, not a compromise: the callback arrives as a
 * top-level GET redirect from the provider, which `Strict` would strip the
 * cookie from, breaking every flow.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const FLOW_COOKIE = 'calendar_oauth'
/** Long enough to read a consent screen, short enough not to linger. */
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
  if (provider !== 'google' && provider !== 'outlook') {
    return Response.json({ error: 'Unknown calendar provider.' }, { status: 404 })
  }

  const credentials = calendarCredentials(provider as CalendarProvider)
  if (!credentials) {
    return Response.json(
      {
        error: `${CALENDAR_PROVIDERS[provider].name} is not configured on this deployment.`,
      },
      { status: 503 },
    )
  }

  const flow = beginFlow()
  const redirectUri = callbackUrl(provider)

  const store = await cookies()
  store.set(
    FLOW_COOKIE,
    JSON.stringify({
      provider,
      state: flow.state,
      verifier: flow.codeVerifier,
      // Bound to the workspace the flow started in, so a session that switches
      // workspace mid-flow cannot land the connection in the wrong one.
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
      provider: provider as CalendarProvider,
      clientId: credentials.clientId,
      redirectUri,
      state: flow.state,
      codeChallenge: flow.codeChallenge,
    }),
    302,
  )
}

export function callbackUrl(provider: string): string {
  const base = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
  return `${base}/api/calendar/callback/${provider}`
}
