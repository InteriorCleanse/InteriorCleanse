import { describe, expect, it } from 'vitest'
import {
  bucketsFor,
  bucketStart,
  changeSentiment,
  computeChange,
  defaultGranularity,
  resolveComparison,
  resolvePreset,
} from '@/lib/periods'

// A Wednesday, mid-month, mid-quarter — so month/quarter/year boundaries are
// all non-trivial rather than accidentally aligning.
const NOW = new Date('2026-05-13T14:30:00Z')

const iso = (d: Date) => d.toISOString()

describe('resolvePreset', () => {
  it('bounds today to the calendar day', () => {
    const p = resolvePreset('today', NOW)
    expect(iso(p.start)).toBe('2026-05-13T00:00:00.000Z')
    expect(iso(p.end)).toBe('2026-05-13T23:59:59.999Z')
  })

  it('resolves yesterday as a full prior day', () => {
    const p = resolvePreset('yesterday', NOW)
    expect(iso(p.start)).toBe('2026-05-12T00:00:00.000Z')
    expect(iso(p.end)).toBe('2026-05-12T23:59:59.999Z')
  })

  it('makes "last 7 days" seven days, not eight', () => {
    const p = resolvePreset('last_7', NOW)
    expect(iso(p.start)).toBe('2026-05-07T00:00:00.000Z')
    expect(bucketsFor(p, 'day')).toHaveLength(7)
  })

  it('makes "last 30 days" thirty days', () => {
    expect(bucketsFor(resolvePreset('last_30', NOW), 'day')).toHaveLength(30)
  })

  it('anchors month, quarter, and year to date', () => {
    expect(iso(resolvePreset('month_to_date', NOW).start)).toBe('2026-05-01T00:00:00.000Z')
    // May is in Q2, which starts in April.
    expect(iso(resolvePreset('quarter_to_date', NOW).start)).toBe('2026-04-01T00:00:00.000Z')
    expect(iso(resolvePreset('year_to_date', NOW).start)).toBe('2026-01-01T00:00:00.000Z')
  })

  it('handles a year boundary without rolling backwards', () => {
    const jan1 = new Date('2026-01-01T09:00:00Z')
    expect(iso(resolvePreset('year_to_date', jan1).start)).toBe('2026-01-01T00:00:00.000Z')
    expect(iso(resolvePreset('yesterday', jan1).start)).toBe('2025-12-31T00:00:00.000Z')
  })
})

describe('resolveComparison', () => {
  it('previous period is the window immediately before, same length', () => {
    const p = resolvePreset('last_7', NOW)
    const c = resolveComparison(p, 'previous_period')!
    expect(iso(c.end)).toBe('2026-05-06T23:59:59.999Z')
    expect(iso(c.start)).toBe('2026-04-30T00:00:00.000Z')
    // Same span, to the millisecond.
    expect(c.end.getTime() - c.start.getTime()).toBe(p.end.getTime() - p.start.getTime())
  })

  it('previous period never overlaps the current one', () => {
    for (const preset of ['today', 'last_7', 'last_30', 'month_to_date'] as const) {
      const p = resolvePreset(preset, NOW)
      const c = resolveComparison(p, 'previous_period')!
      expect(c.end.getTime()).toBeLessThan(p.start.getTime())
    }
  })

  it('previous year shifts by a calendar year', () => {
    const p = resolvePreset('month_to_date', NOW)
    const c = resolveComparison(p, 'previous_year')!
    expect(iso(c.start)).toBe('2025-05-01T00:00:00.000Z')
  })

  it('returns null when comparison is off', () => {
    expect(resolveComparison(resolvePreset('today', NOW), 'none')).toBeNull()
  })
})

describe('computeChange', () => {
  it('computes absolute and percentage movement', () => {
    const c = computeChange(150, 100)
    expect(c.absolute).toBe(50)
    expect(c.percent).toBeCloseTo(0.5)
    expect(c.direction).toBe('up')
  })

  it('refuses to express growth from zero as a percentage', () => {
    // "+100%" from a zero baseline is a lie that reads as insight.
    const c = computeChange(500, 0)
    expect(c.percent).toBeNull()
    expect(c.direction).toBe('up')
    expect(c.unavailableReason).toBe('No activity in the comparison period')
  })

  it('reports zero-to-zero as flat, not as an error', () => {
    const c = computeChange(0, 0)
    expect(c.direction).toBe('flat')
    expect(c.percent).toBeNull()
  })

  it('reads a loss shrinking as an improvement', () => {
    // -100 → -50 is 50% better, not -50% worse.
    const c = computeChange(-50, -100)
    expect(c.absolute).toBe(50)
    expect(c.percent).toBeCloseTo(0.5)
    expect(c.direction).toBe('up')
  })

  it('never yields NaN or Infinity', () => {
    for (const [a, b] of [[0, 0], [5, 0], [-5, 0], [0, 5]]) {
      const c = computeChange(a!, b!)
      expect(c.percent === null || Number.isFinite(c.percent)).toBe(true)
    }
  })
})

describe('changeSentiment', () => {
  it('treats rising revenue as good', () => {
    expect(changeSentiment('net_revenue', 'up')).toBe('positive')
    expect(changeSentiment('net_revenue', 'down')).toBe('negative')
  })

  it('treats rising refund rate and CAC as bad', () => {
    // Painting both directions green is worse than no colour at all.
    expect(changeSentiment('refund_rate', 'up')).toBe('negative')
    expect(changeSentiment('refund_rate', 'down')).toBe('positive')
    expect(changeSentiment('cac', 'up')).toBe('negative')
  })

  it('treats flat as neutral', () => {
    expect(changeSentiment('net_revenue', 'flat')).toBe('neutral')
  })
})

describe('granularity and buckets', () => {
  it('scales granularity to the span', () => {
    expect(defaultGranularity(resolvePreset('last_7', NOW))).toBe('day')
    expect(defaultGranularity(resolvePreset('last_30', NOW))).toBe('day')
    expect(
      defaultGranularity({
        start: new Date('2025-01-01T00:00:00Z'),
        end: new Date('2026-01-01T00:00:00Z'),
        label: 'year',
        timezone: 'UTC',
      }),
    ).toBe('month')
  })

  it('buckets weeks to Monday', () => {
    // 2026-05-13 is a Wednesday; its ISO week starts Monday the 11th.
    expect(iso(bucketStart(NOW, 'week'))).toBe('2026-05-11T00:00:00.000Z')
  })

  it('buckets months to the first', () => {
    expect(iso(bucketStart(NOW, 'month'))).toBe('2026-05-01T00:00:00.000Z')
  })

  it('includes empty buckets, because a gap is data', () => {
    const p = resolvePreset('last_30', NOW)
    const buckets = bucketsFor(p, 'day')
    expect(buckets).toHaveLength(30)
    // Strictly increasing, no duplicates or skips.
    for (let i = 1; i < buckets.length; i += 1) {
      expect(buckets[i]!.getTime()).toBeGreaterThan(buckets[i - 1]!.getTime())
    }
  })

  it('walks month buckets across a year boundary', () => {
    const buckets = bucketsFor(
      { start: new Date('2025-11-01T00:00:00Z'), end: new Date('2026-02-15T00:00:00Z'), label: 'x', timezone: 'UTC' },
      'month',
    )
    expect(buckets.map(iso)).toEqual([
      '2025-11-01T00:00:00.000Z',
      '2025-12-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
    ])
  })
})
