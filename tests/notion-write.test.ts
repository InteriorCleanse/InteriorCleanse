import { describe, expect, it } from 'vitest'
import type { Briefing } from '@/lib/assistant/briefings'
import {
  RICH_TEXT_LIMIT,
  briefingBlocks,
  briefingProperties,
  createBriefingPage,
  richText,
} from '@/lib/knowledge/notion-write'

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

describe('richText', () => {
  it('leaves short text as one item', () => {
    expect(richText('hello')).toEqual([{ type: 'text', text: { content: 'hello' } }])
  })

  it('chunks at the Notion limit on a word boundary', () => {
    // A single over-long item fails the whole page create, silently, on the
    // day the briefing had the most to say.
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ')
    const items = richText(words)
    expect(items.length).toBeGreaterThan(1)
    for (const item of items) {
      expect(item.text.content.length).toBeLessThanOrEqual(RICH_TEXT_LIMIT)
      expect(item.text.content.startsWith(' ')).toBe(false)
    }
    expect(items.map((i) => i.text.content).join(' ')).toBe(words)
  })

  it('hard-cuts a single word longer than the limit rather than looping', () => {
    const items = richText('x'.repeat(RICH_TEXT_LIMIT * 2 + 5))
    expect(items).toHaveLength(3)
  })
})

describe('briefingBlocks', () => {
  const blocks = briefingBlocks(briefing) as { type: string; [k: string]: unknown }[]

  it('puts the demo warning first, where a Notion reader will see it', () => {
    expect(blocks[0]!.type).toBe('callout')
    expect(JSON.stringify(blocks[0])).toContain('Demonstration data')
  })

  it('renders decisions as unchecked to-dos', () => {
    const todos = blocks.filter((b) => b.type === 'to_do')
    expect(todos).toHaveLength(1)
    expect(JSON.stringify(todos[0])).toContain('Product B')
    expect((todos[0]!.to_do as { checked: boolean }).checked).toBe(false)
  })

  it('renders every figure with its change', () => {
    const text = JSON.stringify(blocks)
    expect(text).toContain('Net revenue: £1,240.00 (up 4.1%)')
    expect(text).toContain('Refund rate: 1.2%')
  })

  it('omits sections that are empty', () => {
    const bare = briefingBlocks({ ...briefing, attention: [], caveats: [], followUps: [] })
    expect(JSON.stringify(bare)).not.toContain('Needs a decision')
    expect(JSON.stringify(bare)).not.toContain('Caveats')
  })
})

describe('briefingProperties', () => {
  it('finds the title property whatever it is called', () => {
    const props = briefingProperties(briefing, { Titel: { type: 'title' } }, new Date('2026-09-10T08:00:00Z'))
    expect(Object.keys(props)).toEqual(['Titel'])
    expect(JSON.stringify(props.Titel)).toContain('Morning briefing — Today')
  })

  it('fills only the columns the database actually has', () => {
    // Notion rejects unknown properties; an unconfigured database must still
    // get a page, with a title and a body and nothing refused.
    const schema = {
      Name: { type: 'title' },
      Date: { type: 'date' },
      'Net revenue': { type: 'number' },
      'Refund rate': { type: 'rich_text' },
      'Demo data': { type: 'checkbox' },
    }
    const props = briefingProperties(briefing, schema, new Date('2026-09-10T08:00:00Z')) as Record<string, unknown>
    expect(props.Date).toEqual({ date: { start: '2026-09-10' } })
    expect(props['Net revenue']).toEqual({ number: 1240 })
    expect(JSON.stringify(props['Refund rate'])).toContain('1.2%')
    expect(props['Demo data']).toEqual({ checkbox: true })
    expect(props.Kind).toBeUndefined()
    expect(props.Period).toBeUndefined()
  })

  it('does not force a figure into a column of the wrong type', () => {
    const props = briefingProperties(briefing, { Name: { type: 'title' }, 'Net revenue': { type: 'select' } }, new Date())
    expect(props['Net revenue']).toBeUndefined()
  })
})

describe('createBriefingPage', () => {
  const at = new Date('2026-09-10T08:00:00Z')
  const dbId = '0123456789abcdef0123456789abcdef'

  it('reads the schema, then posts a page with parent, properties and children', async () => {
    const calls: { url: string; body?: unknown; auth?: string }[] = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: headers.authorization })
      if (String(url).includes('/databases/')) {
        return new Response(JSON.stringify({ properties: { Name: { type: 'title' }, Date: { type: 'date' } } }), { status: 200 })
      }
      return new Response(JSON.stringify({ id: 'page-1', url: 'https://notion.so/page-1' }), { status: 200 })
    }) as unknown as typeof globalThis.fetch

    const result = await createBriefingPage({ token: 'tok', databaseId: dbId, briefing, at, fetch: fetchImpl, sleep: async () => {} })

    expect(result).toEqual({ ok: true, pageId: 'page-1', url: 'https://notion.so/page-1' })
    expect(calls[0]!.url).toContain(`/databases/${dbId}`)
    expect(calls[0]!.auth).toBe('Bearer tok')
    const body = calls[1]!.body as { parent: unknown; properties: Record<string, unknown>; children: unknown[] }
    expect(body.parent).toEqual({ database_id: dbId })
    expect(Object.keys(body.properties).sort()).toEqual(['Date', 'Name'])
    expect(body.children.length).toBeGreaterThan(3)
  })

  it('refuses a database id that could not be one, without a request', async () => {
    let called = false
    const fetchImpl = (async () => { called = true; return new Response('{}') }) as unknown as typeof globalThis.fetch
    const result = await createBriefingPage({ token: 't', databaseId: '../x', briefing, at, fetch: fetchImpl })
    expect(result.ok).toBe(false)
    expect(called).toBe(false)
  })

  it('reports a rejected token as permanent and never throws', async () => {
    const fetchImpl = (async () => new Response('{"message":"invalid token tok"}', { status: 401 })) as unknown as typeof globalThis.fetch
    const result = await createBriefingPage({ token: 'tok', databaseId: dbId, briefing, at, fetch: fetchImpl, sleep: async () => {} })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.retryable).toBe(false)
    expect(JSON.stringify(result)).not.toContain('tok"')
  })
})
