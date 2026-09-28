/**
 * A member's sold prices: finished sales they found (Bring a Trailer results,
 * their own won lots, an auction's sold report) and added on the Import
 * screen. Kept per member in sold.json. They are comparables only: they sharpen
 * the estimate for the same make and model and never appear in the feed.
 */
import type { Listing } from './types.ts'
import { config } from '../config.ts'
import { readJson, userFile, writeJson } from './store.ts'

const FILE = 'sold.json'
const MAX = 1000
const DAY = 86_400_000

export function listSold(): Listing[] {
  const v = readJson<unknown>(userFile(FILE), [])
  return Array.isArray(v) ? (v as Listing[]).filter((l) => l && typeof l === 'object' && typeof l.soldUsd === 'number') : []
}

/** The sold prices recent enough to count in an estimate. */
export function recentSold(list: Listing[], now: number, maxAgeDays = config.scoring.soldMaxAgeDays): Listing[] {
  const oldest = now - maxAgeDays * DAY
  return list.filter((l) => l.soldAt !== undefined && l.soldAt >= oldest && l.soldAt <= now + DAY)
}

/** Add or refresh sold prices (same id replaces). Most recent sale first; past 1,000 the oldest drop off. */
export function saveSold(add: Listing[]): Listing[] {
  const byId = new Map(listSold().map((l) => [l.id, l]))
  for (const l of add) byId.set(l.id, l)
  const next = [...byId.values()].sort((a, b) => (b.soldAt ?? 0) - (a.soldAt ?? 0)).slice(0, MAX)
  writeJson(userFile(FILE), next)
  return next
}

export function removeSold(id: string): boolean {
  const all = listSold()
  const next = all.filter((l) => l.id !== id)
  if (next.length === all.length) return false
  writeJson(userFile(FILE), next)
  return true
}
