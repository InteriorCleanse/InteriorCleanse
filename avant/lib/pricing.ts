/**
 * Pure quoting in integer cents. The server re-runs this before any charge,
 * so the number a guest sees is the number they pay.
 */

import { TRIP_FEE_PCT } from './catalog.ts'
import type { Extra, Quote, QuoteInput, QuoteLine } from './types.ts'

export function pct(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100)
}

export function discountFor(days: number, weeklyPct: number, monthlyPct: number): number {
  if (days >= 30 && monthlyPct > 0) return monthlyPct
  if (days >= 7 && weeklyPct > 0) return weeklyPct
  return 0
}

export function extrasTotal(extras: Extra[], days: number): number {
  return extras.reduce((sum, e) => sum + (e.perTripCents ?? 0) + (e.perDayCents ?? 0) * days, 0)
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

export function quote(input: QuoteInput): Quote {
  const days = Math.max(1, Math.floor(input.days))
  const baseCents = input.dailyRateCents * days
  const discountPct = discountFor(days, input.weeklyDiscountPct, input.monthlyDiscountPct)
  const discountCents = pct(baseCents, discountPct)
  const tripCents = baseCents - discountCents
  const tripFeeCents = pct(tripCents, TRIP_FEE_PCT)
  const protectionCents = Math.max(pct(tripCents, input.plan.pctOfTrip), input.plan.minPerDayCents * days)
  const youngDriverCents = Math.max(0, Math.round(input.youngDriverFeeCents))
  const deliveryCents = input.delivery ? input.deliveryFeeCents : 0
  const extrasCents = extrasTotal(input.extras, days)
  // Protection is an insurance product and is not taxed; everything else is.
  const taxable = tripCents + tripFeeCents + youngDriverCents + deliveryCents + extrasCents
  const taxCents = pct(taxable, input.taxRate * 100)
  const totalCents = taxable + protectionCents + taxCents

  const lines: QuoteLine[] = [
    { id: 'trip', label: `${dollars(input.dailyRateCents)} × ${days} ${days === 1 ? 'day' : 'days'}`, cents: baseCents },
  ]
  if (discountCents > 0) {
    lines.push({
      id: 'discount',
      label: `${days >= 30 ? 'Monthly' : 'Weekly'} discount (${discountPct}%)`,
      cents: -discountCents,
      note: 'Set by the host for longer trips.',
    })
  }
  lines.push({ id: 'fee', label: `Trip fee (${TRIP_FEE_PCT}%)`, cents: tripFeeCents, note: 'One flat rate. Pays for support, verification and the platform.' })
  lines.push({
    id: 'protection',
    label: `${input.plan.name} coverage`,
    cents: protectionCents,
    note: input.plan.maxOutOfPocketCents === 0 ? 'You pay $0 if the car is damaged.' : `You pay at most ${dollars(input.plan.maxOutOfPocketCents)} if the car is damaged.`,
  })
  if (youngDriverCents > 0) {
    lines.push({ id: 'young', label: 'Young driver fee', cents: youngDriverCents, note: 'Under-25 drivers. Capped per trip, halved with a clean record.' })
  }
  if (deliveryCents > 0) lines.push({ id: 'delivery', label: 'Delivery', cents: deliveryCents, note: 'The host brings the car to you.' })
  for (const e of input.extras) {
    lines.push({
      id: `extra:${e.id}`,
      label: e.perDayCents ? `${e.name} (${dollars(e.perDayCents)}/day)` : e.name,
      cents: (e.perTripCents ?? 0) + (e.perDayCents ?? 0) * days,
    })
  }
  lines.push({
    id: 'tax',
    label: `Taxes (${(input.taxRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)`,
    cents: taxCents,
    note: 'Local sales and rental tax. Coverage is not taxed.',
  })

  return {
    days,
    baseCents,
    discountPct,
    discountCents,
    tripCents,
    tripFeeCents,
    protectionCents,
    youngDriverCents,
    deliveryCents,
    extrasCents,
    taxCents,
    totalCents,
    depositCents: input.plan.depositCents,
    lines,
  }
}

/**
 * The all-in daily price shown on cards and map pins: rate plus trip fee plus
 * the default coverage, before tax. Turo shows the bare rate first and adds
 * fees at checkout; AVANT shows this and never adds anything the guest
 * did not choose.
 */
export function allInDaily(dailyRateCents: number, planPct: number, planMinPerDayCents: number): number {
  return dailyRateCents + pct(dailyRateCents, 12) + Math.max(pct(dailyRateCents, planPct), planMinPerDayCents)
}

export function hostMonthlyEstimate(dailyRateCents: number, daysBooked: number, hostSharePct: number): number {
  return pct(dailyRateCents * Math.max(0, Math.min(31, daysBooked)), hostSharePct)
}
