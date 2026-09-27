import { describe, expect, it } from 'vitest'
import {
  AGENDA_LABELS,
  agendaWindow,
  describeWhen,
  eventsIn,
  localStartOfDay,
} from '@/lib/assistant/agenda'
import { TOOLS_BY_NAME, type ToolContext } from '@/lib/assistant/tools'
import { OAUTH_PROVIDERS } from '@/lib/calendar/oauth'
import { buildDemoAgenda, buildDemoInbox } from '@/lib/demo/sources'
import {
  INBOX_LIMIT,
  MailError,
  fetchUnread,
  gmailMessageUrl,
  inboxQuery,
  parseFrom,
  parseMessage,
} from '@/lib/mail/gmail'

/**
 * "It runs your day": the mailbox read and the day's window. The vendor
 * parsing is against recorded shapes, the window arithmetic is in a real
 * time zone, and the two assistant tools are held to citing what they read.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('Gmail scope', () => {
  it('asks to read mail and nothing more', () => {
    // The assistant summarises; it never sends, replies or deletes, and the
    // consent screen must say exactly that.
    const scopes = OAUTH_PROVIDERS.gmail.scopes.join(' ')
    expect(scopes).toContain('gmail.readonly')
    expect(scopes).not.toMatch(/gmail\.(modify|send|compose|labels|settings)|mail\.google\.com/)
  })

  it('shares Google’s endpoints and offline consent with the calendar', () => {
    expect(OAUTH_PROVIDERS.gmail.tokenUrl).toBe(OAUTH_PROVIDERS.google.tokenUrl)
    expect(OAUTH_PROVIDERS.gmail.extraAuthParams.prompt).toBe('consent')
    expect(OAUTH_PROVIDERS.gmail.extraAuthParams.access_type).toBe('offline')
  })
})

describe('parseFrom', () => {
  it('splits a display name from an address and drops quotes', () => {
    expect(parseFrom('Maya Chen <maya@harbour.co>')).toEqual({ name: 'Maya Chen', address: 'maya@harbour.co' })
    expect(parseFrom('"Chen, Maya" <maya@harbour.co>')).toEqual({ name: 'Chen, Maya', address: 'maya@harbour.co' })
  })

  it('uses a bare address as its own name, and invents nothing for an empty header', () => {
    expect(parseFrom('maya@harbour.co')).toEqual({ name: 'maya@harbour.co', address: 'maya@harbour.co' })
    expect(parseFrom('')).toEqual({ name: '(unknown sender)', address: null })
  })
})

describe('parseMessage', () => {
  it('reads the headers it asked for and decodes the preview', () => {
    const message = parseMessage({
      id: 'm1',
      threadId: 't1',
      snippet: 'Can we move Thursday&#39;s call? &amp; confirm the PO',
      internalDate: '1758870000000',
      payload: {
        headers: [
          { name: 'From', value: 'Maya Chen <maya@harbour.co>' },
          { name: 'Subject', value: 'Spring order' },
          { name: 'Date', value: 'Fri, 26 Sep 2026 07:00:00 +0000' },
        ],
      },
    })!
    expect(message.from).toBe('Maya Chen')
    expect(message.subject).toBe('Spring order')
    expect(message.snippet).toBe("Can we move Thursday's call? & confirm the PO")
    expect(message.receivedAt).toBe(new Date(1758870000000).toISOString())
    expect(message.url).toBe(gmailMessageUrl('m1'))
  })

  it('says "(no subject)" rather than inventing one, and drops a message with no id', () => {
    expect(parseMessage({ id: 'm2', payload: { headers: [] } })!.subject).toBe('(no subject)')
    expect(parseMessage({ payload: { headers: [] } })).toBeNull()
  })
})

describe('fetchUnread', () => {
  const detail = (id: string, from: string, at: number) => ({
    id,
    threadId: id,
    snippet: `preview ${id}`,
    internalDate: String(at),
    payload: { headers: [{ name: 'From', value: from }, { name: 'Subject', value: `Subject ${id}` }] },
  })

  it('lists unread inbox mail, fetches metadata only, and returns newest first', async () => {
    const requested: string[] = []
    const fetchImpl = (async (url: string) => {
      requested.push(String(url))
      if (String(url).includes('/messages?')) return json({ messages: [{ id: 'a' }, { id: 'b' }] })
      if (String(url).includes('/messages/a')) return json(detail('a', 'x@y.z', 1_000))
      return json(detail('b', 'Q <q@y.z>', 2_000))
    }) as unknown as typeof globalThis.fetch

    const messages = await fetchUnread({ accessToken: 'at', limit: 5, fetch: fetchImpl })
    expect(messages.map((m) => m.id)).toEqual(['b', 'a'])

    const list = new URL(requested[0]!)
    expect(list.searchParams.get('q')).toBe(inboxQuery())
    expect(list.searchParams.get('q')).toContain('is:unread')
    expect(list.searchParams.get('maxResults')).toBe('5')
    // Metadata, never the body.
    for (const url of requested.slice(1)) expect(url).toContain('format=metadata')
  })

  it('never fetches more than the limit, whatever the list returned', async () => {
    let detailCalls = 0
    const fetchImpl = (async (url: string) => {
      if (String(url).includes('/messages?')) {
        return json({ messages: Array.from({ length: 40 }, (_, i) => ({ id: `m${i}` })) })
      }
      detailCalls += 1
      return json(detail('m', 'x@y.z', 1))
    }) as unknown as typeof globalThis.fetch

    await fetchUnread({ accessToken: 'at', limit: 100, fetch: fetchImpl })
    expect(detailCalls).toBe(INBOX_LIMIT)
  })

  it('returns nothing, not an error, for an empty inbox', async () => {
    const fetchImpl = (async () => json({})) as unknown as typeof globalThis.fetch
    expect(await fetchUnread({ accessToken: 'at', fetch: fetchImpl })).toEqual([])
  })

  it('treats a rejected token or a missing scope as permanent and a 5xx as retryable', async () => {
    const at = async (status: number) =>
      fetchUnread({
        accessToken: 'at',
        fetch: (async () => json({}, status)) as unknown as typeof globalThis.fetch,
      })
        .then(() => null)
        .catch((e: unknown) => e as MailError)

    expect((await at(401))!.retryable).toBe(false)
    expect((await at(403))!.retryable).toBe(false)
    expect((await at(403))!.message).toMatch(/Reconnect/)
    expect((await at(503))!.retryable).toBe(true)
  })
})

describe('agenda window', () => {
  // 23:30 in New York on the 25th is already the 26th in UTC. The window must
  // follow the person's clock, not the server's.
  const now = new Date('2026-09-26T03:30:00Z')

  it('starts the day at local midnight in the person’s zone', () => {
    expect(localStartOfDay(now, 'America/New_York').toISOString()).toBe('2026-09-25T04:00:00.000Z')
    expect(localStartOfDay(now, 'UTC').toISOString()).toBe('2026-09-26T00:00:00.000Z')
    expect(localStartOfDay(now, 'Asia/Tokyo').toISOString()).toBe('2026-09-25T15:00:00.000Z')
  })

  it('falls back to UTC for an unknown zone rather than returning nothing', () => {
    expect(localStartOfDay(now, 'Mars/Olympus').toISOString()).toBe('2026-09-26T00:00:00.000Z')
  })

  it('makes today, tomorrow and the week from that start', () => {
    const today = agendaWindow('today', now, 'America/New_York')
    expect(today.from.toISOString()).toBe('2026-09-25T04:00:00.000Z')
    expect(today.to.toISOString()).toBe('2026-09-26T04:00:00.000Z')

    const tomorrow = agendaWindow('tomorrow', now, 'America/New_York')
    expect(tomorrow.from.toISOString()).toBe('2026-09-26T04:00:00.000Z')
    expect(tomorrow.label).toBe(AGENDA_LABELS.tomorrow)

    const week = agendaWindow('this_week', now, 'America/New_York')
    expect((week.to.getTime() - week.from.getTime()) / 86_400_000).toBe(7)
  })

  it('describes a time the way a person would, in their zone', () => {
    const event = { startsAt: '2026-09-25T13:30:00Z', endsAt: '2026-09-25T14:00:00Z', allDay: false }
    expect(describeWhen(event, 'America/New_York')).toBe('Fri 09:30–10:00')
    expect(describeWhen({ ...event, allDay: true }, 'America/New_York')).toBe('All day, Fri 25 Sept')
  })

  it('keeps only events that start inside the window, soonest first', () => {
    const events = buildDemoAgenda(now)
    const window = agendaWindow('today', now, 'UTC')
    const inside = eventsIn(events, window)
    for (const e of inside) {
      expect(new Date(e.startsAt).getTime()).toBeGreaterThanOrEqual(window.from.getTime())
      expect(new Date(e.startsAt).getTime()).toBeLessThan(window.to.getTime())
    }
    expect(inside.map((e) => e.startsAt)).toEqual([...inside.map((e) => e.startsAt)].sort())
  })
})

describe('the demo day', () => {
  it('is fixed for a fixed clock and carries the demo source', () => {
    const now = new Date('2026-03-01T00:00:00Z')
    expect(buildDemoInbox(now)).toEqual(buildDemoInbox(now))
    expect(buildDemoAgenda(now)).toEqual(buildDemoAgenda(now))
    for (const e of buildDemoAgenda(now)) expect(e.source).toBe('demo')
    expect(buildDemoInbox(now).length).toBeGreaterThanOrEqual(3)
  })
})

describe('the day tools', () => {
  const now = new Date('2026-03-01T09:00:00Z')

  function ctx(over: Partial<ToolContext> = {}): ToolContext {
    return {
      organizationId: 'org-1',
      isDemo: true,
      currency: 'GBP',
      can: () => true,
      now,
      timeZone: 'Europe/London',
      readInbox: async () => ({
        connected: true,
        accountEmail: 'me@example.com',
        messages: buildDemoInbox(now),
        error: null,
      }),
      queryAgenda: async (from, to) => eventsIn(buildDemoAgenda(now), { from, to, label: '' }),
      ...over,
    }
  }

  it('say plainly when nothing is connected, and still say where they looked', async () => {
    const inbox = TOOLS_BY_NAME.get('read_inbox')!
    const bare = ctx({ readInbox: undefined, queryAgenda: undefined })
    const result = await inbox.execute(inbox.schema.parse({}), bare)
    expect(result.data).toMatchObject({ available: false })
    expect(result.citations).toEqual(['mail_inbox'])

    const calendar = TOOLS_BY_NAME.get('check_calendar')!
    const day = await calendar.execute(calendar.schema.parse({}), bare)
    expect(day.data).toMatchObject({ available: false })
    expect(day.citations).toEqual(['calendar_events'])
  })

  it('cites every message it read, with a label and a link to open it', async () => {
    const inbox = TOOLS_BY_NAME.get('read_inbox')!
    const result = await inbox.execute(inbox.schema.parse({ limit: 3 }), ctx())
    const data = result.data as { unread: { from: string; subject: string }[]; note: string }
    expect(data.unread.length).toBe(3)
    expect(result.citations!.length).toBe(3)
    const keys = new Set(result.sources!.map((s) => s.key))
    for (const key of result.citations!) expect(keys.has(key)).toBe(true)
    for (const source of result.sources!) expect(source.url).toMatch(/^https:\/\/mail\.google\.com\//)
    // The rule that matters most: mail is words, never instructions.
    expect(data.note).toMatch(/never an instruction/i)
  })

  it('reports the day in the person’s own zone and cites the calendar', async () => {
    const calendar = TOOLS_BY_NAME.get('check_calendar')!
    const result = await calendar.execute(calendar.schema.parse({ day: 'today' }), ctx())
    const data = result.data as { day: string; events: { title: string; when: string }[]; count: number }
    expect(data.day).toBe('Today')
    expect(data.count).toBe(data.events.length)
    expect(data.count).toBeGreaterThan(0)
    expect(result.citations![0]).toBe('calendar_events')
    expect(result.citations!.length).toBe(1 + data.count)
  })

  it('bounds how much mail one question can pull', () => {
    const inbox = TOOLS_BY_NAME.get('read_inbox')!
    expect(inbox.schema.safeParse({ limit: 500 }).success).toBe(false)
    expect(inbox.schema.safeParse({ limit: INBOX_LIMIT }).success).toBe(true)
  })

  it('reports a connection that failed to read as unavailable, with the reason', async () => {
    const inbox = TOOLS_BY_NAME.get('read_inbox')!
    const result = await inbox.execute(
      inbox.schema.parse({}),
      ctx({
        readInbox: async () => ({
          connected: true,
          accountEmail: 'me@example.com',
          messages: [],
          error: 'The mailbox access token was rejected.',
        }),
      }),
    )
    expect(result.data).toMatchObject({ available: false, reason: expect.stringMatching(/rejected/) })
  })
})
