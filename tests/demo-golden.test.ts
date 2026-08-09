import { describe, expect, it } from 'vitest'
import { buildDemoDataset } from '@/lib/demo/seed'
import { computeMetrics } from '@/lib/metrics/engine'
import { formatMoney } from '@/lib/money'

/**
 * Golden snapshot of the demo workspace.
 *
 * The demo dataset is deterministic, so these figures are fixed. Pinning them
 * means any change to the metrics engine that silently moves a number — a
 * reordered subtraction, a rounding-mode change — fails here instead of
 * quietly restating what the product shows every prospect.
 */
const END = new Date('2026-03-01T00:00:00Z')

function golden() {
  const d = buildDemoDataset({ endDate: END, days: 56 })
  return computeMetrics({
    period: { start: d.periodStart, end: d.periodEnd, label: 'Last 8 weeks', timezone: 'UTC' },
    currency: d.currency,
    orders: d.orders,
    refunds: d.refunds,
    spend: d.spend,
    allocatedOverhead: null,
    allocationModel: 'blended',
    sources: [{ system: 'demo dataset', lastSyncedAt: END, recordCount: d.orders.length }],
  })
}

describe('demo workspace golden figures', () => {
  it('matches the pinned snapshot', () => {
    const r = golden()
    expect({
      orders: r.orderCount.value,
      units: r.unitsSold.value,
      netRevenue: formatMoney(r.netRevenue.value),
      grossProfit: formatMoney(r.grossProfit.value),
      contributionProfit: formatMoney(r.contributionProfit.value),
      adSpend: formatMoney(r.adSpend.value),
      roas: r.roas.value?.toFixed(2),
      mer: r.mer.value?.toFixed(2),
      aov: r.aov.value ? formatMoney(r.aov.value) : null,
      cac: r.cac.value ? formatMoney(r.cac.value) : null,
      refundRatePct: (r.refundRate.value! * 100).toFixed(2),
      contributionMarginPct: (r.contributionMargin.value! * 100).toFixed(2),
      allocationModel: r.allocation.model,
      allocationConfidence: r.allocation.confidence,
      unallocated: formatMoney(r.allocation.unallocated),
    }).toMatchSnapshot()
  })

  it('conserves ad spend exactly through allocation', () => {
    const r = golden()
    const allocated = Array.from(r.allocation.byProduct.values()).reduce(
      (sum, v) => sum + v.minor,
      0,
    )
    expect(allocated + r.allocation.unallocated.minor).toBe(r.allocation.totalSpend.minor)
  })

  it('shows a business that is plausibly real', () => {
    const r = golden()
    // Profitable at the gross line, and margin in a range an operator would
    // recognise rather than a suspiciously round or impossible number.
    expect(r.grossProfit.value.minor).toBeGreaterThan(0)
    expect(r.contributionMargin.value!).toBeGreaterThan(-0.5)
    expect(r.contributionMargin.value!).toBeLessThan(0.8)
    expect(r.roas.value!).toBeGreaterThan(0.5)
    expect(r.roas.value!).toBeLessThan(6)
  })
})
