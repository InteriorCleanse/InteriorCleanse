/**
 * Valuation — what a car is worth, worked out from comparable listings.
 *
 * A "comparable" (a comp) is another listing of the same make and model, a
 * model year within one year of the car, that has a price. Gavel adjusts each
 * comp for the difference in mileage, then takes the MEDIAN (the middle value,
 * so one silly price cannot drag the estimate). Fewer than `minComps` comps
 * means NOT ENOUGH COMPS and no number is shown at all — Gavel never guesses.
 *
 * LIVE listings are only ever compared with LIVE listings, and SAMPLE with
 * SAMPLE. A sample car is not evidence of anything real.
 */
import type { Estimate, Listing, TitleStatus } from './types.ts'
import { config } from '../config.ts'

/**
 * The mileage adjustment: each 10,000 miles of difference between the car and
 * a comp moves that comp's price by this fraction. This is Gavel's working
 * assumption, deliberately small, not a market statistic. Verify against real
 * sold prices for the exact car before trusting any single estimate.
 */
export const MILEAGE_ADJ_PER_10K = 0.04
/** A comp is never adjusted below half its own price... */
export const MILEAGE_ADJ_FLOOR = 0.5
/** ...or above one and a half times it. Both limits keep one odd comp honest. */
export const MILEAGE_ADJ_CEILING = 1.5

/** Title statuses that make a listing useless as a comp for a clean car. */
const BAD_TITLES: ReadonlySet<TitleStatus> = new Set<TitleStatus>(['salvage', 'rebuilt', 'flood', 'lemon', 'parts-only'])

/** The price you would have to pay right now: the current bid, else the buy-now price. */
export function askingPrice(l: Listing): number | undefined {
  return l.currentBidUsd ?? l.buyNowUsd
}

/**
 * A comp's price: a sold price first (money actually changed hands), then the
 * buy-now price (a real ask), else the current bid. A bid on an auction that
 * has not ended is usually below where it will finish, which is why sold
 * prices a member adds are worth so much.
 */
function compPrice(l: Listing): number | undefined {
  return l.soldUsd ?? l.buyNowUsd ?? l.currentBidUsd
}

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

function firstWord(s: string | undefined): string {
  return norm(s).split(/\s+/)[0] ?? ''
}

/** True when `c` may be used as a comparable for `target`. */
export function isComparable(target: Listing, c: Listing): boolean {
  if (c.id === target.id) return false
  if (target.vin && c.vin === target.vin) return false
  if (c.kind !== target.kind) return false
  if (BAD_TITLES.has(c.titleStatus)) return false
  if (norm(c.make) !== norm(target.make)) return false
  if (firstWord(c.model) !== firstWord(target.model)) return false
  if (target.year === undefined || c.year === undefined) return false
  if (Math.abs(c.year - target.year) > 1) return false
  const price = compPrice(c)
  return price !== undefined && price > 0
}

/**
 * Move a comp's price towards what it would be at the target's mileage.
 * A comp with fewer miles than the car is worth more than the car, so its
 * price is adjusted down; a comp with more miles is adjusted up.
 */
export function adjustForMileage(compPriceUsd: number, compMiles: number | undefined, targetMiles: number | undefined): number {
  if (compMiles === undefined || targetMiles === undefined) return compPriceUsd
  const diff10k = (targetMiles - compMiles) / 10_000
  const factor = 1 - MILEAGE_ADJ_PER_10K * diff10k
  const clamped = Math.min(MILEAGE_ADJ_CEILING, Math.max(MILEAGE_ADJ_FLOOR, factor))
  return compPriceUsd * clamped
}

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Estimate what `target` is worth from the other listings in `pool`.
 * Returns ok:false with a reason beginning "NOT ENOUGH COMPS" when there are
 * fewer than `minComps` usable comparables.
 */
export function estimateValue(target: Listing, pool: Listing[], minComps = config.scoring.minComps): Estimate {
  if (!norm(target.make) || !norm(target.model)) {
    return { ok: false, comps: 0, reason: 'NOT ENOUGH COMPS — the listing does not say the make and model, so nothing can be compared. Open the lot and read the title line, or decode the VIN.' }
  }
  if (target.year === undefined) {
    return { ok: false, comps: 0, reason: 'NOT ENOUGH COMPS — the listing does not say the model year, so Gavel cannot pick comparable years. Open the lot and check.' }
  }

  const comps = pool.filter((c) => isComparable(target, c))
  if (comps.length < minComps) {
    const found = comps.length === 1 ? '1 comparable listing' : `${comps.length} comparable listings`
    return {
      ok: false,
      comps: comps.length,
      reason: `NOT ENOUGH COMPS — found ${found}; Gavel needs ${minComps} before it shows a value. A comparable is the same make and model, a model year within one year, with a price and a clean-type title. Look up recent sold prices for this exact car before you bid, and add them on the Import screen: Gavel uses them from then on.`,
    }
  }

  const adjusted = comps
    .map((c) => adjustForMileage(compPrice(c) as number, c.mileage, target.mileage))
    .sort((a, b) => a - b)

  const sold = comps.filter((c) => c.soldUsd !== undefined).length
  const what = sold === 0 ? `${comps.length} comparable listings` : sold === comps.length ? `${comps.length} sold prices` : `${comps.length} comparables (${sold} of them sold prices)`
  return {
    ok: true,
    valueUsd: Math.round(median(adjusted)),
    low: Math.round(adjusted[0]),
    high: Math.round(adjusted[adjusted.length - 1]),
    comps: comps.length,
    method: `median of ${what}, mileage-adjusted`,
  }
}
