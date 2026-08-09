import { describe, expect, it } from 'vitest'
import {
  add,
  allocate,
  CurrencyMismatchError,
  divideByCount,
  formatMoney,
  fromDecimalString,
  money,
  MoneyPrecisionError,
  multiply,
  ratio,
  scale,
  subtract,
  sum,
  toDecimalString,
  zero,
} from '@/lib/money'

describe('construction', () => {
  it('rejects fractional minor units', () => {
    expect(() => money(10.5, 'USD')).toThrow(MoneyPrecisionError)
  })

  it('rejects values beyond safe integer precision', () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 2, 'USD')).toThrow(MoneyPrecisionError)
  })

  it('normalises currency case', () => {
    expect(money(1, 'usd').currency).toBe('USD')
  })
})

describe('decimal parsing', () => {
  it('parses without floating point error', () => {
    // 19.99 * 100 in float is 1998.9999999999998 — truncating gives 1998.
    expect(fromDecimalString('19.99', 'USD').minor).toBe(1999)
    expect(fromDecimalString('0.1', 'USD').minor).toBe(10)
    expect(fromDecimalString('0.29', 'USD').minor).toBe(29)
  })

  it('survives the classic 0.1 + 0.2 case', () => {
    const a = fromDecimalString('0.1', 'USD')
    const b = fromDecimalString('0.2', 'USD')
    expect(add(a, b)).toEqual(fromDecimalString('0.3', 'USD'))
    expect(toDecimalString(add(a, b))).toBe('0.30')
  })

  it('rounds half-up on excess precision rather than truncating', () => {
    expect(fromDecimalString('1.005', 'USD').minor).toBe(101)
    expect(fromDecimalString('1.004', 'USD').minor).toBe(100)
  })

  it('honours zero-decimal currencies', () => {
    expect(fromDecimalString('1250', 'JPY').minor).toBe(1250)
    expect(toDecimalString(money(1250, 'JPY'))).toBe('1250')
  })

  it('honours three-decimal currencies', () => {
    expect(fromDecimalString('1.234', 'KWD').minor).toBe(1234)
    expect(toDecimalString(money(1234, 'KWD'))).toBe('1.234')
  })

  it('handles negatives and thousands separators', () => {
    expect(fromDecimalString('-1,234.50', 'USD').minor).toBe(-123450)
    expect(toDecimalString(money(-123450, 'USD'))).toBe('-1234.50')
  })

  it('rejects nonsense', () => {
    expect(() => fromDecimalString('abc', 'USD')).toThrow()
    expect(() => fromDecimalString('', 'USD')).toThrow()
  })
})

describe('currency safety', () => {
  it('refuses to add different currencies', () => {
    expect(() => add(money(100, 'USD'), money(100, 'GBP'))).toThrow(CurrencyMismatchError)
  })

  it('refuses to compare different currencies via ratio', () => {
    expect(() => ratio(money(100, 'USD'), money(100, 'EUR'))).toThrow(CurrencyMismatchError)
  })
})

describe('arithmetic', () => {
  it('adds, subtracts, and sums', () => {
    expect(add(money(150, 'USD'), money(275, 'USD')).minor).toBe(425)
    expect(subtract(money(150, 'USD'), money(275, 'USD')).minor).toBe(-125)
    expect(sum([money(1, 'USD'), money(2, 'USD'), money(3, 'USD')], 'USD').minor).toBe(6)
    expect(sum([], 'USD')).toEqual(zero('USD'))
  })

  it('multiplies by whole quantities only', () => {
    expect(multiply(money(999, 'USD'), 3).minor).toBe(2997)
    expect(() => multiply(money(999, 'USD'), 1.5)).toThrow()
  })

  it('scales by a ratio with banker’s rounding by default', () => {
    // 2.5 and 3.5 both land on the even neighbour.
    expect(scale(money(5, 'USD'), 0.5).minor).toBe(2)
    expect(scale(money(7, 'USD'), 0.5).minor).toBe(4)
    expect(scale(money(5, 'USD'), 0.5, 'half-up').minor).toBe(3)
    expect(scale(money(1000, 'USD'), 0.2).minor).toBe(200)
  })
})

describe('allocate', () => {
  it('conserves every minor unit on an uneven split', () => {
    const parts = allocate(money(100, 'USD'), [1, 1, 1])
    expect(parts.map((p) => p.minor)).toEqual([34, 33, 33])
    expect(parts.reduce((a, p) => a + p.minor, 0)).toBe(100)
  })

  it('splits proportionally by weight', () => {
    const parts = allocate(money(10_000, 'USD'), [70, 20, 10])
    expect(parts.map((p) => p.minor)).toEqual([7000, 2000, 1000])
  })

  it('never loses a unit across many awkward splits', () => {
    for (const total of [1, 7, 99, 101, 3333, 99_999]) {
      for (const n of [2, 3, 7, 11]) {
        const parts = allocate(money(total, 'USD'), Array.from({ length: n }, () => 1))
        expect(parts.reduce((a, p) => a + p.minor, 0)).toBe(total)
      }
    }
  })

  it('conserves negative amounts too (refund allocation)', () => {
    const parts = allocate(money(-100, 'USD'), [1, 1, 1])
    expect(parts.reduce((a, p) => a + p.minor, 0)).toBe(-100)
  })

  it('falls back to an even split when all weights are zero', () => {
    const parts = allocate(money(10, 'USD'), [0, 0, 0])
    expect(parts.reduce((a, p) => a + p.minor, 0)).toBe(10)
  })

  it('rejects negative weights', () => {
    expect(() => allocate(money(10, 'USD'), [1, -1])).toThrow()
  })

  it('returns nothing for no weights', () => {
    expect(allocate(money(10, 'USD'), [])).toEqual([])
  })
})

describe('division by zero is explicit', () => {
  it('returns null rather than Infinity for a zero denominator', () => {
    expect(ratio(money(500, 'USD'), zero('USD'))).toBeNull()
    expect(divideByCount(money(500, 'USD'), 0)).toBeNull()
  })

  it('never yields NaN or Infinity', () => {
    const r = ratio(zero('USD'), zero('USD'))
    expect(r).toBeNull()
    expect(Number.isNaN(r as unknown as number)).toBe(false)
  })

  it('computes real ratios normally', () => {
    expect(ratio(money(300, 'USD'), money(100, 'USD'))).toBe(3)
    expect(divideByCount(money(1000, 'USD'), 4)?.minor).toBe(250)
  })
})

describe('formatting', () => {
  it('renders currency for display', () => {
    expect(formatMoney(money(123_456, 'USD'))).toBe('$1,234.56')
  })
})
