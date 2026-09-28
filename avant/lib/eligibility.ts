/**
 * Who may book which car, and what they pay for being young.
 *
 * These are AVANT's own rules, written to be explainable in one sentence
 * each. State law can override them; `STATE_RULES` records the ones we know
 * about and is the place to add more after legal review.
 */

import { CLEAN_RECORD_DISCOUNT_PCT, VALUE_TIERS, YOUNG_DRIVER_FEES } from './catalog.ts'
import type { DriverFacts, ValueTier } from './types.ts'

export interface StateRule {
  /** Youngest age a platform may refuse to rent an everyday car to. */
  mustAcceptFromAge?: number
  note: string
}

/**
 * New York and Michigan require rental companies to rent to drivers 18 and
 * up. Whether that reaches peer-to-peer platforms is a question for counsel;
 * AVANT follows it anyway, because 18 is already our minimum.
 */
export const STATE_RULES: Record<string, StateRule> = {
  NY: { mustAcceptFromAge: 18, note: 'New York requires renting to drivers 18+. Confirm P2P applicability with counsel.' },
  MI: { mustAcceptFromAge: 18, note: 'Michigan requires renting to drivers 18+. Confirm P2P applicability with counsel.' },
}

export const MIN_AGE = 18

export type Reason =
  | 'unverified'
  | 'under-18'
  | 'tier-age'
  | 'licence-new'
  | 'licence-expired'
  | 'licence-expires-during-trip'

export interface Eligibility {
  ok: boolean
  reasons: Reason[]
  messages: string[]
  youngDriverPerDayCents: number
  youngDriverCapCents: number
}

export function youngDriverFee(age: number | null, days: number, cleanRecord: boolean): number {
  if (age === null) return 0
  const band = YOUNG_DRIVER_FEES.find((b) => age >= b.minAge && age <= b.maxAge)
  if (!band) return 0
  const raw = Math.min(band.perDayCents * Math.max(1, days), band.capCents)
  return cleanRecord ? Math.round((raw * (100 - CLEAN_RECORD_DISCOUNT_PCT)) / 100) : raw
}

/** Minimum years licensed, by age and car class. */
export function minLicenceYears(age: number, tier: ValueTier): number {
  if (tier === 'exotic') return 5
  if (age < 21) return 1
  return 1
}

/**
 * @param tripEnd `YYYY-MM-DD`, used to check the licence outlasts the trip.
 * @param today   `YYYY-MM-DD`, injected so the rule is testable.
 */
export function checkEligibility(driver: DriverFacts, tier: ValueTier, tripEnd: string | null, today: string): Eligibility {
  const reasons: Reason[] = []
  const messages: string[] = []
  const age = driver.age

  if (!driver.verified || age === null) {
    reasons.push('unverified')
    messages.push('Verify your licence once (about two minutes) to book any car.')
  } else {
    if (age < MIN_AGE) {
      reasons.push('under-18')
      messages.push('Drivers must be 18 or older.')
    }
    const tierMin = VALUE_TIERS[tier].minAge
    if (age >= MIN_AGE && age < tierMin) {
      reasons.push('tier-age')
      messages.push(`${VALUE_TIERS[tier].label} cars are for drivers ${tierMin} and up.`)
    }
    const needYears = minLicenceYears(age, tier)
    if ((driver.licenceYears ?? 0) < needYears) {
      reasons.push('licence-new')
      messages.push(`This car needs a licence held for at least ${needYears} ${needYears === 1 ? 'year' : 'years'}.`)
    }
    if (driver.licenceExpires) {
      const thisMonth = today.slice(0, 7)
      if (driver.licenceExpires < thisMonth) {
        reasons.push('licence-expired')
        messages.push('Your licence has expired. Renew it, then verify again.')
      } else if (tripEnd && driver.licenceExpires < tripEnd.slice(0, 7)) {
        reasons.push('licence-expires-during-trip')
        messages.push('Your licence expires before this trip ends.')
      }
    }
  }

  const band = age === null ? undefined : YOUNG_DRIVER_FEES.find((b) => age >= b.minAge && age <= b.maxAge)
  const factor = driver.cleanRecord ? (100 - CLEAN_RECORD_DISCOUNT_PCT) / 100 : 1
  return {
    ok: reasons.length === 0,
    reasons,
    messages,
    youngDriverPerDayCents: band ? Math.round(band.perDayCents * factor) : 0,
    youngDriverCapCents: band ? Math.round(band.capCents * factor) : 0,
  }
}

/** Whole years between a birth date and a day, without storing either. */
export function ageOn(birthDate: string, day: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [y, m, d] = day.split('-').map(Number)
  let age = y - by
  if (m < bm || (m === bm && d < bd)) age -= 1
  return age
}
