import { describe, expect, it } from 'vitest'
import type { Briefing } from '@/lib/assistant/briefings'
import {
  briefingNote,
  documentNote,
  frontmatter,
  parseMarkdownNote,
  propertyKey,
  safeFilename,
  toZipEntries,
} from '@/lib/knowledge/obsidian'
import {
  escapeMrkdwn,
  isSlackWebhookUrl,
  renderSlackPayload,
  slackWebhookTransport,
} from '@/lib/notifications/slack'
import { buildZip, crc32 } from '@/lib/zip'

// ── ZIP ─────────────────────────────────────────────────────────────────────

describe('crc32', () => {
  it('matches the standard check value', () => {
    // The CRC-32 of "123456789" is the reference vector every implementation
    // is checked against. Getting it wrong means every archive fails to open.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('is zero-safe', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('buildZip', () => {
  const bytes = buildZip([
    { name: 'a/one.md', content: 'hello', modifiedAt: new Date('2026-01-02T03:04:06Z') },
    { name: 'b/twö.md', content: 'wörld', modifiedAt: new Date('2026-01-02T03:04:06Z') },
  ])
  const view = new DataView(bytes.buffer)

  it('starts with a local header and ends with the end-of-central-directory', () => {
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50)
  })

  it('records the entry count in the trailer', () => {
    expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(2)
  })

  it('flags names as UTF-8 so accents survive on every platform', () => {
    // General purpose bit 11 in the first local header.
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800)
  })

  it('stores each file uncompressed with its CRC', () => {
    const hello = new TextEncoder().encode('hello')
    expect(view.getUint16(8, true)).toBe(0) // method: stored
    expect(view.getUint32(14, true)).toBe(crc32(hello))
    expect(view.getUint32(18, true)).toBe(hello.length)
    const nameLength = view.getUint16(26, true)
    const data = bytes.slice(30 + nameLength, 30 + nameLength + hello.length)
    expect(new TextDecoder().decode(data)).toBe('hello')
  })

  it('points the central directory at the right local offsets', () => {
    const centralSize = view.getUint32(bytes.length - 22 + 12, true)
    const centralOffset = view.getUint32(bytes.length - 22 + 16, true)
    const central = new DataView(bytes.buffer, centralOffset, centralSize)
    expect(central.getUint32(0, true)).toBe(0x02014b50)
    expect(central.getUint32(42, true)).toBe(0) // first entry at offset 0
  })
})

// ── Obsidian ────────────────────────────────────────────────────────────────

describe('safeFilename', () => {
  it('strips the characters a vault cannot use or would read as links', () => {
    expect(safeFilename('Q3: plan [draft] #1 | notes/2026')).toBe('Q3 plan draft 1 notes 2026')
  })

  it('never returns a hidden file or an empty name', () => {
    expect(safeFilename('...')).toBe('Untitled')
    expect(safeFilename('   ')).toBe('Untitled')
  })
})

describe('frontmatter', () => {
  it('quotes values YAML would reinterpret', () => {
    const fm = frontmatter({ a: 'plain', b: 'has: colon', c: '2026', d: 'yes', e: '', f: 3, g: true })
    expect(fm).toContain('a: plain')
    expect(fm).toContain('b: "has: colon"')
    expect(fm).toContain('c: "2026"')
    expect(fm).toContain('d: "yes"')
    expect(fm).toContain('e: ""')
    expect(fm).toContain('f: 3')
    expect(fm).toContain('g: true')
  })

  it('renders lists and skips nulls', () => {
    const fm = frontmatter({ tags: ['a', 'b'], missing: null })
    expect(fm).toContain('tags:\n  - a\n  - b')
    expect(fm).not.toContain('missing')
  })

  it('escapes quotes inside a quoted value', () => {
    expect(frontmatter({ t: 'say "hi": now' })).toContain('t: "say \\"hi\\": now"')
  })
})

describe('propertyKey', () => {
  it('turns a label into a Dataview-friendly key', () => {
    expect(propertyKey('Net revenue')).toBe('net_revenue')
    expect(propertyKey('ROAS (30d)')).toBe('roas_30d')
  })
})

describe('briefingNote', () => {
  const briefing: Briefing = {
    kind: 'morning',
    title: 'Morning briefing',
    period: 'Today',
    comparisonPeriod: 'Yesterday',
    currency: 'GBP',
    isDemo: true,
    headline: 'Revenue is up and refunds are quiet.',
    lines: [
      { label: 'Net revenue', value: '£1,240.00', change: 'up 4.1%', sentiment: 'positive' },
      { label: 'Refund rate', value: '1.2%', change: null, sentiment: 'neutral' },
    ],
    attention: ['Ad spend on Product B exceeds its margin.'],
    caveats: ['Stripe last synced 3 hours ago.'],
    followUps: ['Which product drove the increase?'],
  }
  const note = briefingNote(briefing, new Date('2026-09-10T08:00:00Z'), 'Acme Ltd')

  it('files under Briefings with the date first so the folder sorts', () => {
    expect(note.path).toBe('Aurelis/Briefings/2026-09-10 Morning briefing.md')
  })

  it('writes each figure as a property as well as prose', () => {
    expect(note.markdown).toContain('net_revenue: "£1,240.00"')
    expect(note.markdown).toContain('refund_rate: "1.2%"')
    expect(note.markdown).toContain('- **Net revenue:** £1,240.00 (up 4.1%)')
  })

  it('labels demo data with a callout, not a footnote', () => {
    expect(note.markdown).toContain('[!warning] Demonstration data')
    expect(note.markdown).toContain('demo_data: true')
  })

  it('renders decisions as unchecked tasks', () => {
    expect(note.markdown).toContain('- [ ] Ad spend on Product B exceeds its margin.')
  })
})

describe('documentNote and bundle', () => {
  it('folders knowledge by source', () => {
    const note = documentNote({ title: 'Refund policy', content: 'Thirty days.', source: 'notion', url: 'https://n', updatedAt: null })
    expect(note.path).toBe('Aurelis/Knowledge/notion/Refund policy.md')
    // Quoted: a colon inside an unquoted YAML value is a mapping.
    expect(note.markdown).toContain('source_url: "https://n"')
  })

  it('suffixes a duplicate path rather than overwriting it in the zip', () => {
    const a = documentNote({ title: 'Same', content: 'a', source: 'notion', url: null, updatedAt: null })
    const b = documentNote({ title: 'Same', content: 'b', source: 'notion', url: null, updatedAt: null })
    const entries = toZipEntries([a, b])
    expect(entries.map((e) => e.name)).toEqual([
      'Aurelis/Knowledge/notion/Same.md',
      'Aurelis/Knowledge/notion/Same (2).md',
    ])
  })
})

describe('parseMarkdownNote', () => {
  it('prefers frontmatter title, then the first heading, then the filename', () => {
    expect(parseMarkdownNote('x.md', '---\ntitle: From meta\n---\n# From heading\nbody').title).toBe('From meta')
    expect(parseMarkdownNote('x.md', '# From heading\nbody').title).toBe('From heading')
    expect(parseMarkdownNote('notes/Q3 plan.md', 'just body').title).toBe('Q3 plan')
  })

  it('strips frontmatter from the content and keeps wikilinks', () => {
    const parsed = parseMarkdownNote('x.md', '---\ndate: 2026-09-01\n---\nSee [[Refund policy]].')
    expect(parsed.content).toBe('See [[Refund policy]].')
    expect(parsed.updatedAt?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('ignores an unparseable date rather than failing the upload', () => {
    expect(parseMarkdownNote('x.md', '---\ndate: soon\n---\nbody').updatedAt).toBeNull()
  })

  it('drops a byte-order mark', () => {
    expect(parseMarkdownNote('x.md', '﻿# Title\nbody').title).toBe('Title')
  })
})

// ── Slack ───────────────────────────────────────────────────────────────────

describe('isSlackWebhookUrl', () => {
  it('accepts the documented shape and nothing else', () => {
    expect(isSlackWebhookUrl('https://hooks.slack.com/services/T000/B000/xyz')).toBe(true)
    expect(isSlackWebhookUrl('https://evil.example.com/services/T000/B000/xyz')).toBe(false)
    expect(isSlackWebhookUrl('http://hooks.slack.com/services/T000/B000/xyz')).toBe(false)
  })
})

describe('renderSlackPayload', () => {
  const message = {
    title: 'Refund rate <high>',
    body: 'Refunds & returns are up.',
    evidence: '8.2% against 5%',
    severity: 'warning' as const,
    workspace: 'Acme',
    link: 'https://app.example.com/app/revenue',
  }

  it('escapes mrkdwn so tenant text cannot become a link or mention', () => {
    const payload = renderSlackPayload(message) as { blocks: { text?: { text: string } }[] }
    expect(payload.blocks[1]!.text!.text).toBe('Refunds &amp; returns are up.')
    expect(escapeMrkdwn('<!channel>')).toBe('&lt;!channel&gt;')
  })

  it('carries a plain-text fallback for notifications', () => {
    expect((renderSlackPayload(message) as { text: string }).text).toContain('Refund rate')
  })

  it('refuses a non-http link on the button', () => {
    const payload = renderSlackPayload({ ...message, link: 'javascript:alert(1)' }) as {
      blocks: { elements?: { url?: string }[] }[]
    }
    expect(payload.blocks[3]!.elements![0]!.url).toBeUndefined()
  })
})

describe('slackWebhookTransport', () => {
  const message = {
    title: 't', body: 'b', evidence: null, severity: 'critical' as const, workspace: 'w', link: 'https://x',
  }
  const withStatus = (status: number) =>
    slackWebhookTransport({
      webhookUrl: 'https://hooks.slack.com/services/T/B/x',
      fetch: (async () => new Response('', { status })) as unknown as typeof globalThis.fetch,
    })

  it('treats a revoked webhook as permanent', async () => {
    const r = await withStatus(404).send(message)
    expect(r.sent).toBe(false)
    expect(r.sent === false && r.retryable).toBe(false)
  })

  it('treats a rate limit and a 5xx as retryable', async () => {
    expect((await withStatus(429).send(message)) as { retryable: boolean }).toMatchObject({ retryable: true })
    expect((await withStatus(503).send(message)) as { retryable: boolean }).toMatchObject({ retryable: true })
  })

  it('never puts the webhook url in a failure', async () => {
    const r = await withStatus(500).send(message)
    expect(JSON.stringify(r)).not.toContain('hooks.slack.com')
  })

  it('does not throw when Slack is unreachable', async () => {
    const t = slackWebhookTransport({
      webhookUrl: 'https://hooks.slack.com/services/T/B/x',
      fetch: (async () => { throw new Error('ECONNRESET') }) as unknown as typeof globalThis.fetch,
    })
    expect((await t.send(message)).sent).toBe(false)
  })
})
