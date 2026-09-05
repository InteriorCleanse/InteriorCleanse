import { createHash, randomBytes } from 'node:crypto'

/**
 * Calendar OAuth: Google and Microsoft.
 *
 * The authorization-code flow with PKCE, and the parts that are usually got
 * wrong are the parts written out longhand here:
 *
 * **PKCE, even though we have a client secret.** A confidential client is not
 * a reason to skip it. PKCE binds the code to the browser that started the
 * flow, which is what stops a code intercepted from a redirect — a referer
 * header, a shared machine, a logged URL — from being redeemed by anyone else.
 *
 * **`state` is compared against a cookie, not a database row.** The cookie is
 * httpOnly and SameSite=Lax, set at the start of the flow and consumed at the
 * callback. An attacker who can make a victim's browser hit our callback with
 * their own code cannot also set that cookie, so CSRF into "your calendar is
 * now connected to my account" fails. Both halves are compared in constant
 * time and the cookie is cleared whatever the outcome.
 *
 * **Least privilege, and read-only.** Google gets `calendar.readonly`,
 * Microsoft gets `Calendars.Read`. The product renders a read-only feed and
 * says so; asking for write access it does not use would be dishonest at the
 * consent screen, which is the one moment the customer is actually reading.
 *
 * **`prompt=consent` and `access_type=offline` for Google.** Without both,
 * Google issues a refresh token only on the very first authorization and
 * silently omits it on every reconnect — the connection then works for an hour
 * and dies, which is the single most common bug in Google Calendar
 * integrations.
 *
 * Nothing in this module logs a token, a code, or a full authorization URL.
 */

export type CalendarProvider = 'google' | 'outlook'

export type ProviderConfig = {
  provider: CalendarProvider
  name: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  /** Extra parameters this provider needs on the authorization request. */
  extraAuthParams: Record<string, string>
}

export const CALENDAR_PROVIDERS: Record<CalendarProvider, ProviderConfig> = {
  google: {
    provider: 'google',
    name: 'Google Calendar',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    extraAuthParams: {
      access_type: 'offline',
      // Without this a reconnect returns no refresh token and the connection
      // quietly expires an hour later.
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
  },
  outlook: {
    provider: 'outlook',
    name: 'Outlook Calendar',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    // offline_access is what makes Microsoft return a refresh token at all.
    scopes: ['offline_access', 'Calendars.Read', 'User.Read'],
    extraAuthParams: { response_mode: 'query' },
  },
}

export type ProviderCredentials = { clientId: string; clientSecret: string }

/** Reads the provider's client credentials, or null when it is not set up. */
export function calendarCredentials(provider: CalendarProvider): ProviderCredentials | null {
  const clientId =
    provider === 'google'
      ? process.env.GOOGLE_CLIENT_ID?.trim()
      : process.env.MICROSOFT_CLIENT_ID?.trim()
  const clientSecret =
    provider === 'google'
      ? process.env.GOOGLE_CLIENT_SECRET?.trim()
      : process.env.MICROSOFT_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function isCalendarConfigured(provider: CalendarProvider): boolean {
  return calendarCredentials(provider) !== null
}

// ── PKCE and state ───────────────────────────────────────────────────────────

export type FlowSecrets = { state: string; codeVerifier: string; codeChallenge: string }

/**
 * S256, not `plain`.
 *
 * A `plain` challenge is the verifier, so anyone who saw the authorization
 * request can complete the exchange — it provides no protection at all and
 * exists only for clients that cannot compute a SHA-256.
 */
export function beginFlow(): FlowSecrets {
  const codeVerifier = base64Url(randomBytes(48))
  return {
    state: base64Url(randomBytes(24)),
    codeVerifier,
    codeChallenge: base64Url(createHash('sha256').update(codeVerifier).digest()),
  }
}

export function authorizationUrl(input: {
  provider: CalendarProvider
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}): string {
  const config = CALENDAR_PROVIDERS[input.provider]

  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    ...config.extraAuthParams,
  })

  return `${config.authorizeUrl}?${params.toString()}`
}

/** Constant-time comparison of the returned state against the cookie's. */
export function stateMatches(fromCallback: string, fromCookie: string): boolean {
  if (!fromCallback || !fromCookie || fromCallback.length !== fromCookie.length) return false
  let diff = 0
  for (let i = 0; i < fromCallback.length; i += 1) {
    diff |= fromCallback.charCodeAt(i) ^ fromCookie.charCodeAt(i)
  }
  return diff === 0
}

// ── Token exchange ───────────────────────────────────────────────────────────

export type TokenSet = {
  accessToken: string
  /** Absent on a Google reconnect that did not include prompt=consent. */
  refreshToken: string | null
  expiresAt: Date
  scope: string | null
}

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'OAuthError'
  }
}

export async function exchangeCode(input: {
  provider: CalendarProvider
  code: string
  redirectUri: string
  codeVerifier: string
  credentials: ProviderCredentials
  fetch?: typeof globalThis.fetch
  now?: Date
}): Promise<TokenSet> {
  return tokenRequest(input.provider, input.fetch, input.now, {
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    client_id: input.credentials.clientId,
    client_secret: input.credentials.clientSecret,
  })
}

export async function refreshAccessToken(input: {
  provider: CalendarProvider
  refreshToken: string
  credentials: ProviderCredentials
  fetch?: typeof globalThis.fetch
  now?: Date
}): Promise<TokenSet> {
  const tokens = await tokenRequest(input.provider, input.fetch, input.now, {
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.credentials.clientId,
    client_secret: input.credentials.clientSecret,
  })

  // Google returns no refresh token on a refresh; the existing one stays valid
  // and must not be overwritten with null by the caller.
  return { ...tokens, refreshToken: tokens.refreshToken ?? input.refreshToken }
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

async function tokenRequest(
  provider: CalendarProvider,
  fetchImpl: typeof globalThis.fetch | undefined,
  now: Date | undefined,
  body: Record<string, string>,
): Promise<TokenSet> {
  const doFetch = fetchImpl ?? globalThis.fetch
  const at = now ?? new Date()

  let response: Response
  try {
    response = await doFetch(CALENDAR_PROVIDERS[provider].tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
    })
  } catch {
    throw new OAuthError(`${CALENDAR_PROVIDERS[provider].name} could not be reached.`, true)
  }

  const payload = (await response.json().catch(() => ({}))) as TokenResponse

  if (!response.ok || !payload.access_token) {
    // `invalid_grant` means the user revoked access, changed their password, or
    // the refresh token expired. It is permanent, and the only fix is that the
    // person reconnects — so it must not be retried on a schedule forever.
    const permanent = payload.error === 'invalid_grant' || response.status === 400
    throw new OAuthError(
      permanent
        ? `${CALENDAR_PROVIDERS[provider].name} rejected the authorization. Reconnect the calendar.`
        : `${CALENDAR_PROVIDERS[provider].name} returned ${response.status} while exchanging the token.`,
      !permanent,
    )
  }

  // A short safety margin: a token that expires in 40 seconds is not usable for
  // a request that takes 30, and treating it as valid produces a 401 that looks
  // like a revoked credential.
  const lifetime = typeof payload.expires_in === 'number' ? payload.expires_in : 3_600
  const expiresAt = new Date(at.getTime() + Math.max(lifetime - 60, 30) * 1_000)

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt,
    scope: payload.scope ?? null,
  }
}

export function needsRefresh(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime()
}

// ── Reading the account and its events ───────────────────────────────────────

export type CalendarEvent = {
  externalId: string
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
}

/** The address of the account that was just connected, for display. */
export async function fetchAccountEmail(
  provider: CalendarProvider,
  accessToken: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<string | null> {
  const url =
    provider === 'google'
      ? 'https://www.googleapis.com/oauth2/v3/userinfo'
      : 'https://graph.microsoft.com/v1.0/me'

  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  }).catch(() => null)

  if (!response?.ok) return null
  const body = (await response.json().catch(() => ({}))) as {
    email?: string
    mail?: string
    userPrincipalName?: string
  }
  return body.email ?? body.mail ?? body.userPrincipalName ?? null
}

/**
 * Upcoming events, normalised.
 *
 * Bounded by a window and a count rather than "everything": a calendar can hold
 * a decade of history and a recurring event to 2099, and the product only ever
 * shows what is coming up.
 */
export async function fetchEvents(input: {
  provider: CalendarProvider
  accessToken: string
  from: Date
  to: Date
  fetch?: typeof globalThis.fetch
  limit?: number
}): Promise<CalendarEvent[]> {
  const doFetch = input.fetch ?? globalThis.fetch
  const limit = input.limit ?? 100

  const url =
    input.provider === 'google'
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
          timeMin: input.from.toISOString(),
          timeMax: input.to.toISOString(),
          // Recurring events expanded into instances: an unexpanded series is
          // one row with a rule nobody downstream evaluates.
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: String(limit),
        })}`
      : `https://graph.microsoft.com/v1.0/me/calendarView?${new URLSearchParams({
          startDateTime: input.from.toISOString(),
          endDateTime: input.to.toISOString(),
          $top: String(limit),
          $orderby: 'start/dateTime',
        })}`

  const response = await doFetch(url, {
    headers: { authorization: `Bearer ${input.accessToken}`, accept: 'application/json' },
  }).catch(() => null)

  if (!response) throw new OAuthError('The calendar provider could not be reached.', true)
  if (response.status === 401) {
    throw new OAuthError('The calendar access token was rejected.', false)
  }
  if (!response.ok) {
    throw new OAuthError(`The calendar provider returned ${response.status}.`, response.status >= 500)
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return input.provider === 'google' ? parseGoogle(body) : parseOutlook(body)
}

type GoogleEvent = {
  id?: string
  summary?: string
  description?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

function parseGoogle(body: Record<string, unknown>): CalendarEvent[] {
  const items = Array.isArray(body.items) ? (body.items as GoogleEvent[]) : []

  return items.flatMap((item) => {
    // Cancelled instances of a recurring series come back in the list and are
    // not events; keeping them would show meetings that are not happening.
    if (item.status === 'cancelled' || !item.id) return []

    const allDay = Boolean(item.start?.date)
    const start = item.start?.dateTime ?? item.start?.date
    const end = item.end?.dateTime ?? item.end?.date
    if (!start || !end) return []

    return [
      {
        externalId: item.id,
        // An untitled event is normal and common; "(no title)" is what the
        // provider's own UI shows, and inventing a name would be worse.
        title: item.summary?.trim() || '(no title)',
        description: item.description?.trim() || null,
        startsAt: new Date(start),
        endsAt: new Date(end),
        allDay,
      },
    ]
  })
}

type OutlookEvent = {
  id?: string
  subject?: string
  bodyPreview?: string
  isCancelled?: boolean
  isAllDay?: boolean
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
}

function parseOutlook(body: Record<string, unknown>): CalendarEvent[] {
  const items = Array.isArray(body.value) ? (body.value as OutlookEvent[]) : []

  return items.flatMap((item) => {
    if (item.isCancelled || !item.id) return []
    const start = item.start?.dateTime
    const end = item.end?.dateTime
    if (!start || !end) return []

    return [
      {
        externalId: item.id,
        title: item.subject?.trim() || '(no title)',
        description: item.bodyPreview?.trim() || null,
        // Graph returns a naive local time plus a separate zone field. The
        // default zone is UTC and we do not override it, so the value is UTC —
        // but it arrives without a 'Z', and Date would read it as local.
        startsAt: asUtc(start, item.start?.timeZone),
        endsAt: asUtc(end, item.end?.timeZone),
        allDay: Boolean(item.isAllDay),
      },
    ]
  })
}

function asUtc(value: string, timeZone: string | undefined): Date {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) return new Date(value)
  // Graph's default is UTC unless a Prefer header asked otherwise, which we do
  // not send. Anything else would need the zone applied, and getting that
  // wrong silently shifts every meeting by hours.
  if (!timeZone || timeZone.toUpperCase() === 'UTC') return new Date(`${value}Z`)
  return new Date(`${value}Z`)
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
