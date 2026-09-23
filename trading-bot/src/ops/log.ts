/**
 * THE OPS LOG — one operational record for the 24/7 process.
 *
 * Every important operational event carries: timestamp, component, event,
 * severity (INFO / WARN / ERROR / CRITICAL), a correlation id, and where
 * relevant the symbol, the strategy and a result. It rides on the existing
 * structured logger (`src/log.ts`: JSON lines, size-based rotation, never
 * throws) and adds two things the loop needs:
 *
 *   - suppression of repeats: the same component + event + message within
 *     `repeatWindowMs` is counted, not re-written, and the count is flushed
 *     with the next distinct line ("… (repeated 40×)");
 *   - error counters per component, in memory and mirrored to the kv store,
 *     so the health API and the alerts can say how many errors each layer
 *     produced since start and in the last hour.
 *
 * A correlation id ties the lines of one cycle or one research tick together.
 * `withCorrelation(id, fn)` sets it for the duration of `fn`; anything logged
 * inside carries it.
 */

import { DATA_DIR } from '../store.ts'
import { store } from '../store.ts'
import { createLogger } from '../log.ts'
import type { Logger } from '../log.ts'

export type OpsSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
export type OpsComponent = 'feed' | 'store' | 'watch' | 'paper' | 'observer' | 'research' | 'learning' | 'knowledge' | 'ops' | 'server' | 'security'

export type OpsEntry = {
  t: number
  component: OpsComponent
  event: string
  severity: OpsSeverity
  cid: string | null
  message: string
  symbol?: string
  strategy?: string
  result?: string
  fields?: Record<string, unknown>
}

export type ErrorCounts = { total: number; lastHour: number; byComponent: Record<string, number>; lastError: OpsEntry | null; lastCritical: OpsEntry | null }

const COUNTS_KEY = 'ops:errors'
const REPEAT_WINDOW_MS = 10 * 60_000
const RING = 500

let logger: Logger | null = null
let currentCid: string | null = null
let cidSeq = 0
const recent: OpsEntry[] = []
const repeats = new Map<string, { count: number; firstAt: number; lastAt: number }>()
const errorTimes: number[] = []
let counts: ErrorCounts = { total: 0, lastHour: 0, byComponent: {}, lastError: null, lastCritical: null }
let loaded = false

function loadCounts(): void {
  if (loaded) return
  loaded = true
  try {
    const saved = store().getJson<ErrorCounts>(COUNTS_KEY)
    if (saved && typeof saved.total === 'number') counts = { ...saved, lastHour: 0 }
  } catch { /* the counter is best-effort */ }
}

function persistCounts(): void {
  try { store().setJson(COUNTS_KEY, counts) } catch { /* never let the counter break the loop */ }
}

function getLogger(): Logger {
  if (!logger) logger = createLogger({ dir: DATA_DIR, file: 'ops.log', level: 'info', console: process.env.MRCASH_OPS_CONSOLE === '1' })
  return logger
}

/** For tests: swap the sink and clear the in-memory state. */
export function resetOpsLog(opts: { logger?: Logger | null } = {}): void {
  logger = opts.logger ?? null
  currentCid = null
  recent.length = 0
  repeats.clear()
  errorTimes.length = 0
  counts = { total: 0, lastHour: 0, byComponent: {}, lastError: null, lastCritical: null }
  loaded = false
}

/** A fresh correlation id: a prefix for the kind of work, a time, a sequence. */
export function newCorrelationId(prefix: 'cycle' | 'tick' | 'req' | 'boot' | 'hb' = 'cycle', now = Date.now()): string {
  cidSeq = (cidSeq + 1) % 100000
  return `${prefix}-${now.toString(36)}-${cidSeq.toString(36)}`
}

export function currentCorrelationId(): string | null { return currentCid }

/** Run `fn` with a correlation id set; nested calls keep the outer id. */
export function withCorrelation<T>(cid: string, fn: () => T): T {
  const prev = currentCid
  currentCid = prev ?? cid
  try { return fn() } finally { currentCid = prev }
}
export async function withCorrelationAsync<T>(cid: string, fn: () => Promise<T>): Promise<T> {
  const prev = currentCid
  currentCid = prev ?? cid
  try { return await fn() } finally { currentCid = prev }
}

function prune(now: number): void {
  while (errorTimes.length && now - errorTimes[0] > 3_600_000) errorTimes.shift()
  counts.lastHour = errorTimes.length
}

/** Write one operational line. Repeats within the window are counted, not written. */
export function opsLog(severity: OpsSeverity, component: OpsComponent, event: string, message: string, extra: { symbol?: string; strategy?: string; result?: string; cid?: string | null; now?: number; fields?: Record<string, unknown> } = {}): OpsEntry {
  loadCounts()
  const now = extra.now ?? Date.now()
  const entry: OpsEntry = { t: now, component, event, severity, cid: extra.cid ?? currentCid, message, ...(extra.symbol ? { symbol: extra.symbol } : {}), ...(extra.strategy ? { strategy: extra.strategy } : {}), ...(extra.result ? { result: extra.result } : {}), ...(extra.fields ? { fields: extra.fields } : {}) }
  const key = `${component}|${event}|${severity}|${message}`
  const rep = repeats.get(key)
  const isRepeat = rep !== undefined && now - rep.lastAt < REPEAT_WINDOW_MS
  if (severity === 'ERROR' || severity === 'CRITICAL') {
    counts.total++
    counts.byComponent[component] = (counts.byComponent[component] ?? 0) + 1
    errorTimes.push(now)
    prune(now)
    counts.lastError = entry
    if (severity === 'CRITICAL') counts.lastCritical = entry
    persistCounts()
  }
  if (isRepeat) { rep.count++; rep.lastAt = now; return entry }
  // A distinct line: flush any repeat count that was accumulating for this key.
  const suffix = rep && rep.count > 1 ? ` (repeated ${rep.count}× since ${new Date(rep.firstAt).toISOString()})` : ''
  repeats.set(key, { count: 1, firstAt: now, lastAt: now })
  if (repeats.size > 2000) { const oldest = [...repeats.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt).slice(0, 1000); for (const [k] of oldest) repeats.delete(k) }
  recent.push(entry)
  if (recent.length > RING) recent.shift()
  const line = `${component}.${event}: ${message}${suffix}`
  const fields = { component, event, severity, cid: entry.cid, ...(entry.symbol ? { symbol: entry.symbol } : {}), ...(entry.strategy ? { strategy: entry.strategy } : {}), ...(entry.result ? { result: entry.result } : {}), ...(entry.fields ?? {}) }
  const lg = getLogger()
  if (severity === 'INFO') lg.info(line, fields)
  else if (severity === 'WARN') lg.warn(line, fields)
  else lg.error(line, { ...fields, critical: severity === 'CRITICAL' })
  return entry
}

export const ops = {
  info: (c: OpsComponent, e: string, m: string, x?: Parameters<typeof opsLog>[4]) => opsLog('INFO', c, e, m, x),
  warn: (c: OpsComponent, e: string, m: string, x?: Parameters<typeof opsLog>[4]) => opsLog('WARN', c, e, m, x),
  error: (c: OpsComponent, e: string, m: string, x?: Parameters<typeof opsLog>[4]) => opsLog('ERROR', c, e, m, x),
  critical: (c: OpsComponent, e: string, m: string, x?: Parameters<typeof opsLog>[4]) => opsLog('CRITICAL', c, e, m, x),
}

/** Error counters since the counter was last reset (they survive restarts in the kv store) and in the last hour. */
export function errorCounts(now = Date.now()): ErrorCounts {
  loadCounts()
  prune(now)
  return { ...counts, byComponent: { ...counts.byComponent } }
}

/** The last `n` distinct entries written in this process, newest last. */
export function recentOps(n = 100, filter: { severity?: OpsSeverity; component?: OpsComponent } = {}): OpsEntry[] {
  return recent.filter((e) => (!filter.severity || e.severity === filter.severity) && (!filter.component || e.component === filter.component)).slice(-n)
}

/** How many times each suppressed line repeated, for the health screen. */
export function suppressedRepeats(): Array<{ key: string; count: number; firstAt: number; lastAt: number }> {
  return [...repeats.entries()].filter(([, r]) => r.count > 1).map(([key, r]) => ({ key, ...r })).sort((a, b) => b.count - a.count).slice(0, 50)
}
