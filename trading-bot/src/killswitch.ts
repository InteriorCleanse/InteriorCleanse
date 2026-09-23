/**
 * The kill switch — the big red button.
 *
 * When the file data/STOP exists, the bot opens no new positions of any
 * kind (paper today; every future mode too). Existing paper positions
 * are still managed to their stop or target, because abandoning an
 * open position is worse than closing it in an orderly way.
 *
 * It is a file on purpose: you can create it from the app, from the
 * terminal (`npm run stop`), or by hand with any text editor, and it
 * survives restarts. `npm run resume` or the app removes it.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, ensureDataDir } from './memory.ts'

export const STOP_PATH = join(DATA_DIR, 'STOP')

export type StopState = { stopped: false } | { stopped: true; since: string; reason: string }

export function stopState(): StopState {
  if (!existsSync(STOP_PATH)) return { stopped: false }
  try {
    const parsed = JSON.parse(readFileSync(STOP_PATH, 'utf8')) as { since?: string; reason?: string }
    return { stopped: true, since: parsed.since ?? 'unknown', reason: parsed.reason ?? 'no reason given' }
  } catch {
    return { stopped: true, since: 'unknown', reason: 'STOP file present' }
  }
}

export function isStopped(): boolean {
  return stopState().stopped
}

/** Engage the kill switch. Idempotent. */
export function stop(reason = 'stopped by you'): StopState {
  ensureDataDir()
  const state = { since: new Date().toISOString(), reason: reason.slice(0, 200) }
  writeFileSync(STOP_PATH, JSON.stringify(state, null, 2) + '\n')
  return { stopped: true, ...state }
}

/** Release the kill switch. Idempotent. */
export function resume(): StopState {
  if (existsSync(STOP_PATH)) unlinkSync(STOP_PATH)
  return { stopped: false }
}

/** The one question every entry path asks before opening anything. */
export function entriesAllowed(): { ok: true } | { ok: false; reason: string } {
  const s = stopState()
  if (s.stopped) return { ok: false, reason: `Kill switch is on since ${s.since} (${s.reason}). No new positions until you run \`npm run resume\` or press Resume in the app.` }
  return { ok: true }
}
