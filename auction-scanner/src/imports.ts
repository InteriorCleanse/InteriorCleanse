/**
 * A member's imported lots: cars they brought in by paste, CSV or the
 * one-click button. Kept per member in imports.json, scored and planned like
 * any other listing, and compared against live comparables.
 */
import type { Listing } from './types.ts'
import { readJson, userFile, writeJson } from './store.ts'

const FILE = 'imports.json'
const MAX = 500

export function listImports(): Listing[] {
  const v = readJson<unknown>(userFile(FILE), [])
  return Array.isArray(v) ? (v as Listing[]) : []
}

/** Add or refresh lots (same id replaces). Newest first; the oldest drop off past 500. */
export function saveImports(add: Listing[]): Listing[] {
  const byId = new Map(listImports().map((l) => [l.id, l]))
  for (const l of add) byId.set(l.id, l)
  const next = [...byId.values()].sort((a, b) => b.fetchedAt - a.fetchedAt).slice(0, MAX)
  writeJson(userFile(FILE), next)
  return next
}

export function removeImport(id: string): boolean {
  const all = listImports()
  const next = all.filter((l) => l.id !== id)
  if (next.length === all.length) return false
  writeJson(userFile(FILE), next)
  return true
}
