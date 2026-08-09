/**
 * Money.
 *
 * Amounts are integer **minor units** (cents, pence). Binary floating point is
 * never used to hold or accumulate a financial value — `0.1 + 0.2 !== 0.3`, and
 * a cent lost per order becomes a reconciliation dispute at scale.
 *
 * Two rules the rest of the codebase depends on:
 *
 *   1. Currency is part of the value, not context. Adding USD to GBP throws
 *      rather than silently producing a meaningless number.
 *   2. Splitting money conserves it. `allocate()` distributes remainder cents by
 *      largest remainder, so the parts always sum exactly to the whole.
 */

export type CurrencyCode = string & { readonly __brand?: 'CurrencyCode' }

export type Money = {
  /** Integer minor units. 1234 with currency USD is $12.34. */
  readonly minor: number
  readonly currency: CurrencyCode
}

/** Minor-unit exponent. Most currencies are 2; these are the common exceptions. */
const EXPONENTS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
}

export function exponentFor(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2
}

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot combine ${a} and ${b}. Convert to a single currency first.`)
    this.name = 'CurrencyMismatchError'
  }
}

export class MoneyPrecisionError extends Error {
  constructor(value: number) {
    super(`Money must be an integer number of minor units; received ${value}.`)
    this.name = 'MoneyPrecisionError'
  }
}

export function money(minor: number, currency: string): Money {
  if (!Number.isInteger(minor)) throw new MoneyPrecisionError(minor)
  if (!Number.isSafeInteger(minor)) throw new MoneyPrecisionError(minor)
  return { minor, currency: currency.toUpperCase() }
}

export function zero(currency: string): Money {
  return money(0, currency)
}

/**
 * Parses a decimal string ("1234.56") without going through a float.
 * Source feeds hand us strings; `parseFloat` would introduce the error we are
 * trying to avoid at the very first step.
 */
export function fromDecimalString(value: string, currency: string): Money {
  const trimmed = value.trim().replace(/[\s,_]/g, '')
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(trimmed)
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    throw new Error(`Not a decimal amount: ${JSON.stringify(value)}`)
  }

  const exponent = exponentFor(currency)
  const sign = match[1] === '-' ? -1 : 1
  const whole = match[2] ?? ''
  const fractionRaw = match[3] ?? ''

  // Round half-up on the first discarded digit rather than truncating, so a
  // source that reports more precision than the currency has does not
  // systematically bias every amount downward.
  const kept = fractionRaw.slice(0, exponent).padEnd(exponent, '0')
  const nextDigit = fractionRaw.charCodeAt(exponent) - 48
  const base = Number(`${whole || '0'}${kept}`)
  const rounded = nextDigit >= 5 ? base + 1 : base

  return money(sign * rounded, currency)
}

/** Converts to a decimal string for display or export. Never for arithmetic. */
export function toDecimalString(value: Money): string {
  const exponent = exponentFor(value.currency)
  const negative = value.minor < 0
  const digits = Math.abs(value.minor).toString().padStart(exponent + 1, '0')
  const whole = digits.slice(0, digits.length - exponent)
  const fraction = exponent > 0 ? `.${digits.slice(digits.length - exponent)}` : ''
  return `${negative ? '-' : ''}${whole}${fraction}`
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency)
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.minor + b.minor, a.currency)
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.minor - b.minor, a.currency)
}

export function sum(values: readonly Money[], currency: string): Money {
  return values.reduce<Money>((acc, v) => add(acc, v), zero(currency))
}

export function negate(a: Money): Money {
  return money(-a.minor, a.currency)
}

export function isZero(a: Money): boolean {
  return a.minor === 0
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b)
  return a.minor === b.minor ? 0 : a.minor < b.minor ? -1 : 1
}

/** Multiplies by a whole quantity — the common "unit price × units" case. */
export function multiply(a: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new Error('multiply() takes a whole quantity; use scale() for a ratio.')
  }
  return money(a.minor * quantity, a.currency)
}

export type Rounding = 'half-up' | 'half-even' | 'down'

function roundTo(value: number, mode: Rounding): number {
  if (mode === 'down') return Math.trunc(value)

  const floor = Math.floor(value)
  const diff = value - floor

  if (diff > 0.5) return floor + 1
  if (diff < 0.5) return floor

  // Exactly .5 — banker's rounding avoids the upward bias of always rounding
  // half away from zero, which matters when averaging many allocations.
  if (mode === 'half-even') return floor % 2 === 0 ? floor : floor + 1
  return value < 0 ? floor : floor + 1
}

/** Multiplies by a fractional ratio (a percentage, a tax rate, an FX rate). */
export function scale(a: Money, ratio: number, mode: Rounding = 'half-even'): Money {
  if (!Number.isFinite(ratio)) throw new Error(`scale() needs a finite ratio; got ${ratio}`)
  return money(roundTo(a.minor * ratio, mode), a.currency)
}

/**
 * Splits an amount across weights, conserving every minor unit.
 *
 * Naive proportional splitting loses or invents cents: three ways on 100 gives
 * 33/33/33 and drops one. Largest-remainder assigns the leftovers to the parts
 * with the biggest fractional claim, so the result always sums to the input.
 */
export function allocate(amount: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) return []
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) {
    throw new Error('allocate() weights must be finite and non-negative.')
  }

  const total = weights.reduce((a, b) => a + b, 0)

  // No signal to split on — distribute as evenly as the units allow.
  if (total === 0) return allocate(amount, weights.map(() => 1))

  const exact = weights.map((w) => (amount.minor * w) / total)
  const floors = exact.map((v) => Math.floor(v))
  let remainder = amount.minor - floors.reduce((a, b) => a + b, 0)

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  const result = [...floors]
  let cursor = 0
  while (remainder > 0 && order.length > 0) {
    const target = order[cursor % order.length]!
    result[target.index] = (result[target.index] ?? 0) + 1
    remainder -= 1
    cursor += 1
  }
  // Negative amounts leave a negative remainder; take units back the same way.
  while (remainder < 0 && order.length > 0) {
    const target = order[order.length - 1 - (cursor % order.length)]!
    result[target.index] = (result[target.index] ?? 0) - 1
    remainder += 1
    cursor += 1
  }

  return result.map((minor) => money(minor, amount.currency))
}

/**
 * Ratio of two amounts, for margins and rates.
 *
 * Returns `null` rather than Infinity or NaN when the denominator is zero. The
 * spec requires division by zero to be handled explicitly — a ROAS of Infinity
 * rendered as a KPI is worse than an honest "not applicable".
 */
export function ratio(numerator: Money, denominator: Money): number | null {
  assertSameCurrency(numerator, denominator)
  if (denominator.minor === 0) return null
  return numerator.minor / denominator.minor
}

/** Same explicit-null contract for plain counts (AOV, CAC). */
export function divideByCount(amount: Money, count: number): Money | null {
  if (!Number.isFinite(count) || count === 0) return null
  return money(roundTo(amount.minor / count, 'half-even'), amount.currency)
}

export function formatMoney(
  value: Money,
  locale = 'en-US',
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    ...options,
  }).format(value.minor / 10 ** exponentFor(value.currency))
}
