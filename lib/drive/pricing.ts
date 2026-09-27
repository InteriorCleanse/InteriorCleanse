/**
 * Pure quoting. Given the facts of a trip, produce a fully itemised quote in
 * integer cents. Nothing here reads state, so the same input always gives the
 * same total, and every line the guest sees is one of the lines below.
 */

import { TRIP_FEE_PCT } from './catalog.ts'
import type { Extra, Quote, QuoteInput, QuoteLine } from './types.ts'

/** Rounds half up on positive cents, which is what a receipt expects. */
export function pct(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100)
}

/** Length discount for a trip: monthly beats weekly, and a short trip gets none. */
export function discountFor(days: number, weeklyPct: number, monthlyPct: number): number {
  if (days >= 30 && monthlyPct > 0) return monthlyPct
  if (days >= 7 && weeklyPct > 0) return weeklyPct
  return 0
}

export function extrasTotal(extras: Extra[], days: number): number {
  return extras.reduce((sum, extra) => sum + (extra.perTripCents ?? 0) + (extra.perDayCents ?? 0) * days, 0)
}

export function quote(input: QuoteInput): Quote {
  const days = Math.max(1, Math.floor(input.days))
  const baseCents = input.dailyRateCents * days
  const discountPct = discountFor(days, input.weeklyDiscountPct, input.monthlyDiscountPct)
  const discountCents = pct(baseCents, discountPct)
  const tripCents = baseCents - discountCents
  const tripFeeCents = pct(tripCents, TRIP_FEE_PCT)
  const protectionCents = pct(tripCents, input.plan.pctOfTrip)
  const deliveryCents = input.delivery ? input.deliveryFeeCents : 0
  const extrasCents = extrasTotal(input.extras, days)
  // Protection is an insurance product and is not taxed; everything else is.
  const taxable = tripCents + tripFeeCents + deliveryCents + extrasCents
  const taxCents = pct(taxable, input.taxRate * 100)
  const totalCents = tripCents + tripFeeCents + protectionCents + deliveryCents + extrasCents + taxCents

  const lines: QuoteLine[] = [
    {
      id: 'trip',
      label: `${money(input.dailyRateCents)} × ${days} ${days === 1 ? 'day' : 'days'}`,
      cents: baseCents,
    },
  ]
  if (discountCents > 0) {
    lines.push({
      id: 'discount',
      label: `${days >= 30 ? 'Monthly' : 'Weekly'} discount (${discountPct}%)`,
      cents: -discountCents,
      note: 'Set by the host for longer trips.',
    })
  }
  lines.push({
    id: 'fee',
    label: `Trip fee (${TRIP_FEE_PCT}%)`,
    cents: tripFeeCents,
    note: 'Pays for 24/7 support, host verification and the platform.',
  })
  lines.push({
    id: 'protection',
    label: `${input.plan.name} protection (${input.plan.pctOfTrip}%)`,
    cents: protectionCents,
    note:
      input.plan.deductibleCents === 0
        ? 'No deductible.'
        : `You pay up to ${money(input.plan.deductibleCents)} on a damage claim.`,
  })
  if (deliveryCents > 0) {
    lines.push({ id: 'delivery', label: 'Delivery', cents: deliveryCents, note: 'Brought to your address by the host.' })
  }
  for (const extra of input.extras) {
    const cents = (extra.perTripCents ?? 0) + (extra.perDayCents ?? 0) * days
    lines.push({
      id: `extra:${extra.id}`,
      label: extra.perDayCents ? `${extra.name} (${money(extra.perDayCents)}/day)` : extra.name,
      cents,
    })
  }
  lines.push({
    id: 'tax',
    label: `Estimated taxes (${(input.taxRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)`,
    cents: taxCents,
    note: 'Local sales and rental tax; protection is not taxed.',
  })

  return {
    days,
    baseCents,
    discountPct,
    discountCents,
    tripCents,
    tripFeeCents,
    protectionCents,
    deliveryCents,
    extrasCents,
    taxCents,
    totalCents,
    lines,
  }
}

/** Whole-dollar money without importing the formatter module into pure code. */
function money(cents: number): string {
  const dollars = Math.round(cents / 100)
  return `$${dollars.toLocaleString('en-US')}`
}

/**
 * What a host might earn in a month, for the estimator. Hosts keep the trip
 * price less the marketplace share; utilisation is the share of days booked.
 */
export function hostMonthlyEstimate(dailyRateCents: number, daysBookedPerMonth: number, hostSharePct = 75): number {
  return pct(dailyRateCents * Math.max(0, Math.min(31, daysBookedPerMonth)), hostSharePct)
}
