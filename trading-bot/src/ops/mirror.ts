/**
 * FILE MIRRORS — the CSV and JSONL copies kept next to the store so the owner
 * can open them in a spreadsheet (ledger.csv, equity.csv, learnings.md) or
 * tail them (events.jsonl, orderflow.csv, tv-alerts.csv).
 *
 * The store is the record; these files are copies. So a copy that cannot be
 * written must never interrupt the record. On Windows, a CSV open in Excel is
 * locked (EBUSY), and a full disk refuses every write: before this module
 * either one threw out of the middle of a paper close, after the position was
 * saved but before its equity row, its lesson and its journal entry.
 *
 * `mirrorAppend` never throws. A failure is counted, written to the ops log
 * once per file per hour, and reported by `mirrorHealth()`. Busy log mirrors
 * can be given `maxBytes`: the file rolls to `<file>.1` (one generation) when
 * it passes that size, so a 24/7 process cannot grow them without bound.
 * Record exports are never rolled.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, statfsSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { ops } from './log.ts'

export type MirrorOptions = {
  /** Written first when the file does not exist yet. */
  header?: string
  /** Roll to `<file>.1` once the file passes this size. Omit for record exports. */
  maxBytes?: number
}

type Failure = { file: string; code: string; message: string; at: number }
const state = { failures: 0, rolled: 0, last: null as Failure | null }
const warnedAt = new Map<string, number>()

export function mirrorAppend(path: string, text: string, opts: MirrorOptions = {}): boolean {
  try {
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    if (opts.maxBytes && existsSync(path) && statSync(path).size >= opts.maxBytes) {
      renameSync(path, `${path}.1`) // replaces the previous generation
      state.rolled++
    }
    if (opts.header !== undefined && !existsSync(path)) writeFileSync(path, opts.header)
    appendFileSync(path, text)
    return true
  } catch (err) {
    return failed(path, err)
  }
}

/** Replaces a whole mirror file (positions.json). Same rules: never throws. */
export function mirrorWrite(path: string, text: string): boolean {
  try {
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, text)
    return true
  } catch (err) {
    return failed(path, err)
  }
}

function failed(path: string, err: unknown): false {
  const e = err as NodeJS.ErrnoException
  const now = Date.now()
  const file = basename(path)
  state.failures++
  state.last = { file, code: e?.code ?? 'ERROR', message: String(e?.message ?? err), at: now }
  if (now - (warnedAt.get(file) ?? 0) >= 3_600_000) {
    warnedAt.set(file, now)
    const hint = e?.code === 'EBUSY' || e?.code === 'EPERM' ? ' Is it open in another program, such as Excel? The store still has the record.' : e?.code === 'ENOSPC' ? ' The disk is full.' : ''
    try { ops.warn('store', 'mirror-write-failed', `Could not write ${file} (${state.last.code}).${hint}`) } catch { /* the ops log is best-effort too */ }
  }
  return false
}

export function mirrorHealth(): { failures: number; rolled: number; last: Failure | null } {
  return { failures: state.failures, rolled: state.rolled, last: state.last }
}

/** A soft health check: a mirror failed in the last hour. The record itself is unaffected. */
export function mirrorCheck(h = mirrorHealth(), now = Date.now()): { name: string; ok: boolean; detail: string } {
  const recent = h.last && now - h.last.at < 3_600_000
  return { name: 'mirrors', ok: !recent, detail: recent && h.last ? `${h.last.file}: ${h.last.code} (${h.failures} failed write${h.failures === 1 ? '' : 's'} since start; the store has the record)` : `ok${h.rolled ? `, ${h.rolled} rolled` : ''}` }
}

/** Free space where the record lives. Under 1 GB is a warning: a full disk stops the store. */
export const DISK_WARN_BYTES = 1_000_000_000
export function diskCheck(dir: string, statfs: (d: string) => { bavail: number | bigint; bsize: number | bigint } = statfsSync): { name: string; ok: boolean; detail: string } {
  try {
    const s = statfs(dir)
    const free = Number(s.bavail) * Number(s.bsize)
    const gb = (free / 1e9).toFixed(1)
    return { name: 'disk', ok: free >= DISK_WARN_BYTES, detail: free >= DISK_WARN_BYTES ? `${gb} GB free` : `only ${gb} GB free: free some space before the store runs out` }
  } catch {
    return { name: 'disk', ok: true, detail: 'free space unknown on this system' }
  }
}

/** For tests. */
export function resetMirrorHealth(): void {
  state.failures = 0; state.rolled = 0; state.last = null; warnedAt.clear()
}
