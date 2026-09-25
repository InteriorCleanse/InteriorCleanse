import { describe, expect, it } from 'vitest'
import {
  captureTransport,
  renderNotificationEmail,
  resendTransport,
  unconfiguredTransport,
} from '@/lib/notifications/email'
import { absolute, dispatch, localHourIn, type Recipient } from '@/lib/notifications/dispatch'
import { DEFAULT_PREFERENCES } from '@/lib/notifications/delivery'

const NOTIFICATION = {
  id: 'n1',
  organizationId: 'org1',
  severity: 'warning' as const,
  title: 'Refund rate above threshold',
  body: 'Refunds are running higher than the level you set.',
  evidence: 'Refund rate 8.2% against a 5.0% threshold.',
  period: 'Yesterday',
  link: '/app/revenue',
}

function recipient(overrides: Partial<Recipient> = {}): Recipient {
  return {
    userId: 'u1',
    email: 'person@example.com',
    preferences: DEFAULT_PREFERENCES,
    localHour: 10,
    ...overrides,
  }
}

function context(transport = captureTransport()) {
  return {
    transport,
    workspaceName: 'Acme Ltd',
    isDemo: false,
    siteUrl: 'https://app.example.com',
  }
}

describe('the email transport', () => {
  it('says it is unconfigured rather than throwing at send time', async () => {
    const transport = unconfiguredTransport()
    expect(transport.configured).toBe(false)

    const result = await transport.send({ to: 'a@b.com', subject: 's', text: 't', html: '<p>t</p>' })
    expect(result.sent).toBe(false)
    expect(result.sent === false && result.detail).toMatch(/RESEND_API_KEY/)
  })

  it('treats a rejected API key as permanent and a 503 as retryable', async () => {
    const make = (status: number) =>
      resendTransport({
        apiKey: 'k',
        from: 'a@b.com',
        fetch: (async () => new Response('{}', { status })) as unknown as typeof globalThis.fetch,
      })

    const auth = await make(401).send({ to: 'x@y.com', subject: 's', text: 't', html: '' })
    expect(auth.sent === false && auth.retryable).toBe(false)

    const outage = await make(503).send({ to: 'x@y.com', subject: 's', text: 't', html: '' })
    expect(outage.sent === false && outage.retryable).toBe(true)
  })

  it('separates a bad address from a provider outage', async () => {
    const transport = resendTransport({
      apiKey: 'k',
      from: 'a@b.com',
      fetch: (async () => new Response('{}', { status: 422 })) as unknown as typeof globalThis.fetch,
    })
    const result = await transport.send({ to: 'not-an-address', subject: 's', text: 't', html: '' })
    expect(result.sent === false && result.retryable).toBe(false)
    expect(result.sent === false && result.detail).toMatch(/recipient address/)
  })

  it('does not throw when the provider is unreachable', async () => {
    const transport = resendTransport({
      apiKey: 'k',
      from: 'a@b.com',
      fetch: (async () => {
        throw new Error('ECONNREFUSED')
      }) as unknown as typeof globalThis.fetch,
    })
    const result = await transport.send({ to: 'x@y.com', subject: 's', text: 't', html: '' })
    expect(result.sent === false && result.retryable).toBe(true)
  })
})

describe('renderNotificationEmail', () => {
  const base = {
    title: 'Refund rate above threshold',
    body: 'Refunds are running higher than the level you set.',
    evidence: 'Refund rate 8.2% against a 5.0% threshold.',
    period: 'Yesterday',
    workspace: 'Acme Ltd',
    isDemo: false,
    link: 'https://app.example.com/app/revenue',
    preferencesUrl: 'https://app.example.com/app/notifications',
  }

  it('puts the evidence in both parts, because that is the actionable bit', () => {
    const { text, html } = renderNotificationEmail(base)
    expect(text).toContain('8.2% against a 5.0% threshold')
    expect(html).toContain('8.2% against a 5.0% threshold')
  })

  it('always includes a way to change what is emailed', () => {
    const { text, html } = renderNotificationEmail(base)
    expect(text).toContain('/app/notifications')
    expect(html).toContain('/app/notifications')
  })

  it('labels demo data in the email, not only in the app', () => {
    const { text, html } = renderNotificationEmail({ ...base, isDemo: true })
    expect(text).toMatch(/demonstration data/i)
    expect(html).toMatch(/demonstration data/i)
  })

  it('loads nothing from the network', () => {
    // An alert that needs a CDN to be legible is not an alert, and a remote
    // image is a read receipt nobody consented to.
    const { html } = renderNotificationEmail(base)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/<link/i)
    expect(html).not.toMatch(/<script/i)
  })

  it('escapes tenant text rather than rendering it as markup', () => {
    const { html } = renderNotificationEmail({
      ...base,
      title: '<script>alert(1)</script>',
      body: 'Product "A & B" <b>sold</b>',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })

  it('refuses a link that is not http, which would be stored XSS in a webmail client', () => {
    const { html } = renderNotificationEmail({ ...base, link: 'javascript:alert(1)' })
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="#"')
  })
})

describe('dispatch', () => {
  it('always records an in-app delivery, whatever happens to the email', async () => {
    const records = await dispatch(NOTIFICATION, [recipient({ email: null })], context())
    const inApp = records.find((r) => r.channel === 'in_app')!
    expect(inApp.status).toBe('delivered')
  })

  it('records why an email was not sent instead of staying silent', async () => {
    const records = await dispatch(
      NOTIFICATION,
      [
        recipient({
          userId: 'quiet',
          preferences: { ...DEFAULT_PREFERENCES, quietHoursStart: 22, quietHoursEnd: 7 },
          localHour: 2,
        }),
      ],
      context(),
    )

    const email = records.find((r) => r.channel === 'email')!
    expect(email.status).toBe('suppressed')
    expect(email.detail).toMatch(/quiet hours/i)
  })

  it('does not call an unconfigured provider a failure', async () => {
    // A deployment with no email provider is a supported configuration, not a
    // broken one. Marking it failed puts a permanent red mark on it.
    const records = await dispatch(NOTIFICATION, [recipient()], {
      ...context(),
      transport: unconfiguredTransport(),
    })
    const email = records.find((r) => r.channel === 'email')!
    expect(email.status).toBe('suppressed')
    expect(email.detail).toMatch(/no email provider/i)
  })

  it('records a send failure rather than losing it', async () => {
    const failing = {
      name: 'failing',
      configured: true,
      async send() {
        return { sent: false as const, retryable: true, detail: 'The provider returned 503.' }
      },
    }
    const records = await dispatch(NOTIFICATION, [recipient()], {
      ...context(),
      transport: failing,
    })
    const email = records.find((r) => r.channel === 'email')!
    expect(email.status).toBe('failed')
    expect(email.detail).toContain('503')
  })

  it('keeps going after one recipient fails', async () => {
    let calls = 0
    const flaky = {
      name: 'flaky',
      configured: true,
      async send() {
        calls += 1
        return calls === 1
          ? { sent: false as const, retryable: true, detail: 'boom' }
          : { sent: true as const, providerId: 'id' }
      },
    }

    const records = await dispatch(
      NOTIFICATION,
      [recipient({ userId: 'a' }), recipient({ userId: 'b' })],
      { ...context(), transport: flaky },
    )

    const emails = records.filter((r) => r.channel === 'email')
    expect(emails.map((r) => r.status)).toEqual(['failed', 'delivered'])
  })

  it('sends a critical alert through quiet hours', async () => {
    const transport = captureTransport()
    await dispatch(
      { ...NOTIFICATION, severity: 'critical' },
      [
        recipient({
          preferences: { ...DEFAULT_PREFERENCES, quietHoursStart: 22, quietHoursEnd: 7 },
          localHour: 3,
        }),
      ],
      context(transport),
    )
    expect(transport.sent).toHaveLength(1)
  })

  it('builds absolute links into the app', async () => {
    const transport = captureTransport()
    await dispatch(NOTIFICATION, [recipient()], context(transport))
    expect(transport.sent[0]!.text).toContain('https://app.example.com/app/revenue')
  })
})

describe('absolute', () => {
  it('joins without doubling or dropping a slash', () => {
    expect(absolute('https://x.com/', '/a')).toBe('https://x.com/a')
    expect(absolute('https://x.com', 'a')).toBe('https://x.com/a')
  })

  it('passes an absolute URL through', () => {
    expect(absolute('https://x.com', 'https://y.com/z')).toBe('https://y.com/z')
  })
})

describe('localHourIn', () => {
  it('reads the hour in the workspace zone, not the server zone', () => {
    const at = new Date('2025-06-01T23:30:00Z')
    expect(localHourIn('UTC', at)).toBe(23)
    expect(localHourIn('America/New_York', at)).toBe(19)
    expect(localHourIn('Asia/Tokyo', at)).toBe(8)
  })

  it('follows daylight saving rather than a fixed offset', () => {
    // A stored UTC offset is wrong for half the year, and quiet hours exist
    // precisely so nobody is woken at the wrong local time.
    const winter = new Date('2025-01-15T12:00:00Z')
    const summer = new Date('2025-07-15T12:00:00Z')
    expect(localHourIn('Europe/London', winter)).toBe(12)
    expect(localHourIn('Europe/London', summer)).toBe(13)
  })

  it('falls back to UTC for an unknown zone instead of failing the send', () => {
    const at = new Date('2025-06-01T09:00:00Z')
    expect(localHourIn('Mars/Olympus_Mons', at)).toBe(9)
  })
})
