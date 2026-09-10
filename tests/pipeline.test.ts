import { describe, expect, it } from 'vitest'
import {
  CLOSING_SOON_DAYS,
  addDays,
  groupByStage,
  summarisePipeline,
  totalByCurrency,
  type PipelineDeal,
} from '@/lib/crm/pipeline'

const TODAY = '2026-09-10'

function deal(over: Partial<PipelineDeal> & { id: string }): PipelineDeal {
  return {
    name: over.id,
    stage: 'Qualified',
    outcome: 'open',
    amountMinor: 10_000,
    currency: 'GBP',
    probability: 20,
    expectedCloseOn: null,
    owner: null,
    source: 'hubspot',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

describe('pipeline totals', () => {
  it('totals per currency and never across them', () => {
    const { totals, withoutAmount } = totalByCurrency([
      deal({ id: 'a', amountMinor: 1_000, currency: 'GBP' }),
      deal({ id: 'b', amountMinor: 2_000, currency: 'GBP' }),
      deal({ id: 'c', amountMinor: 9_000, currency: 'USD' }),
    ])
    expect(totals).toEqual([
      { currency: 'USD', minor: 9_000, deals: 1 },
      { currency: 'GBP', minor: 3_000, deals: 2 },
    ])
    expect(withoutAmount).toBe(0)
    // No entry pretends to be a grand total.
    expect(totals.map((t) => t.currency)).not.toContain('total')
  })

  it('counts a deal with no amount or no currency instead of summing it as zero', () => {
    const { totals, withoutAmount } = totalByCurrency([
      deal({ id: 'a', amountMinor: null }),
      deal({ id: 'b', currency: null }),
      deal({ id: 'c', amountMinor: 500 }),
    ])
    expect(withoutAmount).toBe(2)
    expect(totals).toEqual([{ currency: 'GBP', minor: 500, deals: 1 }])
  })

  it('orders ties by currency code so the page is stable between renders', () => {
    const { totals } = totalByCurrency([
      deal({ id: 'a', amountMinor: 100, currency: 'USD' }),
      deal({ id: 'b', amountMinor: 100, currency: 'EUR' }),
    ])
    expect(totals.map((t) => t.currency)).toEqual(['EUR', 'USD'])
  })
})

describe('stages', () => {
  it("keeps the vendor's stage labels verbatim and orders them by the vendor's probability", () => {
    const stages = groupByStage([
      deal({ id: 'a', stage: 'Appointment scheduled', probability: 20 }),
      deal({ id: 'b', stage: 'Contract sent', probability: 90 }),
      deal({ id: 'c', stage: 'Qualified to buy', probability: 40 }),
      deal({ id: 'd', stage: 'Contract sent', probability: 90 }),
    ])
    expect(stages.map((s) => s.stage)).toEqual([
      'Contract sent',
      'Qualified to buy',
      'Appointment scheduled',
    ])
    expect(stages[0]!.deals).toHaveLength(2)
    expect(stages[0]!.totals).toEqual([{ currency: 'GBP', minor: 20_000, deals: 2 }])
  })

  it('puts stages without a probability last, by name', () => {
    const stages = groupByStage([
      deal({ id: 'a', stage: 'Zeta', probability: null }),
      deal({ id: 'b', stage: 'Alpha', probability: null }),
      deal({ id: 'c', stage: 'Late', probability: 10 }),
    ])
    expect(stages.map((s) => s.stage)).toEqual(['Late', 'Alpha', 'Zeta'])
    expect(stages[1]!.probability).toBeNull()
  })

  it('uses the median so one optimistic deal does not reorder a stage', () => {
    const stages = groupByStage([
      deal({ id: 'a', stage: 'Early', probability: 10 }),
      deal({ id: 'b', stage: 'Early', probability: 10 }),
      deal({ id: 'c', stage: 'Early', probability: 100 }),
      deal({ id: 'd', stage: 'Mid', probability: 50 }),
    ])
    expect(stages.map((s) => s.stage)).toEqual(['Mid', 'Early'])
    expect(stages[1]!.probability).toBe(10)
  })

  it('lists the deal closing soonest first and undated deals last', () => {
    const [stage] = groupByStage([
      deal({ id: 'undated', expectedCloseOn: null }),
      deal({ id: 'later', expectedCloseOn: '2026-10-01' }),
      deal({ id: 'soon', expectedCloseOn: '2026-09-12' }),
    ])
    expect(stage!.deals.map((d) => d.id)).toEqual(['soon', 'later', 'undated'])
  })
})

describe('summary', () => {
  it('separates open, won and lost, and never adds pipeline to anything', () => {
    const summary = summarisePipeline(
      [
        deal({ id: 'open', amountMinor: 1_000 }),
        deal({ id: 'won', outcome: 'won', stage: 'Closed won', amountMinor: 5_000 }),
        deal({ id: 'lost', outcome: 'lost', stage: 'Closed lost', amountMinor: 7_000 }),
      ],
      TODAY,
    )
    expect(summary.open.count).toBe(1)
    expect(summary.open.totals).toEqual([{ currency: 'GBP', minor: 1_000, deals: 1 }])
    expect(summary.won.totals).toEqual([{ currency: 'GBP', minor: 5_000, deals: 1 }])
    expect(summary.lost.count).toBe(1)
    // Closed deals do not appear among the open stages.
    expect(summary.open.stages.map((s) => s.stage)).toEqual(['Qualified'])
  })

  it('counts overdue and closing-soon deals from the expected close date', () => {
    const summary = summarisePipeline(
      [
        deal({ id: 'yesterday', expectedCloseOn: addDays(TODAY, -1) }),
        deal({ id: 'today', expectedCloseOn: TODAY }),
        deal({ id: 'edge', expectedCloseOn: addDays(TODAY, CLOSING_SOON_DAYS) }),
        deal({ id: 'beyond', expectedCloseOn: addDays(TODAY, CLOSING_SOON_DAYS + 1) }),
        deal({ id: 'undated', expectedCloseOn: null }),
        // A closed deal with a past date is not overdue; it is closed.
        deal({ id: 'done', outcome: 'won', expectedCloseOn: addDays(TODAY, -30) }),
      ],
      TODAY,
    )
    expect(summary.overdue).toBe(1)
    expect(summary.closingSoon).toBe(2)
  })

  it('limits won and lost to the window, and leaves undated closed deals out of it', () => {
    const summary = summarisePipeline(
      [
        deal({ id: 'recent', outcome: 'won', updatedAt: '2026-09-01T00:00:00.000Z' }),
        deal({ id: 'old', outcome: 'won', updatedAt: '2026-01-01T00:00:00.000Z' }),
        deal({ id: 'unknown', outcome: 'lost', updatedAt: null }),
      ],
      TODAY,
      '2026-06-12T00:00:00.000Z',
    )
    expect(summary.won.count).toBe(1)
    expect(summary.lost.count).toBe(0)
  })

  it('does not weight open value by probability', () => {
    // The whole point: 90% of £10,000 is not a figure anyone measured.
    const summary = summarisePipeline([deal({ id: 'a', amountMinor: 10_000, probability: 90 })], TODAY)
    expect(summary.open.totals[0]!.minor).toBe(10_000)
    expect(JSON.stringify(summary)).not.toMatch(/weighted|expected_value|expectedValue/)
  })

  it('handles an empty pipeline without inventing a currency', () => {
    const summary = summarisePipeline([], TODAY)
    expect(summary.open).toEqual({ count: 0, totals: [], withoutAmount: 0, stages: [] })
    expect(summary.overdue).toBe(0)
  })
})

describe('addDays', () => {
  it('works in UTC across a month end and a leap day', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
