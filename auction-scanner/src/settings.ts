/**
 * Per-install settings — the starter rules, the sample-data switch, the
 * member's own additions to the demand list, where home is, and fee
 * overrides. Stored in settings.json in the data directory.
 *
 * Reads always merge the saved file over the defaults, so a key added in a
 * later version shows up without anyone editing a file. Writes validate every
 * field and throw a plain-English Error on a bad value, so the API can answer
 * 400 with the exact reason instead of quietly dropping what the person typed.
 * Unknown keys are ignored.
 */
import { config } from '../config.ts'
import { readJson, writeJson } from './store.ts'

const FILE = 'settings.json'

export type StarterRules = {
  cleanTitleOnly: boolean
  maxDamage: 'none' | 'minor' | 'moderate' | 'severe'
  mustRunAndDrive: boolean
  maxPriceUsd: number
  maxMileage: number
  minYear: number
}

export type DemandExtra = {
  make: string
  models: string[]
  tier: 'supercar' | 'enthusiast' | 'holds-value' | 'rental'
  why: string
}

export type Settings = {
  starter: StarterRules
  /** Show SAMPLE cars when no live source is connected. Every sample card says SAMPLE. */
  allowSample: boolean
  /** The member's own additions to the demand list, each with the reason it is there. */
  demandExtra: DemandExtra[]
  /** Two-letter US state, for distance and "near me". */
  homeState?: string
  homeZip?: string
  /** Buyer-fee percentage to use for a house, by house id, when the person has checked the real number. 0–30. */
  feeOverrides: Record<string, number>
}

const DAMAGE = new Set(['none', 'minor', 'moderate', 'severe'])
const TIERS = new Set(['supercar', 'enthusiast', 'holds-value', 'rental'])

export function defaultSettings(): Settings {
  return {
    starter: {
      cleanTitleOnly: config.starter.cleanTitleOnly,
      maxDamage: config.starter.maxDamage,
      mustRunAndDrive: config.starter.mustRunAndDrive,
      maxPriceUsd: config.starter.maxPriceUsd,
      maxMileage: config.starter.maxMileage,
      minYear: config.starter.minYear,
    },
    allowSample: true,
    demandExtra: [],
    feeOverrides: {},
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function bool(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`${name} must be true or false.`)
  return v
}

function num(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a number.`)
  if (v < min || v > max) throw new Error(`${name} must be between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`)
  return v
}

/** Check a partial starter-rules object. Only the keys present are checked and returned. */
function validateStarter(v: unknown): Partial<StarterRules> {
  if (!isRecord(v)) throw new Error('starter must be an object of starter rules.')
  const out: Partial<StarterRules> = {}
  if ('cleanTitleOnly' in v) out.cleanTitleOnly = bool(v.cleanTitleOnly, 'starter.cleanTitleOnly')
  if ('mustRunAndDrive' in v) out.mustRunAndDrive = bool(v.mustRunAndDrive, 'starter.mustRunAndDrive')
  if ('maxDamage' in v) {
    if (typeof v.maxDamage !== 'string' || !DAMAGE.has(v.maxDamage)) throw new Error('starter.maxDamage must be one of: none, minor, moderate, severe.')
    out.maxDamage = v.maxDamage as StarterRules['maxDamage']
  }
  if ('maxPriceUsd' in v) out.maxPriceUsd = Math.round(num(v.maxPriceUsd, 'starter.maxPriceUsd', 1, 5_000_000))
  if ('maxMileage' in v) out.maxMileage = Math.round(num(v.maxMileage, 'starter.maxMileage', 0, 500_000))
  if ('minYear' in v) out.minYear = Math.round(num(v.minYear, 'starter.minYear', 1950, 2050))
  return out
}

function validateDemandExtra(v: unknown): DemandExtra[] {
  if (!Array.isArray(v)) throw new Error('demandExtra must be a list.')
  return v.map((e, i) => {
    const at = `demandExtra[${i}]`
    if (!isRecord(e)) throw new Error(`${at} must be an object with make, models, tier and why.`)
    if (typeof e.make !== 'string' || !e.make.trim()) throw new Error(`${at}.make must be the make, for example "Toyota".`)
    if (!Array.isArray(e.models) || !e.models.every((m) => typeof m === 'string')) throw new Error(`${at}.models must be a list of model names (an empty list means every model).`)
    if (typeof e.tier !== 'string' || !TIERS.has(e.tier)) throw new Error(`${at}.tier must be one of: supercar, enthusiast, holds-value, rental.`)
    if (typeof e.why !== 'string' || !e.why.trim()) throw new Error(`${at}.why must say, in one sentence, why this car is on your list.`)
    return {
      make: e.make.trim().slice(0, 60),
      models: (e.models as string[]).map((m) => m.trim()).filter(Boolean).slice(0, 50),
      tier: e.tier as DemandExtra['tier'],
      why: e.why.trim().slice(0, 300),
    }
  })
}

function validateFeeOverrides(v: unknown): Record<string, number> {
  if (!isRecord(v)) throw new Error('feeOverrides must be an object of house id → fee percent.')
  const out: Record<string, number> = {}
  for (const [k, val] of Object.entries(v)) {
    const key = k.trim()
    if (!key) throw new Error('feeOverrides has an empty house id.')
    out[key] = num(val, `feeOverrides.${key}`, 0, 30)
  }
  return out
}

/**
 * Check a patch of settings. Every key present is validated; unknown keys are
 * dropped; a bad value throws a plain-English Error. `homeState` and `homeZip`
 * may be set to '' or null to clear them.
 */
function validatePatch(patch: unknown): { starter?: Partial<StarterRules>; rest: Partial<Omit<Settings, 'starter'>>; clear: Array<'homeState' | 'homeZip'> } {
  if (!isRecord(patch)) throw new Error('Settings must be sent as an object.')
  const rest: Partial<Omit<Settings, 'starter'>> = {}
  const clear: Array<'homeState' | 'homeZip'> = []
  let starter: Partial<StarterRules> | undefined

  if ('starter' in patch) starter = validateStarter(patch.starter)
  if ('allowSample' in patch) rest.allowSample = bool(patch.allowSample, 'allowSample')
  if ('demandExtra' in patch) rest.demandExtra = validateDemandExtra(patch.demandExtra)
  if ('feeOverrides' in patch) rest.feeOverrides = validateFeeOverrides(patch.feeOverrides)

  if ('homeState' in patch) {
    const v = patch.homeState
    if (v === '' || v === null || v === undefined) clear.push('homeState')
    else if (typeof v === 'string' && /^[A-Za-z]{2}$/.test(v.trim())) rest.homeState = v.trim().toUpperCase()
    else throw new Error('homeState must be a two-letter state code, for example TX.')
  }
  if ('homeZip' in patch) {
    const v = patch.homeZip
    if (v === '' || v === null || v === undefined) clear.push('homeZip')
    else if (typeof v === 'string' && /^\d{5}(-\d{4})?$/.test(v.trim())) rest.homeZip = v.trim()
    else throw new Error('homeZip must be a 5-digit US ZIP code, for example 75201.')
  }
  return { starter, rest, clear }
}

/** Merge saved values over the defaults. A saved value that fails validation is ignored, so a hand-edited file cannot break the app. */
function merge(base: Settings, saved: unknown): Settings {
  const out: Settings = { ...base, starter: { ...base.starter }, demandExtra: [...base.demandExtra], feeOverrides: { ...base.feeOverrides } }
  if (!isRecord(saved)) return out
  const apply = (fn: () => void): void => {
    try {
      fn()
    } catch {
      /* a bad saved value is ignored; the default stands */
    }
  }
  if (isRecord(saved.starter)) {
    for (const [k, v] of Object.entries(saved.starter)) {
      apply(() => Object.assign(out.starter, validateStarter({ [k]: v })))
    }
  }
  for (const key of ['allowSample', 'demandExtra', 'feeOverrides', 'homeState', 'homeZip'] as const) {
    if (!(key in saved)) continue
    apply(() => {
      const { rest, clear } = validatePatch({ [key]: saved[key] })
      Object.assign(out, rest)
      for (const c of clear) delete out[c]
    })
  }
  return out
}

/** The settings in force: the saved file merged over the defaults, so new keys always appear. */
export function getSettings(): Settings {
  return merge(defaultSettings(), readJson<unknown>(FILE, {}))
}

/**
 * Apply a partial update. Validates every field (types and ranges), ignores
 * unknown keys, saves, and returns the full settings now in force. Throws a
 * plain-English Error on a bad value and saves nothing in that case.
 */
export function updateSettings(patch: unknown): Settings {
  const { starter, rest, clear } = validatePatch(patch)
  const next = getSettings()
  if (starter) Object.assign(next.starter, starter)
  Object.assign(next, rest)
  for (const c of clear) delete next[c]
  writeJson(FILE, next)
  return next
}
