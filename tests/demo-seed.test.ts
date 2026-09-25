import { describe, expect, it } from 'vitest'
import { buildDemoDataset, DEMO_PRODUCTS } from '@/lib/demo/seed'
import { computeMetrics } from '@/lib/metrics/engine'
import { allocateAdSpend, allocatedTotal } from '@/lib/metrics/allocation'
import { money } from '@/lib/money'

const END = new Date('2026-03-01T00:00:00Z')
const build = () => buildDemoDataset({ endDate: END, days: 56 })

describe('determinism', () => {
  it('produces identical data on every run', () => {
    const a = build()
    const b = build()
    expect(a.orders.length).toBe(b.orders.length)
    expect(JSON.stringify(a.orders)).toBe(JSON.stringify(b.orders))
    expect(JSON.stringify(a.spend)).toBe(JSON.stringify(b.spend))
  })

  it('changes with a different seed', () => {
    const a = buildDemoDataset({ endDate: END, days: 56, seed: 1 })
    const b = buildDemoDataset({ endDate: END, days: 56, seed: 2 })
    expect(JSON.stringify(a.orders)).not.toBe(JSON.stringify(b.orders))
  })
})

describe('internal consistency', () => {
  it('generates a meaningful volume of data', () => {
    const data = build()
    expect(data.orders.length).toBeGreaterThan(150)
    expect(data.spend.length).toBe(56 * 2)
  })

  it('ties every refund to a real order', () => {
    const data = build()
    const orderIds = new Set(data.orders.map((o) => o.id))
    for (const refund of data.refunds) {
      expect(orderIds.has(refund.orderId)).toBe(true)
    }
  })

  it('references only real products in orders and spend', () => {
    const data = build()
    const productIds = new Set(DEMO_PRODUCTS.map((p) => p.id))
    for (const order of data.orders) {
      for (const line of order.lines) expect(productIds.has(line.productId)).toBe(true)
    }
    for (const s of data.spend) {
      if (s.productId) expect(productIds.has(s.productId)).toBe(true)
    }
  })

  it('keeps unit cost below price on every product', () => {
    // A demo showing negative unit margin teaches distrust of the product.
    for (const product of DEMO_PRODUCTS) {
      expect(product.costMinor).toBeLessThan(product.priceMinor)
    }
  })

  it('marks a first-time customer new exactly once', () => {
    const data = build()
    const seen = new Set<string>()
    for (const order of data.orders) {
      if (order.isNewCustomer) {
        expect(seen.has(order.customerId!)).toBe(false)
        seen.add(order.customerId!)
      }
    }
  })
})

describe('feeding the metrics engine', () => {
  it('produces a coherent, profitable-but-imperfect picture', () => {
    const data = build()
    const result = computeMetrics({
      period: { start: data.periodStart, end: data.periodEnd, label: 'Demo', timezone: 'UTC' },
      currency: data.currency,
      orders: data.orders,
      refunds: data.refunds,
      spend: data.spend,
      allocatedOverhead: null,
      allocationModel: 'blended',
      sources: [{ system: 'demo', lastSyncedAt: END, recordCount: data.orders.length }],
    })

    expect(result.netRevenue.value.minor).toBeGreaterThan(0)
    expect(result.grossProfit.value.minor).toBeGreaterThan(0)
    expect(result.orderCount.value).toBe(data.orders.length)
    expect(result.roas.value).not.toBeNull()

    // Refund rate should look like a real shop, not 0% or 50%.
    expect(result.refundRate.value!).toBeGreaterThan(0)
    expect(result.refundRate.value!).toBeLessThan(0.15)

    // Blended spreads the brand campaign across products, so nothing is left
    // unallocated. That is the model working, not a gap.
    expect(result.allocation.unallocated.minor).toBe(0)
    expect(result.allocation.totalSpend.minor).toBeGreaterThan(0)
  })

  it('leaves the brand campaign unallocated under a direct model', () => {
    // The demo deliberately includes spend that no direct mapping can place,
    // so the allocation UI has a real unallocated case to display.
    const data = build()
    const result = allocateAdSpend({
      model: 'direct_campaign',
      spend: data.spend.map((s) => ({
        id: s.id,
        campaignId: s.campaignId,
        amount: s.amount,
        productId: s.productId,
      })),
      products: DEMO_PRODUCTS.map((p) => ({
        productId: p.id,
        netRevenue: money(10_000, data.currency),
      })),
      currency: data.currency,
    })

    expect(result.unallocated.minor).toBeGreaterThan(0)
    expect(result.byProduct.get('demo-candle')!.minor).toBeGreaterThan(0)
    expect(allocatedTotal(result).minor + result.unallocated.minor).toBe(
      result.totalSpend.minor,
    )
  })
})
