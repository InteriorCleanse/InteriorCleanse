/**
 * The store: small JSON files in the data directory. Every write goes to a
 * temp file and is renamed into place, so a crash mid-write never leaves half
 * a file.
 *
 * Per-member data. A signed-in request runs inside `withUser(email, …)`, and
 * every personal file (watchlist, paper bids, targets, alerts, settings, the
 * garage) is resolved through `userFile(name)` to `users/<id>/<name>`, where
 * the id is a hash of the email. Outside a scope (the CLIs, most unit tests)
 * the same names resolve to the top of the data directory, as before.
 * Shared files (members, Stripe events) never go through `userFile`.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './env.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

export const DATA_DIR: string = resolve(env('GAVEL_DATA_DIR') || join(HERE, '..', 'data'))

const scope = new AsyncLocalStorage<string>()

/** A stable, filesystem-safe id for a member. The email itself never appears in a path. */
export function userId(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex').slice(0, 20)
}

/** Run `fn` with every personal file resolved into this member's folder. */
export function withUser<T>(email: string, fn: () => T): T {
  return scope.run(email.trim().toLowerCase(), fn)
}

/** The member whose scope we are in, or undefined outside one. */
export function currentUser(): string | undefined {
  return scope.getStore()
}

/** Resolve a personal file name into the current member's folder. */
export function userFile(name: string): string {
  const who = scope.getStore()
  return who ? `users/${userId(who)}/${name}` : name
}

/** Every member folder that exists, with the email it belongs to. */
export function listUserScopes(): Array<{ email: string; id: string }> {
  const dir = join(DATA_DIR, 'users')
  if (!existsSync(dir)) return []
  const out: Array<{ email: string; id: string }> = []
  for (const id of readdirSync(dir)) {
    try {
      const who = JSON.parse(readFileSync(join(dir, id, 'who.json'), 'utf8')) as { email?: unknown }
      if (typeof who.email === 'string') out.push({ email: who.email, id })
    } catch {
      /* a folder without who.json is not a member folder */
    }
  }
  return out
}

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
  const dir = dirname(p)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const who = scope.getStore()
  if (who && name.startsWith('users/')) {
    const tag = join(dir, 'who.json')
    if (!existsSync(tag)) writeFileSync(tag, JSON.stringify({ email: who }))
  }
  const tmp = `${p}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, p)
}

/** Personal files a member owns. Used by backup and by the one-time move of old top-level files. */
export const PERSONAL_FILES = ['watchlist.json', 'paper-bids.json', 'targets.json', 'alerts.json', 'settings.json', 'garage.json', 'imports.json'] as const

/**
 * Before per-member data existed, the owner's files sat at the top of the
 * data directory. Move them into the owner's folder once, if that folder has
 * none of its own yet. Returns the names moved.
 */
export function adoptLegacyFiles(ownerEmail: string): string[] {
  const moved: string[] = []
  withUser(ownerEmail, () => {
    for (const name of PERSONAL_FILES) {
      const from = join(DATA_DIR, name)
      const to = join(DATA_DIR, userFile(name))
      if (!existsSync(from) || existsSync(to)) continue
      writeJson(userFile(name), readJson<unknown>(name, null))
      renameSync(from, `${from}.moved-to-owner`)
      moved.push(name)
    }
  })
  return moved
}
