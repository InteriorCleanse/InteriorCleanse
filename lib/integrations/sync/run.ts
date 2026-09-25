import {
  SyncError,
  type AdapterContext,
  type SyncAdapter,
  type SyncFailureKind,
  type SyncOutcome,
  type SyncSink,
  type SyncWindow,
} from './types'

/**
 * The sync runner: everything about a sync that is not vendor-specific.
 *
 * The decisions encoded here, and why each one is the way it is:
 *
 * **Windows overlap on purpose.** A sync that resumes from exactly the last
 * success timestamp loses records, every time. Vendors index on their own
 * clock, apply their own eventual consistency, and backdate objects that were
 * created during an outage. So each run starts `OVERLAP_MINUTES` before the
 * last success and re-reads that slice. Overlap is free because every write is
 * an upsert keyed on the vendor's own id — and a duplicate order is a wrong
 * number on a dashboard, which is much worse than a wasted request.
 *
 * **The first run does not fetch all history.** An account with four years of
 * orders would run for hours, hit every rate limit, and time out. The first run
 * takes `INITIAL_BACKFILL_DAYS` and the window advances from there.
 *
 * **A run has a page budget.** Not for politeness — so a single run terminates.
 * When the budget runs out the outcome is `partial` and `nextWindowStart` is
 * where the vendor's own pagination had got to, not the window end. Reporting
 * `succeeded` here would silently skip everything past the cut.
 *
 * **The watermark only advances over data that was actually written.** If page
 * three fails, pages one and two are kept — throwing them away means a
 * permanently failing connection also has permanently no data — but the
 * watermark stays where the failure was, so the next run refetches from there.
 *
 * **The runner never throws.** A failed sync is a normal operating state that
 * has to be recorded, shown on the health page, and retried. An exception
 * escaping into a request handler produces a 500 and no `integration_sync_runs`
 * row, which is precisely the case where an operator most needs the record.
 */

const OVERLAP_MINUTES = 30
const INITIAL_BACKFILL_DAYS = 90
const MAX_PAGES = 50

export type RunSyncInput = {
  adapter: SyncAdapter
  sink: SyncSink
  credentials: Record<string, string>
  settings: Record<string, unknown>
  /** Last successful sync for this connection, or null if it has never run. */
  lastSuccessAt: Date | null
  now?: Date
  fetch?: typeof globalThis.fetch
  sleep?: (ms: number) => Promise<void>
  maxPages?: number
}

export function computeWindow(lastSuccessAt: Date | null, now: Date): SyncWindow {
  if (!lastSuccessAt) {
    return { start: new Date(now.getTime() - INITIAL_BACKFILL_DAYS * 86_400_000), end: now }
  }

  const start = new Date(lastSuccessAt.getTime() - OVERLAP_MINUTES * 60_000)
  // A clock that has gone backwards, or a stored timestamp from the future,
  // must not produce an inverted window that silently fetches nothing.
  return { start: start > now ? now : start, end: now }
}

export async function runSync(input: RunSyncInput): Promise<SyncOutcome> {
  const now = input.now ?? new Date()
  const window = computeWindow(input.lastSuccessAt, now)
  const maxPages = input.maxPages ?? MAX_PAGES

  const context: AdapterContext = {
    credentials: input.credentials,
    settings: input.settings,
    window,
    fetch: input.fetch ?? globalThis.fetch,
    sleep: input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  }

  let cursor: string | null = null
  let read = 0
  let written = 0
  let pages = 0
  /** The newest record we have durably written. The watermark rides on this. */
  let highWaterMark: Date | null = null

  while (pages < maxPages) {
    let page
    try {
      page = await input.adapter.fetchPage(context, cursor)
    } catch (error) {
      return failure(error, { window, read, written, highWaterMark })
    }

    pages += 1
    read += page.orders.length + page.refunds.length

    try {
      const result = await input.sink.write(page)
      written += result.written
    } catch (error) {
      // A write failure is ours, not the vendor's, and says nothing about the
      // credential — so it must not mark the connection as revoked.
      return {
        status: read > 0 ? 'partial' : 'failed',
        recordsRead: read,
        recordsWritten: written,
        window,
        truncated: true,
        nextWindowStart: highWaterMark ?? window.start,
        error: `The records could not be saved: ${describe(error)}`,
        failureKind: 'bad_response',
        connectionStatus: 'degraded',
      }
    }

    highWaterMark = newest(highWaterMark, page)

    if (page.cursor === null) {
      return {
        status: 'succeeded',
        recordsRead: read,
        recordsWritten: written,
        window,
        truncated: false,
        nextWindowStart: window.end,
        error: null,
        failureKind: null,
        connectionStatus: 'connected',
      }
    }

    cursor = page.cursor
  }

  return {
    status: 'partial',
    recordsRead: read,
    recordsWritten: written,
    window,
    truncated: true,
    // Explicitly *not* window.end: everything past the cut is unread.
    nextWindowStart: highWaterMark ?? window.start,
    error: `Stopped after ${maxPages} pages so the run would terminate. The next run resumes from where this one stopped.`,
    failureKind: null,
    connectionStatus: 'degraded',
  }
}

function failure(
  error: unknown,
  state: {
    window: SyncWindow
    read: number
    written: number
    highWaterMark: Date | null
  },
): SyncOutcome {
  const kind: SyncFailureKind = error instanceof SyncError ? error.kind : 'bad_response'
  const message = error instanceof SyncError ? error.message : describe(error)

  return {
    // Records already written stay written and are reported as such — a
    // partially-synced day is a fact the operator should see.
    status: state.written > 0 ? 'partial' : 'failed',
    recordsRead: state.read,
    recordsWritten: state.written,
    window: state.window,
    truncated: true,
    nextWindowStart: state.highWaterMark ?? state.window.start,
    error: message,
    failureKind: kind,
    connectionStatus: connectionStatusFor(kind),
  }
}

/**
 * Maps a failure to what the connection badge should say.
 *
 * `revoked` is reserved for an actual credential rejection, because the health
 * page tells the customer to go and reconnect — telling them that when the
 * vendor merely had a bad minute wastes their time and teaches them to ignore
 * the badge.
 */
function connectionStatusFor(kind: SyncFailureKind): SyncOutcome['connectionStatus'] {
  switch (kind) {
    case 'auth':
      return 'revoked'
    case 'misconfigured':
      return 'error'
    case 'rate_limited':
    case 'vendor_unavailable':
    case 'network':
      return 'degraded'
    case 'bad_response':
      return 'error'
  }
}

function newest(current: Date | null, page: { orders: { placedAt: Date }[]; refunds: { refundedAt: Date }[] }): Date | null {
  let best = current
  for (const order of page.orders) {
    if (!best || order.placedAt > best) best = order.placedAt
  }
  for (const refund of page.refunds) {
    if (!best || refund.refundedAt > best) best = refund.refundedAt
  }
  return best
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.'
}
