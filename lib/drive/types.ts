/**
 * Domain model for Drive, the peer-to-peer car sharing section at /drive/.
 *
 * Everything here is plain data. Money is always integer cents so that no
 * quote ever depends on floating point; dates are `YYYY-MM-DD` strings and
 * times are `HH:MM`, both in the host's local zone, which keeps the model
 * free of timezone arithmetic until a real backend needs it.
 */

export type BodyType =
  | 'sedan'
  | 'suv'
  | 'truck'
  | 'van'
  | 'convertible'
  | 'coupe'
  | 'hatchback'
  | 'wagon'

export type Fuel = 'gas' | 'hybrid' | 'electric'

export type Transmission = 'automatic' | 'manual'

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

export type ProtectionPlanId = 'basic' | 'standard' | 'complete'

export type ExtraId = 'child-seat' | 'prepaid-refuel' | 'unlimited-miles' | 'cooler' | 'phone-mount'

export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'rating' | 'newest'

export type TripStatus = 'booked' | 'cancelled' | 'completed'

export type ListingStatus = 'draft' | 'listed'

export type Theme = 'system' | 'light' | 'dark'

export type Units = 'mi' | 'km'

export interface City {
  slug: string
  name: string
  state: string
  /** Centre of the schematic map. */
  lat: number
  lng: number
  /** Bounding box the map projects into: [south, west, north, east]. */
  bounds: [number, number, number, number]
  /** Combined sales and rental tax applied to the taxable part of a quote. */
  taxRate: number
  /** Landmarks drawn on the schematic map so the pins have some orientation. */
  landmarks: Landmark[]
}

export interface Landmark {
  name: string
  lat: number
  lng: number
}

export interface Host {
  id: string
  name: string
  /** ISO date the host joined. */
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

export interface Delivery {
  offered: boolean
  /** Flat delivery fee in cents. */
  feeCents: number
  radiusMiles: number
}

export interface DateRange {
  start: string
  end: string
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
  /** Miles per gallon for gas and hybrid, EPA range for electric. */
  efficiency: { mpg: number } | { rangeMiles: number }
  features: FeatureId[]
  dailyRateCents: number
  weeklyDiscountPct: number
  monthlyDiscountPct: number
  instantBook: boolean
  delivery: Delivery
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
  /** ISO date the listing went live; drives the "newest" sort. */
  listedAt: string
  description: string
  guidelines: string[]
  /**
   * Inclusive day offsets from "today" the car cannot be booked, so the
   * sample fleet never ages into being fully available. `blockedRanges()`
   * turns them into dates on the client, where "today" is known.
   */
  blockedOffsets: [number, number][]
  reviews: Review[]
}

export interface ProtectionPlan {
  id: ProtectionPlanId
  name: string
  /** Percentage of the discounted trip price. */
  pctOfTrip: number
  deductibleCents: number
  summary: string
  includes: string[]
}

export interface Extra {
  id: ExtraId
  name: string
  description: string
  /** Either a flat fee per trip or a fee per day, never both. */
  perTripCents?: number
  perDayCents?: number
}

export interface QuoteInput {
  dailyRateCents: number
  days: number
  weeklyDiscountPct: number
  monthlyDiscountPct: number
  plan: ProtectionPlan
  delivery: boolean
  deliveryFeeCents: number
  extras: Extra[]
  taxRate: number
}

export interface QuoteLine {
  id: string
  label: string
  cents: number
  /** Shown under the label so a fee never needs a footnote. */
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
  deliveryCents: number
  extrasCents: number
  taxCents: number
  totalCents: number
  lines: QuoteLine[]
}

export interface CheckInItem {
  id: string
  label: string
  done: boolean
}

export interface Trip {
  id: string
  carId: string
  start: string
  end: string
  startTime: string
  endTime: string
  plan: ProtectionPlanId
  delivery: boolean
  deliveryAddress: string
  extras: ExtraId[]
  driverName: string
  quote: Quote
  status: TripStatus
  bookedAt: string
  checkIn: CheckInItem[]
}

export interface Listing {
  id: string
  year: number
  make: string
  model: string
  body: BodyType
  fuel: Fuel
  transmission: Transmission
  seats: number
  city: string
  neighborhood: string
  dailyRateCents: number
  weeklyDiscountPct: number
  monthlyDiscountPct: number
  instantBook: boolean
  deliveryOffered: boolean
  deliveryFeeCents: number
  milesPerDay: number
  minDays: number
  features: FeatureId[]
  guidelines: string
  status: ListingStatus
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  from: 'you' | 'host'
  sentAt: string
  text: string
}

export interface Thread {
  id: string
  hostId: string
  carId: string
  tripId: string | null
  messages: Message[]
  /** ISO timestamp of the last message, for ordering. */
  updatedAt: string
}

export interface Preferences {
  name: string
  theme: Theme
  units: Units
  homeCity: string
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
