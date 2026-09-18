/**
 * Startup recovery (Phase 21). The store is durable, so a crash or restart never
 * loses an open paper position — but the running process must re-adopt it,
 * re-check it against the candles it missed, and log that it did. This reconciles
 * local state on start: it finds the positions that were open when we stopped and
 * hands them back so the watch loop can manage them from the next candle.
 *
 * Pure over the store read; no network. The paper trader's own `managePositions`
 * then finishes any that should already have exited during the downtime.
 */

import { readPositions } from './paperTrader.ts'
import { store } from './store.ts'
import type { PaperPosition } from './paperTrader.ts'

export type RecoveryReport = {
  openRecovered: number
  pendingRecovered: number
  positions: PaperPosition[]
  summary: string
}

// ---------------------------------------------------------------
// The boot log
// ---------------------------------------------------------------

/**
 * HOW MANY TIMES THE SOAK CLOCK HAS BEEN RESET.
 *
 * The soak gate wants 168 hours of CONTINUOUS uptime and measures it as
 * `Date.now() - STARTED_AT`, so every restart silently sends it back to zero.
 * `SoakMetrics` had a `recoveries` field for exactly this — and no caller ever
 * supplied it, so it serialised out of `/api/validation` as `0` forever: a
 * number that looked measured and was a constant.
 *
 * Nothing in the repo counted restarts at all, which is also why the gate's own
 * config comment ("with recovery intact") described something unmeasured. This
 * is the missing record. It is deliberately tiny — the store is durable, so one
 * kv row survives exactly the event it is there to count.
 */
const BOOT_KEY = 'recovery:boots'

export type BootLog = {
  /** Process starts on record. 1 means it has never been restarted. */
  starts: number
  /** Starts that had to re-adopt an open or pending position — a real recovery. */
  recoveries: number
  firstStartAt: number
  lastStartAt: number
  /** The start before this one, so "how long did the last run last" is answerable. */
  previousStartAt: number | null
}

export function bootLog(): BootLog | null {
  const row = store().getJson<BootLog>(BOOT_KEY)
  return row && typeof row.starts === 'number' ? row : null
}

/**
 * Record that the process has started, and whether it had to recover anything.
 * Called once per start, before the watch loop begins.
 */
export function recordStart(recovered: boolean, now = Date.now()): BootLog {
  const prior = bootLog()
  const next: BootLog = {
    starts: (prior?.starts ?? 0) + 1,
    recoveries: (prior?.recoveries ?? 0) + (recovered ? 1 : 0),
    firstStartAt: prior?.firstStartAt ?? now,
    lastStartAt: now,
    previousStartAt: prior?.lastStartAt ?? null,
  }
  store().setJson(BOOT_KEY, next)
  return next
}

/**
 * Re-adopt the positions that were live when the process stopped. Called once on
 * startup, before the watch loop begins, so nothing is orphaned by a restart.
 */
export function recoverOpenPositions(): RecoveryReport {
  const { open } = readPositions()
  const pending = open.filter((p) => p.status === 'pending')
  const live = open.filter((p) => p.status === 'open')
  const summary = open.length
    ? `Recovered ${live.length} open and ${pending.length} pending paper position(s) from the store — the watch loop will manage them from the next candle.`
    : 'No open positions to recover — clean start.'
  return { openRecovered: live.length, pendingRecovered: pending.length, positions: open, summary }
}
