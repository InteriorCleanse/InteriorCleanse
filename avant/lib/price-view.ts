/**
 * Prices as cards show them: the all-in total for a trip of N days (rate
 * with its weekly or monthly discount, the trip fee and default coverage,
 * before tax), using the same quote() as checkout.
 */

import { DEFAULT_COVERAGE, getPlan } from './catalog'
import { quote } from './pricing'
import type { Car } from './types'

export function tripTotalCents(car: Car, days: number): number {
  return quote({
    dailyRateCents: car.dailyRateCents,
    days,
    weeklyDiscountPct: car.weeklyDiscountPct,
    monthlyDiscountPct: car.monthlyDiscountPct,
    plan: getPlan(DEFAULT_COVERAGE),
    delivery: false,
    deliveryFeeCents: 0,
    extras: [],
    taxRate: 0,
    youngDriverFeeCents: 0,
  }).totalCents
}

export const offersMonthly = (car: Car) => car.maxDays >= 30
