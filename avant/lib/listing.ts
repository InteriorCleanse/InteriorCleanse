/**
 * Host listings: the vehicle rules and the VIN check. Pure, so the same
 * rules run in the wizard, on the server later, and in the tests.
 */

import type { BodyType, Fuel, Transmission } from './types.ts'

export const MAX_VEHICLE_AGE_YEARS = 12
export const MAX_MILES = 130_000
export const MIN_RATE_CENTS = 2_000
export const MAX_RATE_CENTS = 100_000

export interface ListingDraft {
  vin: string
  year: number
  make: string
  model: string
  body: BodyType
  fuel: Fuel
  transmission: Transmission
  seats: number
  miles: number
  city: string
  neighborhood: string
  deliveryOffered: boolean
  deliveryFeeCents: number
  dailyRateCents: number
  weeklyDiscountPct: number
  instantBook: boolean
  noOpenRecalls: boolean
  insuredAndRegistered: boolean
}

export interface Listing extends ListingDraft {
  id: string
  status: 'draft' | 'submitted'
  updatedAt: string
}

// ── VIN ────────────────────────────────────────────────────────────────
// North American VINs: 17 characters, no I, O or Q, and position 9 is a
// check digit computed from the other 16 (49 CFR 565).

const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

export function normaliseVin(vin: string): string {
  return vin.toUpperCase().replace(/[\s-]/g, '')
}

export function vinCheckDigit(vin: string): string | null {
  const v = normaliseVin(vin)
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return null
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const ch = v[i]
    const value = /\d/.test(ch) ? Number(ch) : TRANSLIT[ch]
    sum += value * WEIGHTS[i]
  }
  const r = sum % 11
  return r === 10 ? 'X' : String(r)
}

export type VinCheck = 'empty' | 'format' | 'checksum' | 'ok'

export function checkVin(vin: string): VinCheck {
  const v = normaliseVin(vin)
  if (!v) return 'empty'
  const expected = vinCheckDigit(v)
  if (expected === null) return 'format'
  return v[8] === expected ? 'ok' : 'checksum'
}

// ── Eligibility and completeness ───────────────────────────────────────

export type ListingStep = 'car' | 'location' | 'price' | 'safety'

export interface ListingProblem {
  step: ListingStep
  field: keyof ListingDraft
  message: string
}

export function validateListing(d: ListingDraft, currentYear: number): ListingProblem[] {
  const out: ListingProblem[] = []
  const vin = checkVin(d.vin)
  if (vin === 'empty') out.push({ step: 'car', field: 'vin', message: 'Add the 17-character VIN from the dashboard or door frame.' })
  else if (vin === 'format') out.push({ step: 'car', field: 'vin', message: 'A VIN is 17 letters and numbers, never I, O or Q.' })
  else if (vin === 'checksum') out.push({ step: 'car', field: 'vin', message: 'That VIN doesn’t check out. One character is probably mistyped.' })
  if (!Number.isInteger(d.year) || d.year > currentYear + 1) out.push({ step: 'car', field: 'year', message: 'Check the model year.' })
  else if (d.year < currentYear - MAX_VEHICLE_AGE_YEARS) out.push({ step: 'car', field: 'year', message: `Cars up to ${MAX_VEHICLE_AGE_YEARS} years old can be listed.` })
  if (d.make.trim().length < 2) out.push({ step: 'car', field: 'make', message: 'Add the make.' })
  if (d.model.trim().length < 1) out.push({ step: 'car', field: 'model', message: 'Add the model.' })
  if (!Number.isInteger(d.seats) || d.seats < 2 || d.seats > 15) out.push({ step: 'car', field: 'seats', message: 'Seats must be between 2 and 15.' })
  if (!Number.isFinite(d.miles) || d.miles < 0) out.push({ step: 'car', field: 'miles', message: 'Add the current mileage.' })
  else if (d.miles >= MAX_MILES) out.push({ step: 'car', field: 'miles', message: `Cars under ${MAX_MILES.toLocaleString('en-US')} miles can be listed.` })
  if (!d.city) out.push({ step: 'location', field: 'city', message: 'Choose a city.' })
  if (d.neighborhood.trim().length < 2) out.push({ step: 'location', field: 'neighborhood', message: 'Add the neighbourhood guests will see.' })
  if (d.deliveryOffered && (d.deliveryFeeCents < 0 || d.deliveryFeeCents > 50_000)) out.push({ step: 'location', field: 'deliveryFeeCents', message: 'Delivery fee must be between $0 and $500.' })
  if (d.dailyRateCents < MIN_RATE_CENTS || d.dailyRateCents > MAX_RATE_CENTS) out.push({ step: 'price', field: 'dailyRateCents', message: 'Set a daily rate between $20 and $1,000.' })
  if (d.weeklyDiscountPct < 0 || d.weeklyDiscountPct > 50) out.push({ step: 'price', field: 'weeklyDiscountPct', message: 'Weekly discount is 0–50%.' })
  if (!d.noOpenRecalls) out.push({ step: 'safety', field: 'noOpenRecalls', message: 'Confirm there are no open safety recalls. Cars with open recalls can’t be shared.' })
  if (!d.insuredAndRegistered) out.push({ step: 'safety', field: 'insuredAndRegistered', message: 'Confirm the car is registered and insured.' })
  return out
}

export function problemsFor(step: ListingStep, problems: ListingProblem[]): ListingProblem[] {
  return problems.filter((p) => p.step === step)
}
