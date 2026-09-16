/**
 * Back up the store (Phase 21). Copies the SQLite database to a timestamped file
 * under data/backups/, keeping the most recent N. Restorable: stop the bot, copy
 * a backup over data/mrcash.db, start again. Run: `node scripts/backup.ts`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, DB_PATH, store } from '../src/store.ts'
import * as ui from '../src/ui.ts'

const KEEP = Number(process.env.MRCASH_BACKUPS_KEEP ?? '14')

export function backupStore(): { file: string; bytes: number } | null {
  if (!existsSync(DB_PATH)) return null
  // A consistency check before we trust the copy.
  const integrity = store().integrity()
  if (integrity !== 'ok') throw new Error(`Refusing to back up: the store failed its integrity check (${integrity}).`)
  const dir = join(DATA_DIR, 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `mrcash-${stamp}.db`)
  copyFileSync(DB_PATH, file)
  // Prune old backups, newest kept.
  const backups = readdirSync(dir).filter((f) => f.endsWith('.db')).map((f) => join(dir, f)).sort()
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) { try { rmSync(old) } catch { /* ignore */ } }
  return { file, bytes: statSync(file).size }
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  ui.heading('MR. CASH — BACKUP')
  const r = backupStore()
  if (!r) console.log(ui.warn('  No store to back up yet.'))
  else console.log(ui.good(`  Backed up to ${r.file} (${(r.bytes / 1024).toFixed(0)} KB). Keeping the most recent ${KEEP}.`))
}
