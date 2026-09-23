/**
 * Persistence for passports. Kept deliberately simple — a JSON document per
 * passport plus an index — so the vault on disk is exactly what the UI shows,
 * and a passport read back later is the same object that was written. Grouping
 * for champion-challenger is by strategy family (the strategy id).
 */

import { store } from '../store.ts'
import type { BacktestReport } from '../backtest/report.ts'
import type { Genome } from '../factory/genome.ts'
import { appendResult, createPassport, passportId } from './passport.ts'
import type { Passport } from './passport.ts'
import { championOf, compareChallenger } from './promotion.ts'
import type { PromotionDecision } from './promotion.ts'

const INDEX_KEY = 'vault:index'
const key = (id: string) => `vault:passport:${id}`

/** Mint a passport from a backtested genome and persist it (idempotent by genome). */
export function mint(strategyId: string, genome: Genome, report: BacktestReport, opts: { origin?: string; family?: string; reason?: string } = {}): Passport {
  const existing = getPassport(passportId(strategyId, genome))
  if (existing) return existing // a passport is minted once; re-minting returns the original
  const p = createPassport(strategyId, genome, report, opts)
  savePassport(p)
  return p
}

export function savePassport(p: Passport): void {
  store().setJson(key(p.id), p)
  const index = store().getJson<string[]>(INDEX_KEY) ?? []
  if (!index.includes(p.id)) store().setJson(INDEX_KEY, [...index, p.id])
}

export function getPassport(id: string): Passport | null {
  return store().getJson<Passport>(key(id))
}

/** Every passport, newest first. */
export function listPassports(): Passport[] {
  const index = store().getJson<string[]>(INDEX_KEY) ?? []
  const out: Passport[] = []
  for (const id of index) { const p = getPassport(id); if (p) out.push(p) }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/** Passports for one strategy family. */
export function passportsFor(strategyId: string): Passport[] {
  return listPassports().filter((p) => p.strategyId === strategyId)
}

/** The current champion for a strategy family. */
export function champion(strategyId: string): Passport | null {
  return championOf(passportsFor(strategyId))
}

/** Would this challenger be promoted over its family's current champion? */
export function assessPromotion(challenger: Passport): PromotionDecision {
  const others = passportsFor(challenger.strategyId).filter((p) => p.id !== challenger.id)
  return compareChallenger(championOf(others), challenger)
}

/**
 * Record one closed paper trade against every passport of that strategy family,
 * so the vault's decay watch and champion-challenger see real paper results as
 * they arrive. A no-op for a strategy with no passport (e.g. the frozen session
 * model), which is exactly right — nothing to update. Returns how many were touched.
 */
export function recordPaperResult(strategyId: string | undefined, rMultiple: number, at: number): number {
  if (!strategyId) return 0
  let n = 0
  for (const p of passportsFor(strategyId)) {
    savePassport(appendResult(p, { stage: 'paper', at, trades: 1, totalR: rMultiple, avgR: rMultiple, rMultiples: [rMultiple] }))
    n++
  }
  return n
}

export function deletePassport(id: string): void {
  const index = store().getJson<string[]>(INDEX_KEY) ?? []
  store().setJson(INDEX_KEY, index.filter((x) => x !== id))
  // The document itself is left as a tombstone-free orphan; setJson has no delete, so overwrite with null-ish.
  store().setJson(key(id), null)
}
