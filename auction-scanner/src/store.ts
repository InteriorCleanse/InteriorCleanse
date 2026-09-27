/**
 * The store: small JSON files in the data directory. Watchlist, paper bids,
 * members, settings. Every write goes to a temp file and is renamed into
 * place, so a crash mid-write never leaves half a file.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './env.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

export const DATA_DIR: string = resolve(env('GAVEL_DATA_DIR') || join(HERE, '..', 'data'))

export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function readJson<T>(name: string, fallback: T): T {
  const p = join(DATA_DIR, name)
  if (!existsSync(p)) return fallback
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJson(name: string, value: unknown): void {
  ensureDataDir()
  const p = join(DATA_DIR, name)
  const tmp = `${p}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, p)
}
