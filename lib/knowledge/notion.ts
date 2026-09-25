import { requestJson } from '@/lib/integrations/sync/http'
import { SyncError } from '@/lib/integrations/sync/types'
import { blocksToMarkdown, pageTitle, type NotionBlock } from './markdown'
import type { KnowledgeAdapter, KnowledgePage, SourceContext } from './types'

/**
 * The Notion connector.
 *
 * Notion's integration model is the one that fits this product: a workspace
 * admin creates an internal integration, gets a token, and *shares specific
 * pages with it*. The integration sees nothing it has not been handed. That
 * is least privilege enforced at the vendor, before our vault is involved, and
 * it is why the connector asks for a token rather than an OAuth grant to the
 * whole workspace.
 *
 * What it reads and how:
 *
 * **Pages, via search, newest-edited first.** `/v1/search` returns every page
 * the integration can see, sorted by `last_edited_time`. On an incremental
 * run the adapter stops paging the moment it reaches a page older than the
 * cursor, which turns "list everything" into "list what changed" without a
 * filter the endpoint does not offer.
 *
 * **Blocks, recursively, converted to Markdown.** A page is fetched as its
 * block tree; nested blocks are fetched on demand up to a depth bound, because
 * a toggle inside a toggle inside a column is real and a pathological page can
 * nest forever.
 *
 * **Databases are listed, not flattened.** A database's rows are pages of
 * their own and arrive through the same search. Rendering a database inline
 * would duplicate every row into its parent.
 *
 * The token never appears in an error: `requestJson` discards vendor bodies,
 * and Notion's 401 body helpfully echoes the bearer token.
 */

const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'
const PAGE_SIZE = 50
/** Nested block depth. Past this, content is real but rare; cost is not. */
const MAX_DEPTH = 4
/** First run: only pages edited in the last two years. */
const INITIAL_BACKFILL_DAYS = 730

type SearchResult = {
  object: 'page' | 'database'
  id: string
  url?: string
  last_edited_time?: string
  archived?: boolean
  in_trash?: boolean
  properties?: Record<string, unknown>
  title?: { plain_text?: string }[]
}

type SearchResponse = {
  results: SearchResult[]
  has_more: boolean
  next_cursor: string | null
}

type BlocksResponse = {
  results: NotionBlock[]
  has_more: boolean
  next_cursor: string | null
}

export const notionAdapter: KnowledgeAdapter = {
  provider: 'notion',
  kind: 'knowledge',

  async fetchPage(context: SourceContext, cursor: string | null): Promise<KnowledgePage> {
    const token = context.credentials.api_key?.trim()
    if (!token) {
      throw new SyncError(
        'No Notion token is stored for this connection. Reconnect the integration.',
        'misconfigured',
        false,
      )
    }

    const since =
      context.since ?? new Date(Date.now() - INITIAL_BACKFILL_DAYS * 86_400_000)

    const search = await post<SearchResponse>(
      `${API}/search`,
      {
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: PAGE_SIZE,
        ...(cursor ? { start_cursor: cursor } : {}),
      },
      token,
      context,
    )

    const documents = []
    let reachedOld = false

    for (const result of search.results) {
      if (result.object !== 'page' || result.archived || result.in_trash) continue

      const edited = result.last_edited_time ? new Date(result.last_edited_time) : null
      // Sorted newest-first, so the first page older than the cursor means
      // every remaining page is too. Stop reading rather than reading and
      // discarding fifty pages a run forever.
      if (edited && edited < since) {
        reachedOld = true
        break
      }

      const blocks = await fetchBlocks(result.id, token, context, 0)
      documents.push({
        externalId: result.id,
        title: pageTitle(result),
        content: blocksToMarkdown(blocks),
        url: result.url ?? null,
        sourceUpdatedAt: edited,
      })
    }

    return {
      documents,
      cursor: reachedOld || !search.has_more ? null : search.next_cursor,
    }
  },
}

async function fetchBlocks(
  blockId: string,
  token: string,
  context: SourceContext,
  depth: number,
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = []
  let cursor: string | null = null

  do {
    const page: BlocksResponse = await get<BlocksResponse>(
      `${API}/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`,
      token,
      context,
    )

    for (const block of page.results) {
      if (block.has_children && depth < MAX_DEPTH && block.type !== 'child_page' && block.type !== 'child_database') {
        block.children = await fetchBlocks(block.id!, token, context, depth + 1)
      }
      blocks.push(block)
    }

    cursor = page.has_more ? page.next_cursor : null
  } while (cursor)

  return blocks
}

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'notion-version': VERSION,
    'content-type': 'application/json',
  }
}

async function get<T>(url: string, token: string, context: SourceContext): Promise<T> {
  const { body } = await requestJson<T>(url, { headers: headers(token) }, {
    fetch: context.fetch,
    sleep: context.sleep,
  })
  return body
}

async function post<T>(
  url: string,
  payload: unknown,
  token: string,
  context: SourceContext,
): Promise<T> {
  const { body } = await requestJson<T>(
    url,
    { method: 'POST', headers: headers(token), body: JSON.stringify(payload) },
    { fetch: context.fetch, sleep: context.sleep },
  )
  return body
}
