import { cronDenied, isCronAuthorized } from '@/lib/cron'
import { readiness } from '@/lib/readiness'
import { supabaseAdmin } from '@/lib/supabase/server'
import { rateLimitStore } from '@/lib/ratelimit-configured'

/**
 * The runbook's alerting signals, as numbers something can poll.
 *
 * `docs/RUNBOOK.md` names five things to alert on. Two of them — auth failure
 * rate and p95 latency — live in the host's request logs, not in our database,
 * and are wired at the platform. The other three are visible only from inside,
 * and until this endpoint existed "alerting configured" had nothing to point
 * at. This gives a monitor one URL and a shared secret.
 *
 * Each figure carries its own threshold and a `firing` flag, so the monitor
 * does not have to know what a healthy number is — the runbook already
 * decided, and the decision lives here next to the query. Counts only, over a
 * fixed recent window, never content: this is a cross-tenant view behind a
 * shared secret, and there is no reason for any workspace's data to appear in
 * it.
 *
 * Rate-limit 429s are deliberately absent. They are the system working, and a
 * signal that pages on them trains people to ignore the channel.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Recent enough to be actionable, wide enough not to flap on one event. */
const WINDOW_MINUTES = 60

export type Signal = {
  id: string
  label: string
  value: number
  threshold: number
  firing: boolean
  /** From the runbook: what a person should do first. */
  action: string
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return cronDenied()

  const admin = supabaseAdmin()
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()

  const [syncFailed, syncStuck, deliveriesFailed, purgeBacklog, approvalsStale] =
    await Promise.all([
      count(admin, 'integration_sync_runs', (q) =>
        q.in('status', ['failed', 'partial']).gte('started_at', since),
      ),
      // A run still 'running' long after it started is a process that died
      // mid-sync. The watermark did not move, so nothing is lost, but the
      // connection will look healthy until someone notices.
      count(admin, 'integration_sync_runs', (q) =>
        q.eq('status', 'running').lt('started_at', new Date(Date.now() - 30 * 60_000).toISOString()),
      ),
      count(admin, 'notification_deliveries', (q) =>
        q.eq('status', 'failed').gte('attempted_at', since),
      ),
      // Deleted workspaces past their grace period that are still present:
      // the purge is not running, and a sentence we made to the customer is
      // becoming false one day at a time.
      count(admin, 'organizations', (q) =>
        q.not('deleted_at', 'is', null).lt('deleted_at', new Date(Date.now() - 31 * 86_400_000).toISOString()),
      ),
      count(admin, 'action_approvals', (q) =>
        q.eq('status', 'approved').is('executed_at', null).lt('decided_at', since),
      ),
    ])

  const store = rateLimitStore()
  const storeError = (store as { lastError?: Error | null }).lastError ?? null
  const report = readiness()

  const signals: Signal[] = [
    signal('sync.failed', `Connector runs failed or partial in the last ${WINDOW_MINUTES} minutes`, syncFailed, 0,
      'Open /app/integrations for the workspace; a revoked credential needs the customer, a vendor 5xx retries itself.'),
    signal('sync.stuck', 'Connector runs still marked running after 30 minutes', syncStuck, 0,
      'A process died mid-sync. No data is lost; confirm the scheduler is firing and the next sweep will refetch.'),
    signal('email.failed', `Notification deliveries failed in the last ${WINDOW_MINUTES} minutes`, deliveriesFailed, 0,
      'Check notification_deliveries.detail — a rejected API key is permanent, a provider 5xx is transient.'),
    signal('purge.backlog', 'Deleted workspaces overdue for removal', purgeBacklog, 0,
      'The hourly sweep is not running or is failing on delete. The customer was told 30 days.'),
    signal('approvals.unexecuted', 'Approved assistant actions not executed within an hour', approvalsStale, 0,
      'An approval was granted and the action never ran. Check the assistant route and the approval TTL.'),
    signal('ratelimit.store', 'Rate-limit store unreachable', storeError ? 1 : 0, 0,
      'The limiter is failing open: the assistant spend cap is off. Check the Upstash credentials and status.'),
    signal('readiness.blockers', 'Deployment readiness blockers', report.blockers, 0,
      'Open /owner-admin. A blocker appearing on a running deployment means configuration changed underneath it.'),
  ]

  return Response.json(
    {
      at: new Date().toISOString(),
      windowMinutes: WINDOW_MINUTES,
      firing: signals.filter((s) => s.firing).map((s) => s.id),
      signals,
      // Named so the monitor can display them, not so it can compute them:
      // these two are measured at the platform, not here.
      measuredElsewhere: ['auth.failure_rate', 'latency.p95.command_center'],
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}

function signal(
  id: string,
  label: string,
  value: number,
  threshold: number,
  action: string,
): Signal {
  return { id, label, value, threshold, firing: value > threshold, action }
}

type Query = ReturnType<ReturnType<typeof supabaseAdmin>['from']>['select']

async function count(
  admin: ReturnType<typeof supabaseAdmin>,
  table: string,
  refine: (q: ReturnType<Query>) => ReturnType<Query>,
): Promise<number> {
  const { count: total, error } = await refine(
    admin.from(table).select('id', { count: 'exact', head: true }),
  )
  // A failed count is reported as zero rather than thrown, so one broken
  // query cannot take down every other signal. The readiness blocker signal
  // will surface a database that is actually gone.
  return error ? 0 : (total ?? 0)
}
