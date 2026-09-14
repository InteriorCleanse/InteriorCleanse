/**
 * Which mode the bot is running in.
 *
 * Today there is exactly one reachable mode: PAPER. The other names
 * exist so that every module that will one day care about the
 * difference (execution, risk, the dashboard badge) can ask one
 * function instead of inventing its own flag. Nothing here can move
 * the bot out of paper mode: the ladder below is declared, not climbed.
 *
 *   paper   — real market data, pretend money, records in local files
 *   testnet — (not reachable) real exchange API on a test venue
 *   shadow  — (not reachable) builds the exact order it would send, never sends
 *   live    — (not reachable) real orders, real money
 */

import { LIVE_TRADING_ENABLED } from '../config.ts'

export type Mode = 'paper' | 'testnet' | 'shadow' | 'live'

/** The order modes must be earned in. A later step is never reachable before the earlier ones. */
export const MODE_LADDER: readonly Mode[] = ['paper', 'testnet', 'shadow', 'live']

/** The mode the bot is in right now. Always 'paper' in this version. */
export function runtimeMode(): Mode {
  return 'paper'
}

/** True when nothing can reach an exchange with write intent. */
export function isPaperOnly(): boolean {
  return runtimeMode() === 'paper' && LIVE_TRADING_ENABLED === false
}

/** A one-line description for banners and the health endpoint. */
export function describeMode(): string {
  const m = runtimeMode()
  if (m === 'paper') return 'PAPER — real prices, pretend money, no exchange account, no orders sent.'
  return `${m.toUpperCase()} — not available in this version.`
}
