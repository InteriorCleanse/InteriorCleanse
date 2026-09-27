/**
 * Starter mode — the rules that keep a beginner out of trouble.
 *
 * `starterCheck` looks at one listing and returns one plain-English sentence
 * for every rule the car breaks. An empty list means the car passes. The feed
 * hides blocked cars when starter mode is on and tells the member why.
 *
 * The rules themselves live in config.ts (`config.starter`) and members can
 * loosen them in Settings; pass the loosened rules in as `rules`.
 */
import type { Damage, Listing } from './types.ts'
import { config } from '../config.ts'
import { askingPrice } from './valuation.ts'
import { money } from './ui.ts'

export type StarterRules = typeof config.starter

/** How bad each damage level is, so they can be compared. 'unknown' is not ranked: it never blocks on its own. */
const DAMAGE_RANK: Record<Exclude<Damage, 'unknown'>, number> = { none: 0, minor: 1, moderate: 2, severe: 3 }

/** What each title status means, for someone who has never bought a car at auction. */
const TITLE_MEANING: Record<string, string> = {
  salvage: 'an insurer once declared this car a total loss',
  rebuilt: 'it was a salvage car that was repaired and re-inspected',
  flood: 'it has been under water, which ruins wiring and electronics',
  lemon: 'the maker bought it back for a fault it could not fix',
  'parts-only': 'it may not legally be put back on the road',
}

/** One sentence per starter rule the listing breaks. Empty array = passes. */
export function starterCheck(l: Listing, rules: StarterRules = config.starter): string[] {
  const blocks: string[] = []

  if (rules.cleanTitleOnly && l.titleStatus !== 'clean') {
    if (l.titleStatus === 'unknown') {
      blocks.push('Title status is not stated. Starter mode only shows cars with a clean title, so ask the seller or run the VIN before going further.')
    } else {
      const meaning = TITLE_MEANING[l.titleStatus] ?? 'it is not a clean title'
      blocks.push(`Title is ${l.titleStatus}, which means ${meaning}. Starter mode only shows cars with a clean title.`)
    }
  }

  if (l.damage !== 'unknown') {
    const cap = DAMAGE_RANK[rules.maxDamage]
    if (DAMAGE_RANK[l.damage] > cap) {
      const allowed = rules.maxDamage === 'none' ? 'no damage at all' : `${rules.maxDamage} damage at most`
      blocks.push(`Damage is described as ${l.damage}. Starter mode allows ${allowed}.`)
    }
  }

  if (rules.mustRunAndDrive) {
    if (l.runsAndDrives === false) blocks.push('Seller says it does not run and drive. Starter mode skips cars that need a tow and an unknown repair.')
    else if (l.runsAndDrives === undefined) blocks.push('Nobody says whether it runs and drives. Starter mode needs the seller to state it; ask them.')
  }

  const asking = askingPrice(l)
  if (asking !== undefined && asking > rules.maxPriceUsd) {
    blocks.push(`Price is ${money(asking)}, above the starter cap of ${money(rules.maxPriceUsd)}. Raise the cap in Settings if you mean to spend more.`)
  }

  if (l.mileage !== undefined && l.mileage > rules.maxMileage) {
    blocks.push(`Mileage is ${l.mileage.toLocaleString('en-US')}, above the starter cap of ${rules.maxMileage.toLocaleString('en-US')} miles. High-mileage cars need more repairs sooner.`)
  }

  if (l.year !== undefined && l.year < rules.minYear) {
    blocks.push(`Model year is ${l.year}, older than the starter floor of ${rules.minYear}. Older cars are harder to price and to fix without experience.`)
  }

  return blocks
}
