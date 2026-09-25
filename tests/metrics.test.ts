import { describe, expect, it } from 'vitest'
import { money, zero, type Money } from '@/lib/money'
import {
  computeMetrics,
  type MetricsInput,
  type NormalisedOrder,
  type NormalisedSpend,
} from '@/lib/metrics/engine'
import { allocateAdSpend, allocatedTotal } from '@/lib/metrics/allocation'

const USD = 'USD'
const m = (n: number): Money => money(n, USD)

const PERIOD = {
  start: new Date('2026-01-01T00:00:00Z'),
  end: new Date('2026-01-31T23:59:59Z'),
  label: 'January 2026',
  timezone: 'UTC',
}

const SOURCE = { system: 'csv_import', lastSyncedAt: new Date('2026-02-01T00:00:00Z'), recordCount: 2 }

function order(over: Partial<NormalisedOrder> = {}): NormalisedOrder {
  return {
    id: 'o1',
    createdAt: new Date('2026-01-10T00:00:00Z'),
    currency: USD,
    lines: [
      {
        productId: 'p1',
        productName: 'Candle',
        quantity: 2,
        grossAmount: m(10_000),
        discountAmount: m(1_000),
        cogsAmount: m(3_000),
        fulfillmentCost: m(500),
      },
    ],
    shippingRevenue: m(500),
    taxAmount: m(800),
    paymentFees: m(300),
    marketplaceFees: zero(USD),
    isTest: false,
    customerId: 'c1',
    isNewCustomer: true,
    ...over,
  }
}

function input(over: Partial<MetricsInput> = {}): MetricsInput {
  return {
    period: PERIOD,
    currency: USD,
    orders: [order()],
    refunds: [],
    spend: [],
    allocatedOverhead: null,
    allocationModel: 'blended',
    sources: [SOURCE],
    ...over,
  }
}

describe('the dictionary is implemented literally', () => {
  it('computes the revenue and profit chain', () => {
    const r = computeMetrics(input())

    // gross 10000; net = 10000 - 1000 discount - 0 refund + 500 shipping
    expect(r.grossSales.value.minor).toBe(10_000)
    expect(r.netRevenue.value.minor).toBe(9_500)
    // gross profit = 9500 - 3000 cogs - 500 fulfilment
    expect(r.grossProfit.value.minor).toBe(6_000)
    // contribution = 6000 - 300 fees - 0 returns - 0 ad spend
    expect(r.contributionProfit.value.minor).toBe(5_700)
  })

  it('excludes tax from net revenue', () => {
    const r = computeMetrics(input())
    // Tax of 800 is present on the order and must not appear anywhere.
    expect(r.netRevenue.value.minor).toBe(9_500)
    expect(r.netRevenue.exclusions).toContain('Tax')
  })

  it('subtracts refunds and return costs in the right places', () => {
    const r = computeMetrics(
      input({
        refunds: [
          {
            id: 'r1',
            orderId: 'o1',
            createdAt: new Date('2026-01-20T00:00:00Z'),
            amount: m(2_000),
            returnCost: m(400),
          },
        ],
      }),
    )
    expect(r.netRevenue.value.minor).toBe(7_500) // refund hits net revenue
    expect(r.grossProfit.value.minor).toBe(4_000)
    expect(r.contributionProfit.value.minor).toBe(3_300) // return cost hits contribution
    expect(r.refundRate.value).toBeCloseTo(0.2)
  })

  it('estimates operating profit only when overhead is configured', () => {
    const without = computeMetrics(input())
    expect(without.operatingProfitEstimate.value).toBeNull()
    expect(without.operatingProfitEstimate.unavailableReason).toBe('No overhead rule configured')

    const withOverhead = computeMetrics(input({ allocatedOverhead: m(1_000) }))
    expect(withOverhead.operatingProfitEstimate.value?.minor).toBe(4_700)
  })
})

describe('undefined is null, never zero and never NaN', () => {
  it('reports ROAS and MER as unavailable with no ad spend', () => {
    const r = computeMetrics(input())
    expect(r.roas.value).toBeNull()
    expect(r.mer.value).toBeNull()
    expect(r.roas.unavailableReason).toBe('No ad spend in this period')
  })

  it('reports AOV and CAC as unavailable with no qualifying denominator', () => {
    const r = computeMetrics(input({ orders: [] }))
    expect(r.aov.value).toBeNull()
    expect(r.cac.value).toBeNull()
    expect(r.orderCount.value).toBe(0)
  })

  it('never produces NaN or Infinity on an entirely empty period', () => {
    const r = computeMetrics(input({ orders: [], refunds: [], spend: [] }))
    for (const key of ['roas', 'mer', 'refundRate', 'contributionMargin'] as const) {
      const value = r[key].value
      expect(value === null || Number.isFinite(value)).toBe(true)
    }
  })
})

describe('test orders', () => {
  it('excludes them from order count and AOV but warns', () => {
    const r = computeMetrics(input({ orders: [order(), order({ id: 'o2', isTest: true })] }))
    expect(r.orderCount.value).toBe(1)
    expect(r.warnings.some((w) => w.includes('test order'))).toBe(true)
  })
})

describe('data quality', () => {
  it('warns when cost of goods is missing rather than assuming zero cost', () => {
    const r = computeMetrics(
      input({
        orders: [
          order({
            lines: [
              {
                productId: 'p1',
                productName: 'Candle',
                quantity: 1,
                grossAmount: m(5_000),
                discountAmount: zero(USD),
                cogsAmount: null,
                fulfillmentCost: null,
              },
            ],
          }),
        ],
      }),
    )
    expect(r.warnings.some((w) => w.includes('cost of goods'))).toBe(true)
    // The figure is still produced, but flagged as overstated.
    expect(r.grossProfit.value.minor).toBe(5_500)
  })
})

describe('provenance', () => {
  it('attaches formula, period, currency, sources, and drill-down to every metric', () => {
    const r = computeMetrics(input())
    for (const key of ['grossSales', 'netRevenue', 'grossProfit', 'aov', 'roas'] as const) {
      const metric = r[key]
      expect(metric.formula.length).toBeGreaterThan(0)
      expect(metric.period.label).toBe('January 2026')
      expect(metric.sources.length).toBeGreaterThan(0)
      expect(metric.drillDown).toBeTruthy()
    }
  })

  it('reports freshness as the oldest contributing sync, not the newest', () => {
    const stale = { system: 'shopify', lastSyncedAt: new Date('2026-01-05T00:00:00Z'), recordCount: 1 }
    const r = computeMetrics(input({ sources: [SOURCE, stale] }))
    expect(r.netRevenue.freshestAt).toEqual(new Date('2026-01-05T00:00:00Z'))
  })
})

// ── Allocation ──────────────────────────────────────────────────────────────

const spend = (over: Partial<NormalisedSpend> = {}): NormalisedSpend => ({
  id: 's1',
  campaignId: 'camp1',
  productId: null,
  createdAt: new Date('2026-01-05T00:00:00Z'),
  amount: m(10_000),
  attributedRevenue: m(30_000),
  newCustomers: 5,
  ...over,
})

describe('ad spend allocation', () => {
  it('conserves spend exactly: allocated + unallocated = total', () => {
    for (const model of [
      'direct_campaign',
      'proportional_revenue',
      'blended',
    ] as const) {
      const result = allocateAdSpend({
        model,
        spend: [
          { id: 's1', campaignId: 'c1', amount: m(3_333), productId: 'p1' },
          { id: 's2', campaignId: 'c2', amount: m(6_667), productId: null },
        ],
        products: [
          { productId: 'p1', netRevenue: m(7_000) },
          { productId: 'p2', netRevenue: m(3_000) },
        ],
        currency: USD,
      })
      expect(allocatedTotal(result).minor + result.unallocated.minor).toBe(10_000)
      expect(result.totalSpend.minor).toBe(10_000)
    }
  })

  it('leaves unmapped spend unallocated under a direct model', () => {
    const result = allocateAdSpend({
      model: 'direct_campaign',
      spend: [
        { id: 's1', campaignId: 'c1', amount: m(4_000), productId: 'p1' },
        { id: 's2', campaignId: 'c2', amount: m(6_000), productId: null },
      ],
      products: [{ productId: 'p1', netRevenue: m(10_000) }],
      currency: USD,
    })
    expect(result.byProduct.get('p1')?.minor).toBe(4_000)
    expect(result.unallocated.minor).toBe(6_000)
    expect(result.allocatedShare).toBeCloseTo(0.4)
  })

  it('spreads the remainder by revenue share under blended', () => {
    const result = allocateAdSpend({
      model: 'blended',
      spend: [{ id: 's1', campaignId: 'c1', amount: m(10_000), productId: null }],
      products: [
        { productId: 'p1', netRevenue: m(7_000) },
        { productId: 'p2', netRevenue: m(3_000) },
      ],
      currency: USD,
    })
    expect(result.byProduct.get('p1')?.minor).toBe(7_000)
    expect(result.byProduct.get('p2')?.minor).toBe(3_000)
    expect(result.unallocated.minor).toBe(0)
  })

  it('refuses to invent a loss when no product has revenue', () => {
    const result = allocateAdSpend({
      model: 'proportional_revenue',
      spend: [{ id: 's1', campaignId: 'c1', amount: m(10_000), productId: null }],
      products: [
        { productId: 'p1', netRevenue: zero(USD) },
        { productId: 'p2', netRevenue: zero(USD) },
      ],
      currency: USD,
    })
    // Spending with zero sales must show as unallocated, not as a fake split.
    expect(result.unallocated.minor).toBe(10_000)
    expect(allocatedTotal(result).minor).toBe(0)
  })

  it('treats spend mapped to an unknown product as unallocated', () => {
    const result = allocateAdSpend({
      model: 'direct_campaign',
      spend: [{ id: 's1', campaignId: 'c1', amount: m(5_000), productId: 'ghost' }],
      products: [{ productId: 'p1', netRevenue: m(1_000) }],
      currency: USD,
    })
    expect(result.byProduct.size).toBe(0)
    expect(result.unallocated.minor).toBe(5_000)
  })

  it('downgrades confidence when a high-confidence model places little spend', () => {
    const result = allocateAdSpend({
      model: 'direct_campaign',
      spend: [
        { id: 's1', campaignId: 'c1', amount: m(1_000), productId: 'p1' },
        { id: 's2', campaignId: 'c2', amount: m(9_000), productId: null },
      ],
      products: [{ productId: 'p1', netRevenue: m(1_000) }],
      currency: USD,
    })
    expect(result.confidence).toBe('medium')
    expect(result.explanation).toContain('unallocated')
  })

  it('reports no spend honestly', () => {
    const result = allocateAdSpend({
      model: 'blended',
      spend: [],
      products: [{ productId: 'p1', netRevenue: m(1_000) }],
      currency: USD,
    })
    expect(result.confidence).toBe('none')
    expect(result.allocatedShare).toBeNull()
  })
})

describe('metrics with advertising', () => {
  it('computes ROAS, MER, and CAC from spend', () => {
    const r = computeMetrics(input({ spend: [spend()] }))
    expect(r.adSpend.value.minor).toBe(10_000)
    expect(r.roas.value).toBeCloseTo(3) // 30000 attributed / 10000 spend
    expect(r.mer.value).toBeCloseTo(0.95) // 9500 net / 10000 spend
    expect(r.cac.value?.minor).toBe(10_000) // 1 new customer
  })

  it('subtracts ad spend from contribution profit', () => {
    const r = computeMetrics(input({ spend: [spend({ amount: m(1_000) })] }))
    expect(r.contributionProfit.value.minor).toBe(4_700) // 5700 - 1000
  })
})
