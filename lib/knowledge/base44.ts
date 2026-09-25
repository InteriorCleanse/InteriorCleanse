import { requestJson } from '@/lib/integrations/sync/http'
import { SyncError } from '@/lib/integrations/sync/types'
import type { KnowledgeAdapter, KnowledgeDocument, KnowledgePage, SourceContext } from './types'

/**
 * The Base44 connector.
 *
 * Base44 is a no-code app builder; an app's data lives in named entities
 * behind a small REST API keyed by an app id and an API key. It cannot build
 * this product and is not a system of record for money — but a business that
 * keeps its supplier list, its SOPs or its project tracker in a Base44 app has
 * context the assistant should be able to cite, and this reads it.
 *
 * Rows become documents, not tables. A row is rendered as a Markdown
 * definition list — one line per field — because full-text search over "Lead
 * time: 14 days" finds the answer to "what is our lead time", and a table
 * cell does not. Long text fields are kept whole; nested objects are
 * flattened one level and then serialised, so nothing is dropped.
 *
 * One entity per connection. A connection that read every entity in an app
 * would need to know which fields are a title and which are a secret, and
 * that is not knowable from the outside. The person choosing the entity is
 * the person who knows.
 *
 * Incremental by `updated_date`, which Base44 stamps on every record. The API
 * has no filter for it, so the adapter reads pages sorted newest-first and
 * stops at the first record older than the cursor — the same shape as Notion.
 */

const API = 'https://app.base44.com/api/apps'
const PAGE_SIZE = 100
const INITIAL_BACKFILL_DAYS = 730

type Base44Record = Record<string, unknown> & {
  id?: string
  created_date?: string
  updated_date?: string
}

export const base44Adapter: KnowledgeAdapter = {
  provider: 'base44',
  kind: 'knowledge',

  async fetchPage(context: SourceContext, cursor: string | null): Promise<KnowledgePage> {
    const key = context.credentials.api_key?.trim()
    if (!key) {
      throw new SyncError(
        'No Base44 API key is stored for this connection. Reconnect the integration.',
        'misconfigured',
        false,
      )
    }

    const appId = String(context.settings.appId ?? '').trim()
    const entity = String(context.settings.entity ?? '').trim()
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(appId) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(entity)) {
      // Both go into the URL. Validated at connect time too, but settings can
      // be edited afterwards and an unvalidated segment is a request into a
      // path we did not choose.
      throw new SyncError(
        'The Base44 app id or entity name on this connection is not valid.',
        'misconfigured',
        false,
      )
    }

    const since = context.since ?? new Date(Date.now() - INITIAL_BACKFILL_DAYS * 86_400_000)
    const skip = cursor ? Number(cursor) : 0

    const { body } = await requestJson<Base44Record[] | { data?: Base44Record[] }>(
      `${API}/${encodeURIComponent(appId)}/entities/${encodeURIComponent(entity)}?sort=-updated_date&limit=${PAGE_SIZE}&skip=${skip}`,
      { headers: { api_key: key, accept: 'application/json' } },
      { fetch: context.fetch, sleep: context.sleep },
    )

    const records = Array.isArray(body) ? body : (body.data ?? [])
    const documents: KnowledgeDocument[] = []
    let reachedOld = false

    for (const record of records) {
      const updated = record.updated_date ? new Date(record.updated_date) : null
      if (updated && updated < since) {
        reachedOld = true
        break
      }
      const id = String(record.id ?? '')
      if (!id) continue
      documents.push({
        externalId: `${entity}:${id}`,
        title: titleOf(record, entity, id),
        content: recordToMarkdown(record),
        url: null,
        sourceUpdatedAt: updated,
      })
    }

    return {
      documents,
      cursor: reachedOld || records.length < PAGE_SIZE ? null : String(skip + records.length),
    }
  },
}

const TITLE_FIELDS = ['title', 'name', 'subject', 'label', 'heading', 'summary']
const HIDDEN = new Set(['id', 'created_date', 'updated_date', 'created_by', 'is_sample'])

/** Exported for tests: the title precedence and the field rendering. */
export function titleOf(record: Base44Record, entity: string, id: string): string {
  for (const field of TITLE_FIELDS) {
    const value = record[field]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 300)
  }
  return `${entity} ${id}`
}

export function recordToMarkdown(record: Base44Record): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(record)) {
    if (HIDDEN.has(key) || value === null || value === undefined || value === '') continue
    lines.push(`- **${humanise(key)}:** ${renderValue(value)}`)
  }
  return lines.join('\n')
}

function renderValue(value: unknown): string {
  if (typeof value === 'string') return value.includes('\n') ? `\n${value.trim().replace(/^/gm, '  ')}` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.every((v) => typeof v !== 'object' || v === null)
      ? value.map(String).join(', ')
      : JSON.stringify(value)
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${humanise(k)} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join('; ')
  }
  return String(value)
}

function humanise(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
