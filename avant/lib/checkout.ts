/**
 * Server-side trip pricing. The client sends what the guest chose; the
 * server looks up the car, re-checks availability and eligibility, and
 * re-computes the price. The client's total is never used.
 */

import { z } from 'zod'
import { EXTRAS, getExtra, getPlan } from './catalog'
import { getCar, getCity } from './data'
import { billableDays, isIsoDate, isIsoTime, rangesOverlap, todayIso } from './dates'
import { checkEligibility, youngDriverFee } from './eligibility'
import { quote } from './pricing'
import { blockedRanges } from './search'
import type { Car, DriverFacts, ExtraId, Quote } from './types'

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
  })
  .strict()

export type TripRequest = z.infer<typeof TripRequest>

export type Priced =
  | { ok: true; car: Car; quote: Quote; days: number }
  | { ok: false; status: number; error: string; reasons?: string[] }

export function priceTrip(req: TripRequest, driver: DriverFacts, today = todayIso()): Priced {
  const car = getCar(req.slug)
  if (!car) return { ok: false, status: 404, error: 'That car is not available.' }
  if (req.end < req.start) return { ok: false, status: 400, error: 'Return is before pickup.' }
  if (req.start < today) return { ok: false, status: 400, error: 'Pickup is in the past.' }
  const days = billableDays(req.start, req.startTime, req.end, req.endTime)
  if (days < car.minDays || days > car.maxDays) {
    return { ok: false, status: 400, error: `This car books for ${car.minDays} to ${car.maxDays} days.` }
  }
  if (blockedRanges(car, today).some((b) => rangesOverlap(req.start, req.end, b.start, b.end))) {
    return { ok: false, status: 409, error: 'Those dates were just taken. Try others.' }
  }
  if (req.delivery && (!car.delivery.offered || req.deliveryAddress.length < 6)) {
    return { ok: false, status: 400, error: 'Add a delivery address, or pick up instead.' }
  }
  const elig = checkEligibility(driver, car.valueTier, req.end, today)
  if (!elig.ok) return { ok: false, status: 403, error: elig.messages[0], reasons: elig.reasons }

  const q = quote({
    dailyRateCents: car.dailyRateCents,
    days,
    weeklyDiscountPct: car.weeklyDiscountPct,
    monthlyDiscountPct: car.monthlyDiscountPct,
    plan: getPlan(req.coverage),
    delivery: req.delivery,
    deliveryFeeCents: car.delivery.feeCents,
    extras: req.extras.map(getExtra),
    taxRate: getCity(car.city)?.taxRate ?? 0,
    youngDriverFeeCents: youngDriverFee(driver.age, days, driver.cleanRecord),
  })
  return { ok: true, car, quote: q, days }
}
