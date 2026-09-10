import { describe, expect, it } from 'vitest'
import { hubspotAdapter } from '@/lib/crm/hubspot'
import { base44Adapter, recordToMarkdown, titleOf } from '@/lib/knowledge/base44'
import { blocksToMarkdown, pageTitle, richTextToMarkdown } from '@/lib/knowledge/markdown'
import { notionAdapter } from '@/lib/knowledge/notion'
import { MAX_TERMS, searchTerms, snippet, toTsQuery } from '@/lib/knowledge/search'
import { CONTENT_LIMIT, prepareDocument } from '@/lib/knowledge/sync'
import type { SourceContext } from '@/lib/knowledge/types'
import {
  base44Suppliers,
  hubspotContacts,
  hubspotDeals,
  hubspotPipelines,
  notionBlocksRefunds,
  notionBlocksWholesaleChildren,
  notionSearchPage1,
} from './fixtures/knowledge-responses'

const sleep = async () => {}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function context(fetchImpl: typeof globalThis.fetch, since: Date | null = null): SourceContext {
  return {
    credentials: { api_key: 'test-token' },
    settings: {},
    since,
    fetch: fetchImpl,
    sleep,
  }
}

// ── Notion blocks → Markdown ─────────────────────────────────────────────────

describe('blocksToMarkdown', () => {
  const md = blocksToMarkdown(notionBlocksRefunds.results as never)

  it('renders headings, emphasis and links', () => {
    expect(md).toContain('## Window')
    expect(md).toContain('**30 days**')
    expect(md).toContain('[the returns form](https://example.com/returns)')
  })

  it('renders to-dos and fenced code', () => {
    expect(md).toContain('- [ ] Update the FAQ')
    expect(md).toContain('```bash\nrefund --order 1042\n```')
  })

  it('never drops text because the block type was unfamiliar', () => {
    // Notion adds block types faster than any converter tracks them.
    expect(md).toContain('Do not lose this sentence.')
  })

  it('indents nested children', () => {
    const nested = blocksToMarkdown([
      {
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ plain_text: 'Parent' }] },
        children: [
          { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: 'Child' }] } },
        ],
      },
    ])
    expect(nested).toBe('- Parent\n  - Child')
  })

  it('numbers list items within a run and resets after a break', () => {
    const md2 = blocksToMarkdown([
      { type: 'numbered_list_item', numbered_list_item: { rich_text: [{ plain_text: 'a' }] } },
      { type: 'numbered_list_item', numbered_list_item: { rich_text: [{ plain_text: 'b' }] } },
      { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'break' }] } },
      { type: 'numbered_list_item', numbered_list_item: { rich_text: [{ plain_text: 'c' }] } },
    ])
    expect(md2).toBe('1. a\n2. b\nbreak\n1. c')
  })

  it('renders a table with a header rule', () => {
    const table = blocksToMarkdown([
      {
        type: 'table',
        children: [
          { type: 'table_row', table_row: { cells: [[{ plain_text: 'Plan' }], [{ plain_text: 'Price' }]] } },
          { type: 'table_row', table_row: { cells: [[{ plain_text: 'Free' }], [{ plain_text: '0' }]] } },
        ],
      },
    ])
    expect(table).toBe('| Plan | Price |\n| --- | --- |\n| Free | 0 |')
  })

  it('reads the title from whichever property is the title', () => {
    expect(pageTitle({ properties: { Name: { type: 'title', title: [{ plain_text: 'Refund policy' }] } } })).toBe('Refund policy')
    expect(pageTitle({ properties: {} })).toBe('Untitled')
  })

  it('handles inline code inside bold', () => {
    expect(richTextToMarkdown([{ plain_text: 'x', annotations: { bold: true, code: true } }])).toBe('**`x`**')
  })
})

// ── Notion adapter ──────────────────────────────────────────────────────────

describe('the Notion adapter', () => {
  const fetchNotion = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url)
    if (href.endsWith('/search')) {
      expect(init?.headers).toMatchObject({ 'notion-version': expect.any(String) })
      return json(notionSearchPage1)
    }
    if (href.includes('/blocks/page-refunds/children')) return json(notionBlocksRefunds)
    if (href.includes('/blocks/b3/children')) return json(notionBlocksWholesaleChildren)
    if (href.includes('/blocks/page-old/children')) return json({ results: [], has_more: false, next_cursor: null })
    throw new Error(`unexpected request: ${href}`)
  }) as unknown as typeof globalThis.fetch

  it('skips archived pages and databases', async () => {
    const page = await notionAdapter.fetchPage(context(fetchNotion), null)
    const ids = page.documents.map((d) => d.externalId)
    expect(ids).toContain('page-refunds')
    expect(ids).not.toContain('page-archived')
    expect(ids).not.toContain('db-1')
  })

  it('fetches nested children and renders them', async () => {
    const page = await notionAdapter.fetchPage(context(fetchNotion), null)
    const refunds = page.documents.find((d) => d.externalId === 'page-refunds')!
    expect(refunds.content).toContain('- Wholesale orders\n  - 14 days, restocking fee applies')
  })

  it('stops paging at the first page older than the cursor', async () => {
    // Sorted newest-first, so everything after the first old page is old too.
    const since = new Date('2025-06-01T00:00:00Z')
    const page = await notionAdapter.fetchPage(context(fetchNotion, since), null)
    expect(page.documents.map((d) => d.externalId)).toEqual(['page-refunds'])
    expect(page.cursor).toBeNull()
  })

  it('continues paging on a first run', async () => {
    const page = await notionAdapter.fetchPage(context(fetchNotion), null)
    expect(page.documents.map((d) => d.externalId)).toEqual(['page-refunds', 'page-old'])
    expect(page.cursor).toBe('cursor-2')
  })

  it('carries the page url and edit time for citation', async () => {
    const page = await notionAdapter.fetchPage(context(fetchNotion), null)
    const refunds = page.documents[0]!
    expect(refunds.url).toContain('notion.so')
    expect(refunds.sourceUpdatedAt?.toISOString()).toBe('2025-06-10T09:00:00.000Z')
    expect(refunds.title).toBe('Refund policy')
  })

  it('refuses without a token, in words a customer can act on', async () => {
    await expect(
      notionAdapter.fetchPage({ ...context(fetchNotion), credentials: {} }, null),
    ).rejects.toThrow(/Reconnect the integration/)
  })
})

// ── HubSpot adapter ─────────────────────────────────────────────────────────

describe('the HubSpot adapter', () => {
  const fetchHubspot = (async (url: string | URL | Request) => {
    const href = String(url)
    if (href.endsWith('/objects/contacts/search')) return json(hubspotContacts)
    if (href.endsWith('/objects/deals/search')) return json(hubspotDeals)
    if (href.endsWith('/pipelines/deals')) return json(hubspotPipelines)
    throw new Error(`unexpected request: ${href}`)
  }) as unknown as typeof globalThis.fetch

  it('reads contacts first, then deals, then stops', async () => {
    const first = await hubspotAdapter.fetchPage(context(fetchHubspot), null)
    expect(first.contacts).toHaveLength(2)
    expect(first.cursor).toBe('contacts:200')

    const second = await hubspotAdapter.fetchPage(context(fetchHubspot), 'deals:')
    expect(second.deals).toHaveLength(3)
    expect(second.cursor).toBeNull()
  })

  it('turns blank strings into null rather than empty names', async () => {
    const page = await hubspotAdapter.fetchPage(context(fetchHubspot), null)
    const anon = page.contacts.find((c) => c.externalId === '102')!
    expect(anon.firstName).toBeNull()
    expect(anon.email).toBeNull()
  })

  it('converts amounts to minor units without a float', async () => {
    const page = await hubspotAdapter.fetchPage(context(fetchHubspot), 'deals:')
    const annual = page.deals.find((d) => d.externalId === '5001')!
    expect(annual.amountMinor).toBe(1_200_050)
    expect(annual.currency).toBe('GBP')
  })

  it('keeps the stage label verbatim and normalises only the outcome', async () => {
    const page = await hubspotAdapter.fetchPage(context(fetchHubspot), 'deals:')
    const byId = new Map(page.deals.map((d) => [d.externalId, d]))
    expect(byId.get('5001')!.stage).toBe('Contract sent')
    expect(byId.get('5001')!.outcome).toBe('open')
    expect(byId.get('5002')!.outcome).toBe('lost')
  })

  it('reports the vendor probability as a percentage, or null', async () => {
    const page = await hubspotAdapter.fetchPage(context(fetchHubspot), 'deals:')
    const byId = new Map(page.deals.map((d) => [d.externalId, d]))
    expect(byId.get('5001')!.probability).toBe(90)
    expect(byId.get('5003')!.probability).toBe(20)
  })

  it('reports a missing amount as unknown, never zero', async () => {
    const page = await hubspotAdapter.fetchPage(context(fetchHubspot), 'deals:')
    const early = page.deals.find((d) => d.externalId === '5003')!
    expect(early.amountMinor).toBeNull()
    expect(early.currency).toBeNull()
  })

  it('links a deal to its contact by the vendor id', async () => {
    const page = await hubspotAdapter.fetchPage(context(fetchHubspot), 'deals:')
    expect(page.deals.find((d) => d.externalId === '5001')!.contactExternalId).toBe('101')
    expect(page.deals.find((d) => d.externalId === '5002')!.contactExternalId).toBeNull()
  })

  it('filters by last-modified so a moved deal comes back', async () => {
    let body = ''
    const spy = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/objects/contacts/search')) body = String(init?.body)
      return json({ results: [] })
    }) as unknown as typeof globalThis.fetch
    await hubspotAdapter.fetchPage(context(spy, new Date('2025-06-01T00:00:00Z')), null)
    expect(body).toContain('hs_lastmodifieddate')
    expect(body).toContain('"GTE"')
  })
})

// ── Search ──────────────────────────────────────────────────────────────────

describe('searchTerms', () => {
  it('keeps the words that carry the answer and drops the ones that only ask', () => {
    expect(searchTerms('What did we decide about refund windows for wholesale?')).toEqual([
      'decide', 'refund', 'windows', 'wholesale',
    ])
  })

  it('deduplicates and bounds', () => {
    const many = Array.from({ length: 20 }, (_, i) => `term${i}`).join(' ')
    expect(searchTerms(`refund refund ${many}`)).toHaveLength(MAX_TERMS)
  })
})

describe('toTsQuery', () => {
  it('ORs the terms and prefixes only the last', () => {
    expect(toTsQuery('refund policy onboard')).toBe("'refund' | 'policy' | 'onboard':*")
  })

  it('escapes an apostrophe rather than letting it become syntax', () => {
    expect(toTsQuery("what's the plan")).toBe("'what''s' | 'plan':*")
  })

  it('returns null when nothing is worth searching for', () => {
    expect(toTsQuery('what is it')).toBeNull()
  })
})

describe('snippet', () => {
  const doc = `${'Preamble sentence. '.repeat(20)}The refund window is thirty days from delivery, and wholesale orders carry a restocking fee. ${'Trailing text. '.repeat(20)}`

  it('windows around the first matching term with whole words', () => {
    const s = snippet(doc, 'refund window wholesale', 120)
    expect(s).toContain('refund window')
    expect(s.startsWith('…')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(s.length).toBeLessThanOrEqual(124)
  })

  it('falls back to the opening when no term appears literally', () => {
    expect(snippet(doc, 'zzzz', 40).startsWith('Preamble')).toBe(true)
  })

  it('returns a short document whole', () => {
    expect(snippet('Short note.', 'note')).toBe('Short note.')
  })
})

// ── Bounding ────────────────────────────────────────────────────────────────

describe('prepareDocument', () => {
  it('leaves a normal document alone', () => {
    const p = prepareDocument('hello')
    expect(p.truncated).toBe(false)
    expect(p.content).toBe('hello')
    expect(p.hash).toHaveLength(64)
  })

  it('truncates an oversized document and says so in the text', () => {
    const p = prepareDocument('x'.repeat(CONTENT_LIMIT + 5_000))
    expect(p.truncated).toBe(true)
    expect(p.content.length).toBeLessThanOrEqual(60_000)
    expect(p.content).toMatch(/Truncated/)
  })

  it('hashes so an unchanged page is recognisable', () => {
    expect(prepareDocument('same').hash).toBe(prepareDocument('same').hash)
    expect(prepareDocument('same').hash).not.toBe(prepareDocument('other').hash)
  })
})

// ── Base44 adapter ──────────────────────────────────────────────────────────

describe('the Base44 adapter', () => {
  const fetchBase44 = (async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toContain('/apps/app_123456/entities/Supplier?')
    expect(init?.headers).toMatchObject({ api_key: 'test-token' })
    return json(base44Suppliers)
  }) as unknown as typeof globalThis.fetch

  const ctx = (since: Date | null = null): SourceContext => ({
    ...context(fetchBase44, since),
    settings: { appId: 'app_123456', entity: 'Supplier' },
  })

  it('renders each field on its own line, so a question about one field finds it', () => {
    const md = recordToMarkdown(base44Suppliers[0] as never)
    expect(md).toContain('- **Name:** Northwind Packaging')
    expect(md).toContain('- **Lead time days:** 14')
    expect(md).toContain('- **Tags:** boxes, primary')
    expect(md).toContain('Email orders@northwind.example')
    expect(md).toContain('  Minimum order 500 units.')
    expect(md).not.toContain('is_sample')
  })

  it('titles from a name-like field, else from the entity and id', () => {
    expect(titleOf(base44Suppliers[0] as never, 'Supplier', 'r1')).toBe('Northwind Packaging')
    expect(titleOf(base44Suppliers[1] as never, 'Supplier', 'r2')).toBe('Supplier r2')
  })

  it('reads a page and namespaces ids by entity', async () => {
    const page = await base44Adapter.fetchPage(ctx(), null)
    expect(page.documents.map((d) => d.externalId)).toEqual(['Supplier:r1', 'Supplier:r2', 'Supplier:r3'])
    expect(page.cursor).toBeNull() // fewer than a full page
  })

  it('stops at the first record older than the cursor', async () => {
    const page = await base44Adapter.fetchPage(ctx(new Date('2025-06-01T00:00:00Z')), null)
    expect(page.documents.map((d) => d.externalId)).toEqual(['Supplier:r1', 'Supplier:r2'])
  })

  it('refuses an app id or entity that could not be a path segment', async () => {
    const bad = { ...ctx(), settings: { appId: '../other', entity: 'Supplier' } }
    await expect(base44Adapter.fetchPage(bad, null)).rejects.toThrow(/not valid/)
  })
})
