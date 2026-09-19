/**
 * RETRYABLE WRITES — a failed learning write is visible and retried, never
 * silently dropped and never duplicated.
 *
 * When a downstream write fails (a post-mortem after a paper close, a lesson
 * item from the digest) the failure is recorded here under a key that names
 * the thing being written. The research tick's retry step re-attempts each
 * due item through a handler for its kind. Every handler is idempotent by
 * construction — the observer, the vault and the digest all address their
 * records by content — so a retry that turns out to have half-succeeded the
 * first time writes nothing twice.
 *
 * Back-off: 15 min × 2^attempts, capped at six hours. Items are kept until
 * they succeed or an operator clears them; the count is on the Operations
 * screen and in the health API.
 */

import { store } from '../store.ts'
import { ops } from './log.ts'

export type RetryItem = {
  key: string
  kind: string
  payload: unknown
  attempts: number
  firstFailedAt: number
  lastFailedAt: number
  lastError: string
  nextAttemptAt: number
}

export type RetryHandler = (payload: unknown, now: number) => string | Promise<string>
export type RetryRun = { at: number; due: number; succeeded: string[]; failed: Array<{ key: string; error: string }>; skipped: string[]; note: string }

const PREFIX = 'ops:retry:'
const BASE_MS = 15 * 60_000
const CAP_MS = 6 * 3_600_000

function backoff(attempts: number): number { return Math.min(CAP_MS, BASE_MS * 2 ** Math.max(0, attempts - 1)) }

/** Record (or re-record) a failed write. Returns the item as stored. */
export function recordFailedWrite(kind: string, key: string, payload: unknown, error: unknown, now = Date.now()): RetryItem {
  const message = String((error as Error)?.message ?? error)
  const prior = store().getJson<RetryItem>(PREFIX + key)
  const attempts = (prior?.attempts ?? 0) + 1
  const item: RetryItem = { key, kind, payload, attempts, firstFailedAt: prior?.firstFailedAt ?? now, lastFailedAt: now, lastError: message, nextAttemptAt: now + backoff(attempts) }
  try { store().setJson(PREFIX + key, item) } catch (err) {
    // The store itself is failing: the ops log is the only place left to say so.
    ops.critical('store', 'retry-record-failed', `could not record the failed write ${key}: ${String((err as Error)?.message ?? err)}`)
  }
  ops.error('knowledge', 'write-failed', `${kind} ${key}: ${message} (attempt ${attempts}, retry after ${new Date(item.nextAttemptAt).toISOString()})`)
  return item
}

/** Try a write now; on failure record it for retry and return the error. Never throws. */
export function attemptWrite<T>(kind: string, key: string, payload: unknown, fn: () => T, now = Date.now()): { ok: true; value: T } | { ok: false; error: string; item: RetryItem } {
  try { return { ok: true, value: fn() } } catch (err) { const item = recordFailedWrite(kind, key, payload, err, now); return { ok: false, error: item.lastError, item } }
}

export function listRetries(): RetryItem[] {
  return store().keysWithPrefix(PREFIX).map((k) => store().getJson<RetryItem>(k)).filter((r): r is RetryItem => Boolean(r)).sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)
}

export function clearRetry(key: string): boolean {
  if (!store().getJson<RetryItem>(PREFIX + key)) return false
  store().deleteJson(PREFIX + key)
  return true
}

/** Re-attempt every due item through the handler for its kind. Items without a handler are left where they are and named. */
export async function runRetries(handlers: Record<string, RetryHandler>, now = Date.now(), opts: { max?: number; force?: boolean } = {}): Promise<RetryRun> {
  const items = listRetries().filter((r) => opts.force || r.nextAttemptAt <= now).slice(0, opts.max ?? 25)
  const run: RetryRun = { at: now, due: items.length, succeeded: [], failed: [], skipped: [], note: '' }
  for (const it of items) {
    const h = handlers[it.kind]
    if (!h) { run.skipped.push(it.key); continue }
    try {
      const detail = await h(it.payload, now)
      clearRetry(it.key)
      run.succeeded.push(it.key)
      ops.info('knowledge', 'retry-ok', `${it.kind} ${it.key} written on attempt ${it.attempts + 1}: ${detail}`)
    } catch (err) {
      const again = recordFailedWrite(it.kind, it.key, it.payload, err, now)
      run.failed.push({ key: it.key, error: again.lastError })
    }
  }
  const pending = listRetries().length
  run.note = items.length === 0 ? (pending ? `${pending} failed write(s) waiting for their back-off.` : 'No failed write to retry.') : `${run.succeeded.length} retried write(s) succeeded, ${run.failed.length} failed again, ${run.skipped.length} without a handler; ${pending} pending.`
  return run
}
