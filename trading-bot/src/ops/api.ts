/**
 * OPERATIONS API — thin handlers over the ops modules, mounted by the server
 * under /api/ops/*. Every GET is a reading. The POSTs are operator actions on
 * ops records only (mark a checkpoint reviewed, run the retries, recompute a
 * report) and reach nothing in the engine.
 */

import type { FeedHealth } from '../data/feed.ts'
import { checkCheckpoints, listCheckpoints, markCheckpointReviewed } from './checkpoints.ts'
import { feedHealthReport } from './feedHealth.ts'
import { heartbeat } from './heartbeat.ts'
import { dailyIntegrity, dataIntegrityReport, listIntegrityReports } from './integrity.ts'
import { errorCounts, recentOps, suppressedRepeats } from './log.ts'
import type { OpsComponent, OpsSeverity } from './log.ts'
import { lastOpsHealth, opsHealth, performanceNow } from './monitor.ts'
import { lastReconciliation, reconciliationReport } from './reconcile.ts'
import { listRetries, runRetries } from './retry.ts'
import type { RetryHandler } from './retry.ts'
import { soakReport } from './soak.ts'

export class OpsApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

type EngineError = { time: number; message: string } | null

export function opsHealthView(feed: FeedHealth | null, engineError: EngineError = null, now = Date.now()) {
  return opsHealth({ feed, engineError, now, probe: false })
}
export function opsHealthLast(feed: FeedHealth | null, engineError: EngineError = null) { return lastOpsHealth() ?? opsHealthView(feed, engineError) }
export function opsHeartbeat(feed: FeedHealth | null, now = Date.now()) { return heartbeat({ feed, now, probe: false }) }
export function opsFeed(feed: FeedHealth | null, now = Date.now()) { return feedHealthReport(feed, now) }
export function opsSoak(now = Date.now()) { return soakReport(now) }
export function opsPerformance() { return performanceNow() }

export function opsReconciliation(q: { run?: string | null; limit?: string | null }, now = Date.now()) {
  if (q.run === '1' || q.run === 'true') return reconciliationReport({ now, limit: q.limit ? Math.max(1, Number(q.limit) || 200) : undefined })
  return lastReconciliation() ?? { at: null, total: 0, note: 'No reconciliation has run yet; the research tick runs one every cycle, or add ?run=1.' }
}

export function opsIntegrity(q: { run?: string | null; history?: string | null }, now = Date.now()) {
  if (q.run === '1' || q.run === 'true') return dataIntegrityReport(now)
  if (q.history === '1') return listIntegrityReports(30)
  return dailyIntegrity(now).report
}

export function opsCheckpoints(now = Date.now()) { return checkCheckpoints(now) }
export function opsCheckpointReviewed(body: { id?: unknown; reviewed?: unknown }) {
  const id = String(body.id ?? '')
  if (!id) throw new OpsApiError(400, 'id is required')
  const cp = markCheckpointReviewed(id, body.reviewed === undefined ? true : Boolean(body.reviewed))
  if (!cp) throw new OpsApiError(404, `no checkpoint ${id}`)
  return { checkpoint: cp, all: listCheckpoints() }
}

const SEVERITIES: OpsSeverity[] = ['INFO', 'WARN', 'ERROR', 'CRITICAL']
const COMPONENTS: OpsComponent[] = ['feed', 'store', 'watch', 'paper', 'observer', 'research', 'learning', 'knowledge', 'ops', 'server', 'security']
export function opsLogView(q: { severity?: string | null; component?: string | null; n?: string | null }, now = Date.now()) {
  const severity = q.severity && SEVERITIES.includes(q.severity as OpsSeverity) ? (q.severity as OpsSeverity) : undefined
  const component = q.component && COMPONENTS.includes(q.component as OpsComponent) ? (q.component as OpsComponent) : undefined
  const n = Math.min(500, Math.max(1, Number(q.n) || 100))
  return { entries: recentOps(n, { severity, component }), errors: errorCounts(now), suppressed: suppressedRepeats(), note: 'The last distinct lines written by this process; repeats within ten minutes are counted under "suppressed". The full record is <data dir>/ops.log (JSON lines, rotated).' }
}

export function opsRetries() { return { items: listRetries(), note: 'Failed learning writes waiting for a retry. Each is re-attempted by the research tick after its back-off; handlers are idempotent so a retry cannot duplicate a record.' } }
export async function opsRetriesRun(handlers: Record<string, RetryHandler>, now = Date.now()) { return runRetries(handlers, now, { force: true }) }
