/**
 * Host listings: the vehicle rules and the VIN check. Pure, so the same
 * rules run in the wizard, on the server later, and in the tests.
 */

import type { BodyType, FeatureId, Fuel, Transmission } from './types.ts'

export const MAX_VEHICLE_AGE_YEARS = 12
export const MAX_MILES = 130_000
export const MIN_RATE_CENTS = 2_000
export const MAX_RATE_CENTS = 100_000

/** Paint colours offered in the wizard, with a swatch for the drawing. */
export const COLORS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#1d1e20' },
  { name: 'White', hex: '#efefec' },
  { name: 'Silver', hex: '#c4c7cc' },
  { name: 'Gray', hex: '#6a6d73' },
  { name: 'Blue', hex: '#2d4a7a' },
  { name: 'Red', hex: '#9e2a2b' },
  { name: 'Green', hex: '#2f5d3a' },
  { name: 'Beige', hex: '#cdbb9b' },
  { name: 'Brown', hex: '#6b4a33' },
  { name: 'Yellow', hex: '#e1b321' },
  { name: 'Orange', hex: '#d06a2c' },
]

export const DEFAULT_RULES = ['No smoking of any kind.', 'Return it as clean as you found it.', 'Return with the same fuel or charge level.']

/** The angles every listing needs, in the order guests see them. */
export const PHOTO_ANGLES = [
  { id: 'front', label: 'Front three-quarter', hint: 'Stand at a front corner so the front and one side show. This is the cover photo.' },
  { id: 'rear', label: 'Rear three-quarter', hint: 'The opposite back corner.' },
  { id: 'driver', label: 'Driver side', hint: 'Straight on, the whole car in frame.' },
  { id: 'passenger', label: 'Passenger side', hint: 'Straight on, the whole car in frame.' },
  { id: 'dash', label: 'Front seats and dash', hint: 'From the open driver door.' },
  { id: 'rear-seats', label: 'Back seats or cargo', hint: 'Whatever guests will use most.' },
] as const

export type PhotoAngle = (typeof PHOTO_ANGLES)[number]['id']

/** Shorter edge, in pixels, below which a photo looks soft on a listing. */
export const MIN_PHOTO_EDGE = 720

/** A photo the host took of the car. The image itself is stored separately. */
export interface ListingPhoto {
  id: string
  angle: PhotoAngle
  sha256: string
  width: number
  height: number
  bytes: number
  addedAt: string
}

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
  photos: ListingPhoto[]
  color: string
  description: string
  features: FeatureId[]
  rules: string[]
  /** Combined mpg, or miles of range for an electric car. */
  efficiency: number
  monthlyDiscountPct: number
  milesPerDay: number
  /** A personal hello from the host, shown to guests once a trip is confirmed. */
  welcome?: string
  /** Where and how to collect the car; shown only to confirmed guests. */
  pickup?: string
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

export type ListingStep = 'car' | 'photos' | 'details' | 'location' | 'price' | 'safety'

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
  if (!COLORS.some((c) => c.name === d.color)) out.push({ step: 'car', field: 'color', message: 'Choose the colour.' })
  if (!Number.isFinite(d.efficiency) || d.efficiency <= 0 || d.efficiency > 600)
    out.push({ step: 'car', field: 'efficiency', message: d.fuel === 'electric' ? 'Add the range in miles.' : 'Add the combined mpg.' })
  if (!Number.isFinite(d.miles) || d.miles < 0) out.push({ step: 'car', field: 'miles', message: 'Add the current mileage.' })
  else if (d.miles >= MAX_MILES) out.push({ step: 'car', field: 'miles', message: `Cars under ${MAX_MILES.toLocaleString('en-US')} miles can be listed.` })
  const photos = d.photos ?? []
  const missing = PHOTO_ANGLES.filter((a) => !photos.some((p) => p.angle === a.id))
  if (missing.length) out.push({ step: 'photos', field: 'photos', message: `Add your own photo of the ${missing.map((a) => a.label.toLowerCase()).join(', ')}.` })
  const soft = photos.filter((p) => Math.min(p.width, p.height) < MIN_PHOTO_EDGE)
  if (soft.length) out.push({ step: 'photos', field: 'photos', message: `Retake ${soft.length === 1 ? 'one photo' : `${soft.length} photos`}: each needs to be at least ${MIN_PHOTO_EDGE}px on its shorter side.` })
  const words = d.description.trim().split(/\s+/).filter(Boolean).length
  if (words < 15) out.push({ step: 'details', field: 'description', message: 'Write a few sentences about your car: at least 15 words.' })
  else if (d.description.length > 1500) out.push({ step: 'details', field: 'description', message: 'Keep the description under 1,500 characters.' })
  if (d.rules.some((r) => r.length > 140)) out.push({ step: 'details', field: 'rules', message: 'Keep each rule under 140 characters.' })
  if ((d.welcome?.length ?? 0) > 600) out.push({ step: 'details', field: 'welcome', message: 'Keep the welcome note under 600 characters.' })
  if ((d.pickup?.length ?? 0) > 600) out.push({ step: 'details', field: 'pickup', message: 'Keep the pickup instructions under 600 characters.' })
  if (!d.city) out.push({ step: 'location', field: 'city', message: 'Choose a city.' })
  if (d.neighborhood.trim().length < 2) out.push({ step: 'location', field: 'neighborhood', message: 'Add the neighbourhood guests will see.' })
  if (d.deliveryOffered && (d.deliveryFeeCents < 0 || d.deliveryFeeCents > 50_000)) out.push({ step: 'location', field: 'deliveryFeeCents', message: 'Delivery fee must be between $0 and $500.' })
  if (d.dailyRateCents < MIN_RATE_CENTS || d.dailyRateCents > MAX_RATE_CENTS) out.push({ step: 'price', field: 'dailyRateCents', message: 'Set a daily rate between $20 and $1,000.' })
  if (d.monthlyDiscountPct < 0 || d.monthlyDiscountPct > 60) out.push({ step: 'price', field: 'monthlyDiscountPct', message: 'Monthly discount is 0–60%.' })
  if (d.milesPerDay < 100 || d.milesPerDay > 1000) out.push({ step: 'price', field: 'milesPerDay', message: 'Included miles are 100–1,000 a day.' })
  if (d.weeklyDiscountPct < 0 || d.weeklyDiscountPct > 50) out.push({ step: 'price', field: 'weeklyDiscountPct', message: 'Weekly discount is 0–50%.' })
  if (!d.noOpenRecalls) out.push({ step: 'safety', field: 'noOpenRecalls', message: 'Confirm there are no open safety recalls. Cars with open recalls can’t be shared.' })
  if (!d.insuredAndRegistered) out.push({ step: 'safety', field: 'insuredAndRegistered', message: 'Confirm the car is registered and insured.' })
  return out
}

export function problemsFor(step: ListingStep, problems: ListingProblem[]): ListingProblem[] {
  return problems.filter((p) => p.step === step)
}
