import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CALENDAR_PROVIDERS,
  OAuthError,
  authorizationUrl,
  beginFlow,
  exchangeCode,
  fetchEvents,
  needsRefresh,
  refreshAccessToken,
  stateMatches,
} from '@/lib/calendar/oauth'

const CREDENTIALS = { clientId: 'client-id', clientSecret: 'client-secret' }
const REDIRECT = 'https://app.example.com/api/calendar/callback/google'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('beginFlow', () => {
  it('derives an S256 challenge from the verifier', () => {
    // A `plain` challenge is the verifier, so anyone who saw the authorization
    // request can complete the exchange. It protects nothing.
    const flow = beginFlow()
    const expected = createHash('sha256')
      .update(flow.codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(flow.codeChallenge).toBe(expected)
  })

  it('produces url-safe values with no padding', () => {
    const flow = beginFlow()
    for (const value of [flow.state, flow.codeVerifier, flow.codeChallenge]) {
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('produces a different state and verifier every time', () => {
    const a = beginFlow()
    const b = beginFlow()
    expect(a.state).not.toBe(b.state)
    expect(a.codeVerifier).not.toBe(b.codeVerifier)
  })

  it('uses a verifier long enough to be worth having', () => {
    // RFC 7636 sets a floor of 43 characters; a short one is guessable.
    expect(beginFlow().codeVerifier.length).toBeGreaterThanOrEqual(43)
  })
})

describe('authorizationUrl', () => {
  const flow = beginFlow()
  const url = (provider: 'google' | 'outlook') =>
    new URL(
      authorizationUrl({
        provider,
        clientId: CREDENTIALS.clientId,
        redirectUri: REDIRECT,
        state: flow.state,
        codeChallenge: flow.codeChallenge,
      }),
    )

  it('always requests S256, never plain', () => {
    for (const provider of ['google', 'outlook'] as const) {
      expect(url(provider).searchParams.get('code_challenge_method')).toBe('S256')
    }
  })

  it('asks Google for offline access and forces consent', () => {
    // Without both, Google issues a refresh token only on the first ever
    // authorization; a reconnect then works for an hour and dies.
    const params = url('google').searchParams
    expect(params.get('access_type')).toBe('offline')
    expect(params.get('prompt')).toBe('consent')
  })

  it('asks Microsoft for offline_access, which is what returns a refresh token', () => {
    expect(url('outlook').searchParams.get('scope')).toContain('offline_access')
  })

  it('requests read-only calendar scopes and nothing more', () => {
    // The product renders a read-only feed and says so. Asking for write access
    // it does not use would be dishonest at the one screen the customer reads.
    expect(CALENDAR_PROVIDERS.google.scopes).toContain(
      'https://www.googleapis.com/auth/calendar.readonly',
    )
    expect(CALENDAR_PROVIDERS.google.scopes.join(' ')).not.toMatch(/auth\/calendar($| )/)
    expect(CALENDAR_PROVIDERS.outlook.scopes).toContain('Calendars.Read')
    expect(CALENDAR_PROVIDERS.outlook.scopes).not.toContain('Calendars.ReadWrite')
  })

  it('carries the state and the exact redirect uri', () => {
    const params = url('google').searchParams
    expect(params.get('state')).toBe(flow.state)
    expect(params.get('redirect_uri')).toBe(REDIRECT)
  })
})

describe('stateMatches', () => {
  it('accepts an exact match and rejects everything else', () => {
    expect(stateMatches('abc123', 'abc123')).toBe(true)
    expect(stateMatches('abc123', 'abc124')).toBe(false)
    expect(stateMatches('abc123', 'abc1234')).toBe(false)
  })

  it('rejects an empty state, so a missing cookie is never a pass', () => {
    expect(stateMatches('', '')).toBe(false)
    expect(stateMatches('abc', '')).toBe(false)
    expect(stateMatches('', 'abc')).toBe(false)
  })
})

describe('exchangeCode', () => {
  it('sends the verifier and returns a token set', async () => {
    let body = ''
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = String(init.body)
      return json({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: 'calendar.readonly',
      })
    }) as unknown as typeof globalThis.fetch

    const tokens = await exchangeCode({
      provider: 'google',
      code: 'the-code',
      redirectUri: REDIRECT,
      codeVerifier: 'verifier',
      credentials: CREDENTIALS,
      fetch: fetchImpl,
      now: new Date('2025-01-01T00:00:00Z'),
    })

    expect(body).toContain('code_verifier=verifier')
    expect(body).toContain('grant_type=authorization_code')
    expect(tokens.accessToken).toBe('at')
    expect(tokens.refreshToken).toBe('rt')
  })

  it('expires the token slightly early, so a slow request does not use a dead one', () => {
    // A token valid for another 40 seconds is not usable for a 30-second
    // request, and treating it as valid produces a 401 that looks like a
    // revoked credential.
    return exchangeCode({
      provider: 'google',
      code: 'c',
      redirectUri: REDIRECT,
      codeVerifier: 'v',
      credentials: CREDENTIALS,
      now: new Date('2025-01-01T00:00:00Z'),
      fetch: (async () => json({ access_token: 'at', expires_in: 3600 })) as unknown as typeof globalThis.fetch,
    }).then((tokens) => {
      expect(tokens.expiresAt.toISOString()).toBe('2025-01-01T00:59:00.000Z')
    })
  })

  it('treats invalid_grant as permanent, not something to retry forever', async () => {
    const fetchImpl = (async () =>
      json({ error: 'invalid_grant' }, 400)) as unknown as typeof globalThis.fetch

    const error = await exchangeCode({
      provider: 'google',
      code: 'c',
      redirectUri: REDIRECT,
      codeVerifier: 'v',
      credentials: CREDENTIALS,
      fetch: fetchImpl,
    })
      .then(() => null)
      .catch((e: unknown) => e as OAuthError)

    expect(error).toBeInstanceOf(OAuthError)
    expect(error!.retryable).toBe(false)
    expect(error!.message).toMatch(/Reconnect the calendar/)
  })

  it('treats a 5xx as retryable', async () => {
    const error = await exchangeCode({
      provider: 'outlook',
      code: 'c',
      redirectUri: REDIRECT,
      codeVerifier: 'v',
      credentials: CREDENTIALS,
      fetch: (async () => json({}, 503)) as unknown as typeof globalThis.fetch,
    })
      .then(() => null)
      .catch((e: unknown) => e as OAuthError)

    expect(error!.retryable).toBe(true)
  })

  it('does not treat a 200 without an access token as success', async () => {
    await expect(
      exchangeCode({
        provider: 'google',
        code: 'c',
        redirectUri: REDIRECT,
        codeVerifier: 'v',
        credentials: CREDENTIALS,
        fetch: (async () => json({ scope: 'x' })) as unknown as typeof globalThis.fetch,
      }),
    ).rejects.toBeInstanceOf(OAuthError)
  })
})

describe('refreshAccessToken', () => {
  it('keeps the existing refresh token when the provider returns none', async () => {
    // Google does not return one on a refresh. Overwriting with null would
    // destroy the connection on the next renewal.
    const tokens = await refreshAccessToken({
      provider: 'google',
      refreshToken: 'original',
      credentials: CREDENTIALS,
      fetch: (async () => json({ access_token: 'new-at', expires_in: 3600 })) as unknown as typeof globalThis.fetch,
    })
    expect(tokens.refreshToken).toBe('original')
  })

  it('takes a rotated refresh token when the provider issues one', async () => {
    const tokens = await refreshAccessToken({
      provider: 'outlook',
      refreshToken: 'original',
      credentials: CREDENTIALS,
      fetch: (async () =>
        json({ access_token: 'at', refresh_token: 'rotated', expires_in: 3600 })) as unknown as typeof globalThis.fetch,
    })
    expect(tokens.refreshToken).toBe('rotated')
  })
})

describe('needsRefresh', () => {
  it('is true once the recorded expiry has passed', () => {
    const now = new Date('2025-01-01T12:00:00Z')
    expect(needsRefresh(new Date('2025-01-01T11:59:00Z'), now)).toBe(true)
    expect(needsRefresh(new Date('2025-01-01T12:30:00Z'), now)).toBe(false)
  })
})

describe('fetchEvents', () => {
  const window = {
    from: new Date('2025-01-01T00:00:00Z'),
    to: new Date('2025-03-01T00:00:00Z'),
  }

  it('expands recurring Google events rather than fetching the series', async () => {
    let requested = ''
    const fetchImpl = (async (url: string) => {
      requested = String(url)
      return json({ items: [] })
    }) as unknown as typeof globalThis.fetch

    await fetchEvents({ provider: 'google', accessToken: 'at', ...window, fetch: fetchImpl })
    expect(requested).toContain('singleEvents=true')
  })

  it('skips cancelled Google instances', async () => {
    const fetchImpl = (async () =>
      json({
        items: [
          {
            id: 'e1',
            summary: 'Standup',
            status: 'confirmed',
            start: { dateTime: '2025-01-02T09:00:00Z' },
            end: { dateTime: '2025-01-02T09:15:00Z' },
          },
          {
            id: 'e2',
            status: 'cancelled',
            start: { dateTime: '2025-01-03T09:00:00Z' },
            end: { dateTime: '2025-01-03T09:15:00Z' },
          },
        ],
      })) as unknown as typeof globalThis.fetch

    const events = await fetchEvents({
      provider: 'google',
      accessToken: 'at',
      ...window,
      fetch: fetchImpl,
    })
    expect(events.map((e) => e.externalId)).toEqual(['e1'])
  })

  it('reads a Google all-day event from the date field', async () => {
    const fetchImpl = (async () =>
      json({
        items: [
          { id: 'e3', summary: 'Holiday', start: { date: '2025-01-05' }, end: { date: '2025-01-06' } },
        ],
      })) as unknown as typeof globalThis.fetch

    const [event] = await fetchEvents({
      provider: 'google',
      accessToken: 'at',
      ...window,
      fetch: fetchImpl,
    })
    expect(event!.allDay).toBe(true)
  })

  it('says "(no title)" rather than inventing a name', async () => {
    const fetchImpl = (async () =>
      json({
        items: [
          {
            id: 'e4',
            start: { dateTime: '2025-01-02T09:00:00Z' },
            end: { dateTime: '2025-01-02T10:00:00Z' },
          },
        ],
      })) as unknown as typeof globalThis.fetch

    const [event] = await fetchEvents({
      provider: 'google',
      accessToken: 'at',
      ...window,
      fetch: fetchImpl,
    })
    expect(event!.title).toBe('(no title)')
  })

  it('reads Graph times as UTC even though they arrive without a Z', async () => {
    // Graph returns "2025-01-02T09:00:00.0000000" with the zone in a sibling
    // field. Handing that to Date reads it as server-local and silently shifts
    // every meeting by the server's offset.
    const fetchImpl = (async () =>
      json({
        value: [
          {
            id: 'm1',
            subject: 'Review',
            start: { dateTime: '2025-01-02T09:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2025-01-02T10:00:00.0000000', timeZone: 'UTC' },
          },
        ],
      })) as unknown as typeof globalThis.fetch

    const [event] = await fetchEvents({
      provider: 'outlook',
      accessToken: 'at',
      ...window,
      fetch: fetchImpl,
    })
    expect(event!.startsAt.toISOString()).toBe('2025-01-02T09:00:00.000Z')
  })

  it('skips cancelled Outlook events', async () => {
    const fetchImpl = (async () =>
      json({
        value: [
          {
            id: 'm2',
            subject: 'Cancelled',
            isCancelled: true,
            start: { dateTime: '2025-01-02T09:00:00', timeZone: 'UTC' },
            end: { dateTime: '2025-01-02T10:00:00', timeZone: 'UTC' },
          },
        ],
      })) as unknown as typeof globalThis.fetch

    const events = await fetchEvents({
      provider: 'outlook',
      accessToken: 'at',
      ...window,
      fetch: fetchImpl,
    })
    expect(events).toEqual([])
  })

  it('treats a 401 as a dead token and a 500 as retryable', async () => {
    const at = async (status: number) =>
      fetchEvents({
        provider: 'google',
        accessToken: 'at',
        ...window,
        fetch: (async () => json({}, status)) as unknown as typeof globalThis.fetch,
      })
        .then(() => null)
        .catch((e: unknown) => e as OAuthError)

    expect((await at(401))!.retryable).toBe(false)
    expect((await at(500))!.retryable).toBe(true)
  })

  it('bounds the request by the window it was given', async () => {
    let requested = ''
    const fetchImpl = (async (url: string) => {
      requested = String(url)
      return json({ value: [] })
    }) as unknown as typeof globalThis.fetch

    await fetchEvents({ provider: 'outlook', accessToken: 'at', ...window, fetch: fetchImpl })
    expect(requested).toContain(encodeURIComponent(window.from.toISOString()))
    expect(requested).toContain(encodeURIComponent(window.to.toISOString()))
  })
})
