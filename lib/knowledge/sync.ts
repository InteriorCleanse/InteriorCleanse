import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hubspotAdapter } from '@/lib/crm/hubspot'
import { base44Adapter } from './base44'
import { SyncError, type SyncFailureKind } from '@/lib/integrations/sync/types'
import { openSecret, vaultProvider, type SealedSecret } from '@/lib/vault'
import { notionAdapter } from './notion'
import type { CrmPage, KnowledgePage, SourceAdapter } from './types'

/**
 * Running a knowledge or CRM sync for one connection.
 *
 * Deliberately a sibling of `lib/integrations/sync`, not a generalisation of
 * it. The commerce runner's whole design — overlapping windows, watermarks that
 * only advance over written records — exists because orders are money and a
 * missed one is a wrong number. Notes and deals are different: a page missed
 * this hour is caught next hour by `last_edited_time`, and the cost of a wrong
 * abstraction shared between the two would be paid on every change to either.
 *
 * What is the same, because it is the same problem:
 *
 *   - Credentials are opened here, held in a local, and never written
 *     anywhere. `syncSource` never throws, so no stack trace carrying a token
 *     reaches a handler.
 *   - A `running` row lands before the work, so a dead process leaves evidence.
 *   - Only a rejected credential marks the connection `revoked`. Vendor
 *     trouble is `degraded` and retries itself.
 *   - Every write upserts on the vendor's own id; the page budget bounds a run.
 *
 * What is specific: content is hashed, and an unchanged page is a no-op rather
 * than a rewrite that bumps `updated_at` and makes every note look freshly
 * edited.
 */

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  notion: notionAdapter,
  base44: base44Adapter,
  hubspot: hubspotAdapter,
}

/** The content bound the schema enforces, minus room for the truncation note. */
export const CONTENT_LIMIT = 60_000 - 200
const MAX_PAGES = 20

export type SourceConnectionRow = {
  id: string
  organization_id: string
  provider: string
  settings: Record<string, unknown> | null
  last_success_at: string | null
}

export type SourceSyncOutcome = {
  status: 'succeeded' | 'partial' | 'failed'
  recordsRead: number
  recordsWritten: number
  error: string | null
  connectionStatus: 'connected' | 'degraded' | 'error' | 'revoked'
}

export async function syncSource(
  admin: SupabaseClient,
  connection: SourceConnectionRow,
  options: { now?: Date; fetch?: typeof globalThis.fetch; sleep?: (ms: number) => Promise<void>; maxPages?: number } = {},
): Promise<SourceSyncOutcome> {
  const now = options.now ?? new Date()
  const adapter = SOURCE_ADAPTERS[connection.provider]

  if (!adapter) {
    return {
      status: 'failed',
      recordsRead: 0,
      recordsWritten: 0,
      error: `${connection.provider} does not have an automatic sync.`,
      connectionStatus: 'connected',
    }
  }

  const { data: run } = await admin
    .from('integration_sync_runs')
    .insert({
      organization_id: connection.organization_id,
      connection_id: connection.id,
      status: 'running',
      started_at: now.toISOString(),
    })
    .select('id')
    .single()

  const credentials = await openCredentials(admin, connection)
  const context = {
    credentials,
    settings: connection.settings ?? {},
    since: connection.last_success_at ? new Date(connection.last_success_at) : null,
    fetch: options.fetch ?? globalThis.fetch,
    sleep: options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))),
  }

  let cursor: string | null = null
  let read = 0
  let written = 0
  let pages = 0
  let outcome: SourceSyncOutcome | null = null

  while (pages < (options.maxPages ?? MAX_PAGES)) {
    let page: KnowledgePage | CrmPage
    try {
      page = await adapter.fetchPage(context, cursor)
    } catch (error) {
      outcome = failure(error, read, written)
      break
    }
    pages += 1

    try {
      if (adapter.kind === 'knowledge') {
        const p = page as KnowledgePage
        read += p.documents.length
        written += await writeDocuments(admin, connection, p)
      } else {
        const p = page as CrmPage
        read += p.contacts.length + p.deals.length
        written += await writeCrm(admin, connection, p)
      }
    } catch (error) {
      outcome = {
        status: written > 0 ? 'partial' : 'failed',
        recordsRead: read,
        recordsWritten: written,
        error: `The records could not be saved: ${error instanceof Error ? error.message : 'unknown error'}`,
        connectionStatus: 'degraded',
      }
      break
    }

    if (page.cursor === null) {
      outcome = { status: 'succeeded', recordsRead: read, recordsWritten: written, error: null, connectionStatus: 'connected' }
      break
    }
    cursor = page.cursor
  }

  outcome ??= {
    status: 'partial',
    recordsRead: read,
    recordsWritten: written,
    error: `Stopped after ${pages} pages so the run would terminate. The next run continues.`,
    connectionStatus: 'degraded',
  }

  if (run) {
    await admin
      .from('integration_sync_runs')
      .update({
        status: outcome.status,
        finished_at: new Date().toISOString(),
        records_read: outcome.recordsRead,
        records_written: outcome.recordsWritten,
        error: outcome.error,
        window_start: context.since?.toISOString() ?? null,
        window_end: now.toISOString(),
      })
      .eq('id', run.id)
  }

  await admin
    .from('integration_connections')
    .update({
      status: outcome.connectionStatus,
      status_detail: outcome.error,
      last_attempt_at: now.toISOString(),
      // Advances on success or partial progress: a partial run has read pages
      // in edit order, and `last_edited_time` makes the rest catch up next
      // hour. A failed run holds still so nothing is skipped.
      ...(outcome.status !== 'failed' ? { last_success_at: now.toISOString() } : {}),
    })
    .eq('id', connection.id)

  return outcome
}

function failure(error: unknown, read: number, written: number): SourceSyncOutcome {
  const kind: SyncFailureKind = error instanceof SyncError ? error.kind : 'bad_response'
  return {
    status: written > 0 ? 'partial' : 'failed',
    recordsRead: read,
    recordsWritten: written,
    error: error instanceof Error ? error.message : 'Unknown error.',
    connectionStatus:
      kind === 'auth' ? 'revoked' : kind === 'misconfigured' || kind === 'bad_response' ? 'error' : 'degraded',
  }
}

/** Bounds and hashes a document. Exported for the upload route and tests. */
export function prepareDocument(content: string): { content: string; truncated: boolean; hash: string } {
  const truncated = content.length > CONTENT_LIMIT
  const bounded = truncated
    ? `${content.slice(0, CONTENT_LIMIT)}\n\n_[Truncated: the original is longer than this product stores. Open the source for the rest.]_`
    : content
  return { content: bounded, truncated, hash: createHash('sha256').update(bounded).digest('hex') }
}

async function writeDocuments(
  admin: SupabaseClient,
  connection: SourceConnectionRow,
  page: KnowledgePage,
): Promise<number> {
  if (page.documents.length === 0) return 0

  // Unchanged pages are skipped: rewriting them bumps updated_at and makes the
  // whole knowledge base look edited today.
  const { data: existing } = await admin
    .from('knowledge_documents')
    .select('external_id, content_hash')
    .eq('organization_id', connection.organization_id)
    .eq('source', connection.provider)
    .in('external_id', page.documents.map((d) => d.externalId))
  const known = new Map((existing ?? []).map((row) => [row.external_id as string, row.content_hash as string]))

  const rows = page.documents.flatMap((doc) => {
    const prepared = prepareDocument(doc.content)
    if (known.get(doc.externalId) === prepared.hash) return []
    return [{
      organization_id: connection.organization_id,
      connection_id: connection.id,
      source: connection.provider,
      external_id: doc.externalId,
      title: doc.title.slice(0, 300),
      url: doc.url,
      content: prepared.content,
      truncated: prepared.truncated,
      content_hash: prepared.hash,
      source_updated_at: doc.sourceUpdatedAt?.toISOString() ?? null,
    }]
  })
  if (rows.length === 0) return 0

  const { error } = await admin
    .from('knowledge_documents')
    .upsert(rows, { onConflict: 'organization_id,source,external_id' })
  if (error) throw new Error(error.message)
  return rows.length
}

async function writeCrm(
  admin: SupabaseClient,
  connection: SourceConnectionRow,
  page: CrmPage,
): Promise<number> {
  let written = 0

  if (page.contacts.length > 0) {
    const { error } = await admin.from('customers').upsert(
      page.contacts.map((c) => ({
        organization_id: connection.organization_id,
        source: connection.provider,
        external_id: c.externalId,
        email: c.email,
        first_name: c.firstName,
        last_name: c.lastName,
      })),
      { onConflict: 'organization_id,source,external_id' },
    )
    if (error) throw new Error(error.message)
    written += page.contacts.length
  }

  if (page.deals.length > 0) {
    // Link deals to the customers we hold, by the vendor's contact id.
    const contactIds = page.deals.map((d) => d.contactExternalId).filter((id): id is string => Boolean(id))
    const { data: customers } = contactIds.length > 0
      ? await admin
          .from('customers')
          .select('id, external_id')
          .eq('organization_id', connection.organization_id)
          .eq('source', connection.provider)
          .in('external_id', contactIds)
      : { data: [] as { id: string; external_id: string }[] }
    const customerByExternal = new Map((customers ?? []).map((c) => [c.external_id, c.id]))

    const { error } = await admin.from('crm_deals').upsert(
      page.deals.map((d) => ({
        organization_id: connection.organization_id,
        connection_id: connection.id,
        source: connection.provider,
        external_id: d.externalId,
        name: d.name.slice(0, 300),
        stage: d.stage,
        outcome: d.outcome,
        amount_minor: d.amountMinor,
        currency: d.currency,
        probability: d.probability,
        expected_close_on: d.expectedCloseOn,
        owner_name: d.ownerName,
        customer_id: d.contactExternalId ? (customerByExternal.get(d.contactExternalId) ?? null) : null,
        source_updated_at: d.sourceUpdatedAt?.toISOString() ?? null,
      })),
      { onConflict: 'organization_id,source,external_id' },
    )
    if (error) throw new Error(error.message)
    written += page.deals.length
  }

  return written
}

async function openCredentials(
  admin: SupabaseClient,
  connection: SourceConnectionRow,
): Promise<Record<string, string>> {
  const { data } = await admin
    .from('integration_credentials')
    .select('id, field, sealed')
    .eq('connection_id', connection.id)
    .is('revoked_at', null)
  if (!data?.length) return {}

  const kek = vaultProvider()
  const out: Record<string, string> = {}
  for (const row of data as { id: string; field: string; sealed: SealedSecret }[]) {
    try {
      out[row.field] = await openSecret(
        row.sealed,
        { organizationId: connection.organization_id, credentialId: row.id, field: row.field },
        kek,
      )
    } catch {
      // Surfaces as a misconfigured connection from the adapter, never as a
      // vault exception naming key ids.
    }
  }
  return out
}
