/**
 * AVANT domain model. Money is integer cents everywhere; dates are
 * `YYYY-MM-DD` and times `HH:MM` in the car's local zone.
 */

export type BodyType = 'sedan' | 'suv' | 'truck' | 'van' | 'convertible' | 'coupe' | 'hatchback' | 'wagon'
export type Fuel = 'gas' | 'hybrid' | 'electric'
export type Transmission = 'automatic' | 'manual'
/** Vehicle class by value. Drives age limits and the security deposit. */
export type ValueTier = 'everyday' | 'premium' | 'luxury' | 'exotic'

export type FeatureId =
  | 'apple-carplay'
  | 'android-auto'
  | 'bluetooth'
  | 'backup-camera'
  | 'awd'
  | 'child-seat'
  | 'bike-rack'
  | 'ski-rack'
  | 'heated-seats'
  | 'sunroof'
  | 'pet-friendly'
  | 'gps'
  | 'usb-charger'
  | 'blind-spot'
  | 'keyless'
  | 'toll-pass'
  | 'snow-tires'
  | 'third-row'
  | 'roof-box'
  | 'tow-hitch'

export type CoverageId = 'essential' | 'plus' | 'zero'
export type ExtraId = 'child-seat' | 'prepaid-refuel' | 'unlimited-miles' | 'cooler' | 'phone-mount'
export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'rating' | 'newest'

export interface Landmark {
  name: string
  lat: number
  lng: number
}

export interface City {
  slug: string
  name: string
  state: string
  lat: number
  lng: number
  bounds: [number, number, number, number]
  taxRate: number
  landmarks: Landmark[]
}

export interface Host {
  id: string
  name: string
  joined: string
  allStar: boolean
  rating: number
  trips: number
  responseMinutes: number
  bio: string
}

export interface Review {
  id: string
  author: string
  date: string
  rating: number
  text: string
}

export interface Car {
  id: string
  slug: string
  make: string
  model: string
  year: number
  trim: string | null
  body: BodyType
  fuel: Fuel
  transmission: Transmission
  color: { name: string; hex: string }
  seats: number
  doors: number
  efficiency: { mpg: number } | { rangeMiles: number }
  features: FeatureId[]
  dailyRateCents: number
  weeklyDiscountPct: number
  monthlyDiscountPct: number
  instantBook: boolean
  delivery: { offered: boolean; feeCents: number; radiusMiles: number }
  milesPerDay: number
  minDays: number
  maxDays: number
  city: string
  neighborhood: string
  lat: number
  lng: number
  hostId: string
  rating: number
  tripCount: number
  listedAt: string
  description: string
  guidelines: string[]
  /** Day offsets from "today" the car is booked; resolved on the client. */
  blockedOffsets: [number, number][]
  reviews: Review[]
  valueTier: ValueTier
  /** Illustrative photo for the body type (AI-generated, unbadged). */
  image: string
}

export interface CoveragePlan {
  id: CoverageId
  name: string
  /** The one number a guest needs: the most they pay if the car is damaged. */
  maxOutOfPocketCents: number
  pctOfTrip: number
  minPerDayCents: number
  /** Refundable hold placed at pickup, released after the trip. */
  depositCents: number
  liability: string
  oneLiner: string
  includes: string[]
  recommendedFor: string
}

export interface Extra {
  id: ExtraId
  name: string
  description: string
  perTripCents?: number
  perDayCents?: number
}

/** What we know about the driver. Never a name, DOB, licence number or photo. */
export interface DriverFacts {
  /** Whole years, derived once at verification and never stored as a date. */
  age: number | null
  /** Whole years the licence has been held. */
  licenceYears: number | null
  /** Licence expiry, `YYYY-MM`. Month precision is enough for eligibility. */
  licenceExpires: string | null
  licenceState: string | null
  /** A verified driving record with no major violations in three years. */
  cleanRecord: boolean
  verified: boolean
}

export interface QuoteInput {
  dailyRateCents: number
  days: number
  weeklyDiscountPct: number
  monthlyDiscountPct: number
  plan: CoveragePlan
  delivery: boolean
  deliveryFeeCents: number
  extras: Extra[]
  taxRate: number
  youngDriverFeeCents: number
}

export interface QuoteLine {
  id: string
  label: string
  cents: number
  note?: string
}

export interface Quote {
  days: number
  baseCents: number
  discountPct: number
  discountCents: number
  tripCents: number
  tripFeeCents: number
  protectionCents: number
  youngDriverCents: number
  deliveryCents: number
  extrasCents: number
  taxCents: number
  totalCents: number
  depositCents: number
  lines: QuoteLine[]
}

export interface SearchState {
  q: string
  city: string
  start: string
  end: string
  minCents: number | null
  maxCents: number | null
  bodies: BodyType[]
  fuels: Fuel[]
  transmission: Transmission | null
  minSeats: number | null
  features: FeatureId[]
  instantBook: boolean
  delivery: boolean
  sort: SortKey
}

export interface Trip {
  id: string
  carId: string
  start: string
  end: string
  startTime: string
  endTime: string
  plan: CoverageId
  delivery: boolean
  deliveryAddress: string
  extras: ExtraId[]
  quote: Quote
  status: 'booked' | 'cancelled' | 'completed'
  bookedAt: string
  paid: 'demo' | 'stripe'
  checkIn: { id: string; label: string; done: boolean }[]
}

export interface DateRange {
  start: string
  end: string
}
