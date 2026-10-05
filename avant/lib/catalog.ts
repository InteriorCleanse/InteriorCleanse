/**
 * The fixed vocabulary of AVANT: body types, features, coverage plans,
 * extras, fees and age rules. Data, not code paths.
 *
 * COVERAGE NUMBERS ARE PLACEHOLDERS until an insurance partner signs them.
 * They are shaped the way a carrier program is usually shaped (a percentage
 * of the trip, a cap on what the guest pays, a liability limit), and
 * `COVERAGE_TERMS_FINAL` keeps the UI honest about that. See
 * docs/INSURANCE_PLAYBOOK.md.
 */

import type { BodyType, CoveragePlan, CoverageId, Extra, ExtraId, FeatureId, Fuel, Transmission, ValueTier } from './types.ts'

export const COVERAGE_TERMS_FINAL = false

/**
 * Airport pickups and drop-offs. Colorado's car-sharing act (C.R.S.
 * 6-1-1214) needs an agreement with the airport first, and most states have
 * similar rules. Off until the owner has one; then list the airports.
 */
export const AIRPORT_HANDOFFS = false

export const BODY_TYPES: { id: BodyType; label: string; blurb: string }[] = [
  { id: 'suv', label: 'SUV', blurb: 'Room for people and their bags' },
  { id: 'sedan', label: 'Sedan', blurb: 'Quiet, efficient, easy to park' },
  { id: 'coupe', label: 'Coupe', blurb: 'Two doors, more character' },
  { id: 'convertible', label: 'Convertible', blurb: 'Coast road, top down' },
  { id: 'truck', label: 'Truck', blurb: 'For the move or the trailhead' },
  { id: 'van', label: 'Van', blurb: 'Seven or more, in comfort' },
  { id: 'hatchback', label: 'Hatchback', blurb: 'Small outside, clever inside' },
  { id: 'wagon', label: 'Wagon', blurb: 'The long-weekend car' },
]

export const FUELS: { id: Fuel; label: string }[] = [
  { id: 'electric', label: 'Electric' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'gas', label: 'Gas' },
]

export const TRANSMISSIONS: { id: Transmission; label: string }[] = [
  { id: 'automatic', label: 'Automatic' },
  { id: 'manual', label: 'Manual' },
]

export const FEATURES: Record<FeatureId, string> = {
  'apple-carplay': 'Apple CarPlay',
  'android-auto': 'Android Auto',
  bluetooth: 'Bluetooth',
  'backup-camera': 'Backup camera',
  awd: 'All-wheel drive',
  'child-seat': 'Child seat',
  'bike-rack': 'Bike rack',
  'ski-rack': 'Ski rack',
  'heated-seats': 'Heated seats',
  sunroof: 'Sunroof',
  'pet-friendly': 'Pet friendly',
  gps: 'Built-in GPS',
  'usb-charger': 'USB charger',
  'blind-spot': 'Blind-spot warning',
  keyless: 'Keyless entry',
  'toll-pass': 'Toll pass',
  'snow-tires': 'Snow tires',
  'third-row': 'Third row',
  'roof-box': 'Roof box',
  'tow-hitch': 'Tow hitch',
}

export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[]

export const FILTERABLE_FEATURES: FeatureId[] = [
  'apple-carplay',
  'awd',
  'child-seat',
  'pet-friendly',
  'bike-rack',
  'ski-rack',
  'heated-seats',
  'third-row',
  'tow-hitch',
]

export const VALUE_TIERS: Record<ValueTier, { label: string; minAge: number; blurb: string }> = {
  everyday: { label: 'Everyday', minAge: 18, blurb: 'Most cars. Open to every verified driver 18 and up.' },
  premium: { label: 'Premium', minAge: 21, blurb: 'Nicer trims and larger SUVs. Drivers 21 and up.' },
  luxury: { label: 'Luxury', minAge: 25, blurb: 'High-value cars. Drivers 25 and up.' },
  exotic: { label: 'Exotic', minAge: 25, blurb: 'Supercars and rare cars. Drivers 25 and up with 5 years licensed.' },
}

/** Daily rate at or above which a car moves into the next tier. */
export function tierForRate(dailyRateCents: number): ValueTier {
  if (dailyRateCents >= 25_000) return 'exotic'
  if (dailyRateCents >= 15_000) return 'luxury'
  if (dailyRateCents >= 9_000) return 'premium'
  return 'everyday'
}

/**
 * Coverage, in plain English. A guest picks one number: the most they could
 * pay if something happens. Everything else follows from that choice.
 */
export const COVERAGE_PLANS: CoveragePlan[] = [
  {
    id: 'zero',
    name: 'Zero',
    maxOutOfPocketCents: 0,
    pctOfTrip: 60,
    minPerDayCents: 2_500,
    depositCents: 0,
    liability: 'Third-party liability included, primary during the trip',
    oneLiner: 'Pay nothing if the car is damaged.',
    includes: ['$0 damage responsibility', 'No deposit', '24/7 roadside assistance', 'Tyres, glass and towing', 'Loss-of-use waived'],
    recommendedFor: 'First trips, long trips, unfamiliar roads.',
  },
  {
    id: 'plus',
    name: 'Plus',
    maxOutOfPocketCents: 50_000,
    pctOfTrip: 35,
    minPerDayCents: 1_500,
    depositCents: 25_000,
    liability: 'Third-party liability included, primary during the trip',
    oneLiner: 'Pay at most $500 if the car is damaged.',
    includes: ['$500 damage responsibility, max', '$250 refundable deposit', '24/7 roadside assistance', 'Tyres, glass and towing'],
    recommendedFor: 'Most trips. A modest cap and a small hold.',
  },
  {
    id: 'essential',
    name: 'Essential',
    maxOutOfPocketCents: 250_000,
    pctOfTrip: 15,
    minPerDayCents: 900,
    depositCents: 50_000,
    liability: 'Third-party liability included, primary during the trip',
    oneLiner: 'Lowest price. Pay at most $2,500 if the car is damaged.',
    includes: ['$2,500 damage responsibility, max', '$500 refundable deposit', 'Roadside help by phone'],
    recommendedFor: 'Experienced drivers on short, local trips.',
  },
]

export const DEFAULT_COVERAGE: CoverageId = 'plus'

export function getPlan(id: CoverageId): CoveragePlan {
  const plan = COVERAGE_PLANS.find((p) => p.id === id)
  if (!plan) throw new Error(`Unknown coverage plan: ${id}`)
  return plan
}

export const EXTRAS: Extra[] = [
  { id: 'child-seat', name: 'Child seat', description: 'Installed and checked before pickup.', perDayCents: 900 },
  { id: 'prepaid-refuel', name: 'Prepaid refuel', description: 'Return at any level. No refuel fee.', perTripCents: 4_500 },
  { id: 'unlimited-miles', name: 'Unlimited miles', description: 'Replaces the daily allowance.', perDayCents: 1_500 },
  { id: 'cooler', name: 'Cooler', description: 'A 40-quart cooler for the drive out.', perTripCents: 1_500 },
  { id: 'phone-mount', name: 'Phone mount', description: 'Vent-clip mount, fits any phone.', perTripCents: 500 },
]

export function getExtra(id: ExtraId): Extra {
  const extra = EXTRAS.find((e) => e.id === id)
  if (!extra) throw new Error(`Unknown extra: ${id}`)
  return extra
}

/** One flat, visible trip fee. No dynamic surcharge hiding in the total. */
export const TRIP_FEE_PCT = 12

/** The share of the trip price a host keeps. */
export const HOST_SHARE_PCT = 80

/**
 * Young driver fee. Lower than the marketplace norm, capped per trip, and
 * halved for a verified clean driving record. See lib/eligibility.ts.
 */
export const YOUNG_DRIVER_FEES = [
  { minAge: 18, maxAge: 20, perDayCents: 2_900, capCents: 19_900 },
  { minAge: 21, maxAge: 24, perDayCents: 1_900, capCents: 12_900 },
] as const

export const CLEAN_RECORD_DISCOUNT_PCT = 50

export const FREE_CANCEL_HOURS = 24

export const CHECK_IN_ITEMS: { id: string; label: string }[] = [
  { id: 'licence', label: 'Licence in hand, matching your verified profile' },
  { id: 'photos-out', label: 'Photograph all four sides, timestamped in the app' },
  { id: 'photos-in', label: 'Photograph the interior, odometer and fuel or charge' },
  { id: 'walkaround', label: 'Note any existing marks with the host or in the app' },
  { id: 'keys', label: 'Confirm keys and any extras' },
]
