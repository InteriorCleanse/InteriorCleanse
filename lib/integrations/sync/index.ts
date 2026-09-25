import type { SupabaseClient } from '@supabase/supabase-js'
import { openSecret, vaultProvider, type SealedSecret } from '@/lib/vault'
import { supabaseSink } from './persist'
import { runSync } from './run'
import { shopifyAdapter } from './shopify'
import { stripeAdapter } from './stripe'
import type { SyncAdapter, SyncOutcome } from './types'

export * from './types'
export { computeWindow, runSync } from './run'
export { stripeAdapter } from './stripe'
export { shopifyAdapter, nextLink } from './shopify'
export { supabaseSink } from './persist'
export { parseRetryAfter, requestJson } from './http'

/**
 * Running a sync for one connection, end to end.
 *
 * This is the only place credentials are opened for reading. It holds them for
 * the duration of the run, in a local, and never writes them anywhere — not to
 * a log line, not into the `integration_sync_runs.error` column, not into an
 * exception message. `runSync` never throws, which is what makes that promise
 * keepable: there is no path here where an unexpected stack trace carrying a
 * key escapes to a request handler.
 *
 * It also owns the bookkeeping nobody should have to remember: a `running` row
 * written *before* the work so a crashed process leaves visible evidence, the
 * connection's status and `last_success_at`, and — critically — advancing the
 * watermark only over records that were actually written.
 */

export const ADAPTERS: Record<string, SyncAdapter> = {
  stripe: stripeAdapter,
  shopify: shopifyAdapter,
}

export type ConnectionRow = {
  id: string
  organization_id: string
  provider: string
  settings: Record<string, unknown> | null
  last_success_at: string | null
}

export type SyncConnectionOptions = {
  now?: Date
  fetch?: typeof globalThis.fetch
  sleep?: (ms: number) => Promise<void>
  maxPages?: number
}

export async function syncConnection(
  admin: SupabaseClient,
  connection: ConnectionRow,
  options: SyncConnectionOptions = {},
): Promise<SyncOutcome> {
  const now = options.now ?? new Date()
  const adapter = ADAPTERS[connection.provider]

  if (!adapter) {
    // Not an error state for the connection: CSV has no sync loop and never
    // will, and marking it failed would put a red badge on a working import.
    return {
      status: 'failed',
      recordsRead: 0,
      recordsWritten: 0,
      window: { start: now, end: now },
      truncated: false,
      nextWindowStart: now,
      error: `${connection.provider} does not have an automatic sync.`,
      failureKind: 'misconfigured',
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
  const sink = supabaseSink(admin, connection.organization_id, connection.provider)

  const outcome = await runSync({
    adapter,
    sink,
    credentials,
    settings: connection.settings ?? {},
    lastSuccessAt: connection.last_success_at ? new Date(connection.last_success_at) : null,
    now,
    fetch: options.fetch,
    sleep: options.sleep,
    maxPages: options.maxPages,
  })

  if (run) {
    await admin
      .from('integration_sync_runs')
      .update({
        status: outcome.status === 'succeeded' ? 'succeeded' : outcome.status === 'partial' ? 'partial' : 'failed',
        finished_at: new Date().toISOString(),
        records_read: outcome.recordsRead,
        records_written: outcome.recordsWritten,
        error: outcome.error,
        window_start: outcome.window.start.toISOString(),
        // The window we can honestly claim to have covered, which on a
        // truncated run is not where we asked the vendor to stop.
        window_end: outcome.nextWindowStart.toISOString(),
      })
      .eq('id', run.id)
  }

  await admin
    .from('integration_connections')
    .update({
      status: outcome.connectionStatus,
      status_detail: outcome.error,
      last_attempt_at: now.toISOString(),
      // Only moves over data that was written. A failed run leaves the
      // watermark where it was, so the next run refetches the gap.
      ...(outcome.recordsWritten > 0 || outcome.status === 'succeeded'
        ? { last_success_at: outcome.nextWindowStart.toISOString() }
        : {}),
    })
    .eq('id', connection.id)

  return outcome
}

/**
 * Opens the sealed credentials for one connection.
 *
 * Failures are swallowed into an empty map on purpose: the adapter then raises
 * a `misconfigured` error with wording a customer can act on, rather than this
 * function throwing a vault exception whose message names key ids.
 */
async function openCredentials(
  admin: SupabaseClient,
  connection: ConnectionRow,
): Promise<Record<string, string>> {
  const { data } = await admin
    .from('integration_credentials')
    .select('id, field, sealed')
    .eq('connection_id', connection.id)
    .is('revoked_at', null)

  if (!data || data.length === 0) return {}

  const kek = vaultProvider()
  const credentials: Record<string, string> = {}

  for (const row of data as { id: string; field: string; sealed: SealedSecret }[]) {
    try {
      credentials[row.field] = await openSecret(
        row.sealed,
        {
          organizationId: connection.organization_id,
          credentialId: row.id,
          field: row.field,
        },
        kek,
      )
    } catch {
      // A credential that will not open is a real incident — a rotated key
      // removed too early, or a row moved between tenants, which the context
      // binding is there to catch. It surfaces as a misconfigured connection.
    }
  }

  return credentials
}
