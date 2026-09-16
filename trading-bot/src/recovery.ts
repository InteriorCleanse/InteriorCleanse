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
import type { PaperPosition } from './paperTrader.ts'

export type RecoveryReport = {
  openRecovered: number
  pendingRecovered: number
  positions: PaperPosition[]
  summary: string
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
