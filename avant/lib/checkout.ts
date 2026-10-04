/**
 * Server-side trip pricing. The client sends what the guest chose; the
 * server looks up the car, re-checks availability and eligibility, and
 * re-computes the price. The client's total is never used.
 */

import { z } from 'zod'
import { EXTRAS, getExtra, getPlan } from './catalog.ts'
import { billableDays, isIsoDate, isIsoTime, rangesOverlap, todayIso } from './dates.ts'
import { checkEligibility, youngDriverFee } from './eligibility.ts'
import { quote } from './pricing.ts'
import { blockedRanges } from './search.ts'
import type { Car, DriverFacts, ExtraId, Quote } from './types.ts'

export const TripRequest = z
  .object({
    slug: z.string().max(120),
    start: z.string().refine(isIsoDate),
    end: z.string().refine(isIsoDate),
    startTime: z.string().refine(isIsoTime),
    endTime: z.string().refine(isIsoTime),
    coverage: z.enum(['zero', 'plus', 'essential']),
    extras: z.array(z.enum(EXTRAS.map((e) => e.id) as [ExtraId, ...ExtraId[]])).max(EXTRAS.length),
    delivery: z.boolean(),
    deliveryAddress: z.string().trim().max(200),
    /** Apply the guest's AVANT credit (on unless they turn it off). */
    useCredit: z.boolean().optional(),
    /** The guest ticked the trip terms; the booking route requires it and records it. */
    agreeTerms: z.boolean().optional(),
  })
  .strict()

export type TripRequest = z.infer<typeof TripRequest>

export type Priced =
  | { ok: true; car: Car; quote: Quote; days: number }
  | { ok: false; status: number; error: string; reasons?: string[] }

export interface PriceOptions {
  /**
   * Payment already succeeded for exactly this request, which passed every
   * check below before the charge. Re-price for the receipt only: skip the
   * checks that can change with the clock (pickup now "in the past" after a
   * midnight checkout, availability, a record deleted since).
   */
  paid?: boolean
  /** Sales tax for the car's city (0.0863 for 8.63%). */
  taxRate?: number
  /** The guest's AVANT Circle tier, from their completed trips (server-side). */
  circle?: { tier: string; feePct: number; freeCancelHours: number }
}

/** Prices a trip in `car`, which the caller has already loaded for req.slug. */
export function priceTrip(car: Car | null | undefined, req: TripRequest, driver: DriverFacts, today = todayIso(), opts: PriceOptions = {}): Priced {
  if (!car || car.slug !== req.slug) return { ok: false, status: 404, error: 'That car is not available.' }
  if (req.end < req.start) return { ok: false, status: 400, error: 'Return is before pickup.' }
  if (!opts.paid && req.start < today) return { ok: false, status: 400, error: 'Pickup is in the past.' }
  const days = billableDays(req.start, req.startTime, req.end, req.endTime)
  if (days < car.minDays || days > car.maxDays) {
    return { ok: false, status: 400, error: `This car books for ${car.minDays} to ${car.maxDays} days.` }
  }
  if (!opts.paid && blockedRanges(car, today).some((b) => rangesOverlap(req.start, req.end, b.start, b.end))) {
    return { ok: false, status: 409, error: 'Those dates were just taken. Try others.' }
  }
  if (req.delivery && (!car.delivery.offered || req.deliveryAddress.length < 6)) {
    return { ok: false, status: 400, error: 'Add a delivery address, or pick up instead.' }
  }
  if (!opts.paid) {
    const elig = checkEligibility(driver, car.valueTier, req.end, today)
    if (!elig.ok) return { ok: false, status: 403, error: elig.messages[0], reasons: elig.reasons }
  }

  const q = quote({
    dailyRateCents: car.dailyRateCents,
    days,
    weeklyDiscountPct: car.weeklyDiscountPct,
    monthlyDiscountPct: car.monthlyDiscountPct,
    plan: getPlan(req.coverage),
    delivery: req.delivery,
    deliveryFeeCents: car.delivery.feeCents,
    extras: req.extras.map(getExtra),
    taxRate: opts.taxRate ?? 0,
    youngDriverFeeCents: youngDriverFee(driver.age, days, driver.cleanRecord),
    circle: opts.circle,
  })
  return { ok: true, car, quote: q, days }
}
