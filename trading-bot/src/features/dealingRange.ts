/**
 * The dealing range: the span between the last confirmed swing high and
 * swing low, and where price sits inside it. Above the middle is
 * PREMIUM (expensive), below it is DISCOUNT (cheap). ICT traders look
 * for shorts in premium and longs in discount. This is a reading, not
 * a rule.
 */

import { config } from '../../config.ts'
import type { DealingRange, LabelledSwing } from '../types.ts'

export function dealingRange(price: number, high: LabelledSwing | null, low: LabelledSwing | null): DealingRange | null {
  if (!high || !low) return null
  // Price beyond a swing extends the range to the price itself, so position stays within 0–100.
  const top = Math.max(high.price, price)
  const bottom = Math.min(low.price, price)
  if (top - bottom <= 0) return null
  const position = ((price - bottom) / (top - bottom)) * 100
  const { premiumAbovePercent, discountBelowPercent } = config.structure
  return {
    high: top,
    low: bottom,
    equilibrium: (top + bottom) / 2,
    position,
    zone: position > premiumAbovePercent ? 'premium' : position < discountBelowPercent ? 'discount' : 'equilibrium',
    fromLabel: `last swing high (${high.label}) and swing low (${low.label})`,
  }
}

export function describeDealingRange(d: DealingRange): string {
  const where = d.zone === 'premium' ? 'in premium — the expensive half, where shorts are looked for' : d.zone === 'discount' ? 'in discount — the cheap half, where longs are looked for' : 'at equilibrium — the middle, where neither side has an edge'
  return `Price is ${Math.round(d.position)}% of the way up the range $${d.low.toFixed(2)}–$${d.high.toFixed(2)} (${d.fromLabel}): ${where}.`
}
