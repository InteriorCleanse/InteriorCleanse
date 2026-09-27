/**
 * Fixed vocabulary for Drive: body types, features, protection plans and
 * extras. These are data, not code paths, so a new feature is one line here
 * and shows up in filters, cards and the listing wizard at once.
 */

import type { BodyType, Extra, ExtraId, FeatureId, Fuel, ProtectionPlan, ProtectionPlanId, Transmission } from './types.ts'

export const BODY_TYPES: { id: BodyType; label: string; blurb: string }[] = [
  { id: 'sedan', label: 'Sedan', blurb: 'Four doors, quiet and efficient' },
  { id: 'suv', label: 'SUV', blurb: 'Room for people and their bags' },
  { id: 'truck', label: 'Truck', blurb: 'For the move and the hardware run' },
  { id: 'van', label: 'Van', blurb: 'Seven or more, in comfort' },
  { id: 'convertible', label: 'Convertible', blurb: 'Coast road, top down' },
  { id: 'coupe', label: 'Coupe', blurb: 'Two doors, more character' },
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

/** The features worth a filter chip; the rest are shown on the car only. */
export const FILTERABLE_FEATURES: FeatureId[] = [
  'apple-carplay',
  'android-auto',
  'awd',
  'child-seat',
  'pet-friendly',
  'bike-rack',
  'ski-rack',
  'heated-seats',
  'third-row',
  'tow-hitch',
]

/**
 * Protection plans. The percentage applies to the trip price after any
 * length discount, which is how the marketplace this recreates prices them;
 * the deductible is what the guest pays first on a damage claim.
 */
export const PROTECTION_PLANS: ProtectionPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    pctOfTrip: 18,
    deductibleCents: 300_000,
    summary: 'Lowest cost. You cover the first $3,000 of any damage.',
    includes: ['State-minimum liability', '$3,000 damage deductible', 'Roadside help by phone'],
  },
  {
    id: 'standard',
    name: 'Standard',
    pctOfTrip: 40,
    deductibleCents: 50_000,
    summary: 'The usual choice. A $500 deductible and 24/7 roadside assistance.',
    includes: ['$750,000 third-party liability', '$500 damage deductible', '24/7 roadside assistance', 'Windshield and tyre cover'],
  },
  {
    id: 'complete',
    name: 'Complete',
    pctOfTrip: 75,
    deductibleCents: 0,
    summary: 'Nothing to pay if something happens. Best for long or unfamiliar trips.',
    includes: ['$750,000 third-party liability', 'No deductible', '24/7 roadside assistance', 'Windshield and tyre cover', 'Loss-of-use waived'],
  },
]

export function getPlan(id: ProtectionPlanId): ProtectionPlan {
  const plan = PROTECTION_PLANS.find((p) => p.id === id)
  if (!plan) throw new Error(`Unknown protection plan: ${id}`)
  return plan
}

export const EXTRAS: Extra[] = [
  { id: 'child-seat', name: 'Child seat', description: 'Forward-facing, installed before pickup.', perDayCents: 1000 },
  { id: 'prepaid-refuel', name: 'Prepaid refuel', description: 'Return it at any level; no refuel fee.', perTripCents: 4500 },
  { id: 'unlimited-miles', name: 'Unlimited miles', description: 'Replaces the daily mileage allowance.', perDayCents: 1500 },
  { id: 'cooler', name: 'Cooler', description: 'A 40-quart cooler for the drive out.', perTripCents: 1500 },
  { id: 'phone-mount', name: 'Phone mount', description: 'Vent-clip mount, fits any phone.', perTripCents: 500 },
]

export function getExtra(id: ExtraId): Extra {
  const extra = EXTRAS.find((e) => e.id === id)
  if (!extra) throw new Error(`Unknown extra: ${id}`)
  return extra
}

/** Marketplace trip fee: a flat share of the discounted trip price. */
export const TRIP_FEE_PCT = 10

/** The check-in checklist every trip starts with. */
export const CHECK_IN_ITEMS: { id: string; label: string }[] = [
  { id: 'licence', label: 'Driver’s licence in hand' },
  { id: 'exterior', label: 'Photograph all four sides of the car' },
  { id: 'interior', label: 'Photograph the interior and the odometer' },
  { id: 'fuel', label: 'Note the fuel or charge level' },
  { id: 'keys', label: 'Confirm keys and any extras with the host' },
]
