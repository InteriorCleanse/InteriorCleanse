/**
 * SINGLE-PROCESS SAFETY — one paper engine, one watch loop, one research
 * scheduler, one writer per data directory.
 *
 * A lock file (`<data dir>/mrcash.lock`) holds the owning process id, its
 * start time and a heartbeat it refreshes every `refreshMs`. A second process
 * that finds a live lock (owner pid alive AND heartbeat fresh) refuses to
 * start and says who owns the directory. A lock whose owner is dead or whose
 * heartbeat is older than `staleAfterMs` is taken over — a crash must not
 * lock the operator out forever.
 *
 * This is a cooperative lock over a file; it protects two copies of Mr. Cash
 * from each other, which is the case that actually happens (two terminals,
 * a stuck `npm start` and a fresh one). It is not a distributed lock.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { DATA_DIR, ensureDataDir } from '../store.ts'

export type LockInfo = { pid: number; host: string; startedAt: number; heartbeatAt: number; role: 'app' | 'watch' | 'test' }
export type LockResult = { ok: true; path: string; info: LockInfo; tookOver: LockInfo | null } | { ok: false; path: string; owner: LockInfo; reason: string }

export const LOCK_STALE_MS = 2 * 60_000
export const LOCK_REFRESH_MS = 30_000

export function lockPath(dir = DATA_DIR): string { return join(dir, 'mrcash.lock') }

export function readLock(dir = DATA_DIR): LockInfo | null {
  const p = lockPath(dir)
  if (!existsSync(p)) return null
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<LockInfo>
    if (typeof raw.pid !== 'number' || typeof raw.heartbeatAt !== 'number') return null
    return { pid: raw.pid, host: String(raw.host ?? ''), startedAt: Number(raw.startedAt ?? raw.heartbeatAt), heartbeatAt: raw.heartbeatAt, role: (raw.role as LockInfo['role']) ?? 'app' }
  } catch { return null }
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (err) { return (err as NodeJS.ErrnoException).code === 'EPERM' }
}

/** Is this lock held by a process that is still running here? Pure over its inputs. */
export function lockIsLive(info: LockInfo, opts: { now?: number; isAlive?: (pid: number) => boolean; host?: string } = {}): boolean {
  const now = opts.now ?? Date.now()
  const sameHost = (opts.host ?? hostname()) === info.host
  const fresh = now - info.heartbeatAt < LOCK_STALE_MS
  // On another host we cannot ask the kernel; the heartbeat decides.
  if (!sameHost) return fresh
  return (opts.isAlive ?? processAlive)(info.pid) && fresh
}

/**
 * Acquire the lock for this process, or refuse. `force` takes over regardless
 * (for an operator who has already killed the other process by hand).
 */
export function acquireLock(opts: { dir?: string; pid?: number; role?: LockInfo['role']; now?: number; isAlive?: (pid: number) => boolean; host?: string; force?: boolean } = {}): LockResult {
  const dir = opts.dir ?? DATA_DIR
  const now = opts.now ?? Date.now()
  const pid = opts.pid ?? process.pid
  const host = opts.host ?? hostname()
  const path = lockPath(dir)
  const existing = readLock(dir)
  let tookOver: LockInfo | null = null
  if (existing && existing.pid !== pid) {
    if (!opts.force && lockIsLive(existing, { now, isAlive: opts.isAlive, host })) {
      return { ok: false, path, owner: existing, reason: `${dir} is already owned by Mr. Cash pid ${existing.pid} on ${existing.host} (started ${new Date(existing.startedAt).toISOString()}, heartbeat ${Math.round((now - existing.heartbeatAt) / 1000)}s ago). One process per data directory: stop it first, or start this one with a different MRCASH_DATA_DIR.` }
    }
    tookOver = existing
  }
  const info: LockInfo = { pid, host, startedAt: existing && existing.pid === pid ? existing.startedAt : now, heartbeatAt: now, role: opts.role ?? 'app' }
  if (dir === DATA_DIR) ensureDataDir()
  writeFileSync(path, JSON.stringify(info))
  return { ok: true, path, info, tookOver }
}

/** Refresh the heartbeat. Returns false when the lock is no longer ours (another process took it over). */
export function refreshLock(opts: { dir?: string; pid?: number; now?: number } = {}): boolean {
  const dir = opts.dir ?? DATA_DIR
  const pid = opts.pid ?? process.pid
  const now = opts.now ?? Date.now()
  const existing = readLock(dir)
  if (!existing || existing.pid !== pid) return false
  writeFileSync(lockPath(dir), JSON.stringify({ ...existing, heartbeatAt: now }))
  return true
}

export function releaseLock(opts: { dir?: string; pid?: number } = {}): boolean {
  const dir = opts.dir ?? DATA_DIR
  const pid = opts.pid ?? process.pid
  const existing = readLock(dir)
  if (!existing || existing.pid !== pid) return false
  try { unlinkSync(lockPath(dir)) } catch { return false }
  return true
}

/**
 * Hold the lock for the life of the process: acquire, refresh on a timer,
 * release on exit. Returns the result; on refusal the caller decides
 * (the app exits with a message).
 */
export function holdLock(opts: { role?: LockInfo['role']; refreshMs?: number; log?: (line: string) => void; force?: boolean } = {}): LockResult & { stop?: () => void } {
  const r = acquireLock({ role: opts.role, force: opts.force })
  if (!r.ok) return r
  const timer = setInterval(() => {
    if (!refreshLock()) opts.log?.('lock: the data directory lock is no longer ours — another process took it over; this process should stop.')
  }, opts.refreshMs ?? LOCK_REFRESH_MS)
  timer.unref()
  const stop = () => { clearInterval(timer); releaseLock() }
  process.once('exit', () => { try { releaseLock() } catch { /* exiting */ } })
  if (r.tookOver) opts.log?.(`lock: took over a stale lock from pid ${r.tookOver.pid} (heartbeat ${new Date(r.tookOver.heartbeatAt).toISOString()}).`)
  return { ...r, stop }
}
