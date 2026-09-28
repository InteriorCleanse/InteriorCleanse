/**
 * SNIPER TARGETS — a saved hunt: the makes, models and years you want, the
 * most you will spend, and how picky to be. The engine (engine.ts) matches
 * cars to targets; the server runs it on a clock. Stored in targets.json.
 */
import { randomUUID } from 'node:crypto'
import { readJson, userFile, writeJson } from '../store.ts'

export type Target = {
  id: string
  name: string
  /** Empty = any make. Case-insensitive. */
  makes: string[]
  /** Empty = any model. Matched as a prefix of the listing's model, either way. */
  models: string[]
  yearMin?: number
  yearMax?: number
  /** The most you will pay for the car itself. The engine also checks the plan's max bid. */
  maxBudgetUsd: number
  maxMileage?: number
  /** Only US state codes; empty = anywhere. */
  states: string[]
  /** Minimum Steal score to count as a pick. */
  minScore: number
  /** Starter rules must pass (clean title, minor damage at most, runs and drives). */
  starterOnly: boolean
  /** When armed, the engine records a PAPER bid at the plan's max bid the moment a pick appears. */
  armed: boolean
  active: boolean
  createdAt: number
  updatedAt: number
}

const FILE = 'targets.json'

function clean(list: unknown, max = 20, upper = false): string[] {
  if (!Array.isArray(list)) return []
  return [...new Set(list.filter((x): x is string => typeof x === 'string').map((s) => (upper ? s.trim().toUpperCase() : s.trim())).filter(Boolean))].slice(0, max)
}

function numOr(v: unknown, fallback: number | undefined, min: number, max: number, name: string): number | undefined {
  if (v === undefined || v === null || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a number between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`)
  return n
}

export function listTargets(): Target[] {
  return readJson<Target[]>(userFile(FILE), [])
}

export function validateTarget(input: unknown, existing?: Target): Target {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const now = Date.now()
  const makes = clean(p.makes ?? existing?.makes)
  const models = clean(p.models ?? existing?.models)
  const yearMin = numOr(p.yearMin, existing?.yearMin, 1950, 2050, 'yearMin')
  const yearMax = numOr(p.yearMax, existing?.yearMax, 1950, 2050, 'yearMax')
  if (yearMin !== undefined && yearMax !== undefined && yearMin > yearMax) throw new Error('The first year must not be after the last year.')
  const maxBudgetUsd = numOr(p.maxBudgetUsd, existing?.maxBudgetUsd, 500, 5_000_000, 'maxBudgetUsd')
  if (maxBudgetUsd === undefined) throw new Error('Set the most you will spend (maxBudgetUsd).')
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 80) : existing?.name ?? [makes.join('/') || 'Any make', models.join('/') || 'any model', yearMin || yearMax ? `${yearMin ?? ''}–${yearMax ?? ''}` : ''].filter(Boolean).join(' ')
  return {
    id: existing?.id ?? randomUUID(),
    name,
    makes,
    models,
    yearMin,
    yearMax,
    maxBudgetUsd,
    maxMileage: numOr(p.maxMileage, existing?.maxMileage, 0, 500_000, 'maxMileage'),
    states: clean(p.states ?? existing?.states, 20, true).filter((s) => /^[A-Z]{2}$/.test(s)),
    minScore: numOr(p.minScore, existing?.minScore ?? 60, 0, 100, 'minScore') ?? 60,
    starterOnly: typeof p.starterOnly === 'boolean' ? p.starterOnly : existing?.starterOnly ?? true,
    armed: typeof p.armed === 'boolean' ? p.armed : existing?.armed ?? false,
    active: typeof p.active === 'boolean' ? p.active : existing?.active ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function saveTarget(input: unknown, id?: string): Target {
  const all = listTargets()
  const existing = id ? all.find((t) => t.id === id) : undefined
  if (id && !existing) throw new Error('No target with that id.')
  const t = validateTarget(input, existing)
  const next = existing ? all.map((x) => (x.id === t.id ? t : x)) : [...all, t]
  if (next.length > 50) throw new Error('That is enough targets for one account: 50. Remove one first.')
  writeJson(userFile(FILE), next)
  return t
}

export function removeTarget(id: string): boolean {
  const all = listTargets()
  const next = all.filter((t) => t.id !== id)
  if (next.length === all.length) return false
  writeJson(userFile(FILE), next)
  return true
}
