/**
 * The shapes every part of Gavel agrees on.
 *
 * A Listing is one car at one auction, normalised so the feed, the score and
 * the bid plan never care which site it came from. Every field a site did not
 * give is left undefined — Gavel never fills a blank with a guess.
 */

export type TitleStatus = 'clean' | 'salvage' | 'rebuilt' | 'flood' | 'lemon' | 'parts-only' | 'unknown'
export type Damage = 'none' | 'minor' | 'moderate' | 'severe' | 'unknown'
export type SaleType = 'auction' | 'buy-now' | 'auction-or-buy-now'
/** Where a listing's data came from. Shown on every card. */
export type DataKind = 'LIVE' | 'SAMPLE'

export type Listing = {
  /** Stable id: `${source}:${externalId}`. */
  id: string
  source: string
  externalId: string
  url: string
  title: string
  year?: number
  make?: string
  model?: string
  trim?: string
  vin?: string
  mileage?: number
  titleStatus: TitleStatus
  damage: Damage
  /** True when the seller says it runs and drives; false when they say it does not; undefined when nobody says. */
  runsAndDrives?: boolean
  hasKeys?: boolean
  bodyStyle?: string
  transmission?: string
  drivetrain?: string
  fuel?: string
  exteriorColor?: string
  location?: { city?: string; state?: string; country?: string; postalCode?: string }
  saleType: SaleType
  currentBidUsd?: number
  buyNowUsd?: number
  /** The site's own reserve / estimate, when it publishes one. */
  siteEstimateUsd?: number
  endsAt?: number
  bidCount?: number
  sellerType?: 'dealer' | 'private' | 'insurance' | 'fleet' | 'unknown'
  photos: string[]
  description?: string
  kind: DataKind
  fetchedAt: number
}

export type SourceCapabilities = {
  search: boolean
  /** Bids can be placed through an API. No connected source has this yet; the flag exists so the UI can never pretend. */
  bid: boolean
}

export type SearchQuery = {
  text?: string
  make?: string
  minYear?: number
  maxPriceUsd?: number
  maxMileage?: number
  limit?: number
}

export type SourceStatus = {
  id: string
  name: string
  kind: 'api' | 'directory' | 'sample'
  connected: boolean
  reason: string
  capabilities: SourceCapabilities
}

export type Estimate =
  | { ok: true; valueUsd: number; low: number; high: number; comps: number; method: string }
  | { ok: false; comps: number; reason: string }

export type Score = {
  /** 0–100. 100 is a car priced far under its comparables with nothing wrong. */
  total: number
  /** The plain-English grade. */
  grade: 'steal' | 'good deal' | 'fair' | 'pass' | 'unpriced'
  discount?: number
  reasons: string[]
  redFlags: string[]
  /** Passes the starter rules. */
  starterOk: boolean
  starterBlocks: string[]
}

export type BidPlan = {
  resaleUsd: number
  buyerFeeUsd: number
  transportUsd: number
  repairsUsd: number
  reserveUsd: number
  marginUsd: number
  /** The most you should bid. Never bid above this number. */
  maxBidUsd: number
  /** Where the current price sits against the max bid. */
  headroomUsd?: number
  lines: string[]
}

export type PaperBid = {
  id: string
  listingId: string
  title: string
  url: string
  maxBidUsd: number
  placedAt: number
  note?: string
  /** PAPER: nothing was sent anywhere. */
  mode: 'PAPER'
  outcome?: 'open' | 'won' | 'lost' | 'withdrawn'
}

export type WatchItem = { listingId: string; title: string; url: string; addedAt: number; snapshot: Listing }
