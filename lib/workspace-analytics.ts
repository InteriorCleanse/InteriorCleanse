import { buildDemoDataset } from '@/lib/demo/seed'
import {
  computeMetrics,
  type MetricsInput,
  type MetricsResult,
  type NormalisedOrder,
  type NormalisedRefund,
  type NormalisedSpend,
  type Period,
} from '@/lib/metrics/engine'
import { money, subtract, sum, zero, type Money } from '@/lib/money'
import {
  bucketsFor,
  bucketStart,
  computeChange,
  defaultGranularity,
  resolveComparison,
  resolvePreset,
  type Change,
  type ComparisonKey,
  type Granularity,
  type PresetKey,
} from '@/lib/periods'
import type { PortfolioPoint } from '@/lib/charts/flow'

/**
 * Assembles everything a dashboard screen needs for one workspace and one
 * filter selection: current metrics, the comparison period, the time series,
 * and the derived diagram inputs.
 *
 * Command center and every drill-down read through this, so the number on a
 * KPI tile and the number in the table it links to cannot disagree. Where the
 * data comes from is decided in one place — a demo workspace uses the
 * deterministic dataset, a real one uses its imported records, and there is no
 * path where the two mix.
 */

/** Anchor for the demo dataset so demo figures never drift with the clock. */
export const DEMO_NOW = new Date('2026-03-01T00:00:00Z')

export type WorkspaceAnalytics = {
  hasData: boolean
  currency: string
  period: Period
  comparisonPeriod: Period | null
  metrics: MetricsResult
  comparisonMetrics: MetricsResult | null
  granularity: Granularity
  series: { labels: string[]; netRevenue: number[]; adSpend: number[]; grossProfit: number[] }
  portfolio: PortfolioPoint[]
  /** Cash-flow steps derived from the same components the profit chain uses. */
  cashSteps: { key: string; label: string; amount: number }[]
  sankey: {
    inflowLabel: string
    inflow: number
    outflows: { key: string; label: string; amount: number; tone: 'cost' | 'retained' }[]
  }
}

type Dataset = {
  orders: NormalisedOrder[]
  refunds: NormalisedRefund[]
  spend: NormalisedSpend[]
  currency: string
  syncedAt: Date | null
  system: string
}

function emptyDataset(currency: string): Dataset {
  return { orders: [], refunds: [], spend: [], currency, syncedAt: null, system: 'no source' }
}

function within(period: Period, date: Date): boolean {
  return date.getTime() >= period.start.getTime() && date.getTime() <= period.end.getTime()
}

function slice(dataset: Dataset, period: Period): MetricsInput {
  return {
    period,
    currency: dataset.currency,
    orders: dataset.orders.filter((o) => within(period, o.createdAt)),
    refunds: dataset.refunds.filter((r) => within(period, r.createdAt)),
    spend: dataset.spend.filter((s) => within(period, s.createdAt)),
    allocatedOverhead: null,
    allocationModel: 'blended',
    sources: [
      {
        system: dataset.system,
        lastSyncedAt: dataset.syncedAt,
        recordCount: dataset.orders.length,
      },
    ],
  }
}

export function loadWorkspaceAnalytics(options: {
  isDemo: boolean
  currency?: string
  preset: PresetKey
  comparison: ComparisonKey
  now?: Date
}): WorkspaceAnalytics {
  const currency = options.currency ?? 'USD'

  // The demo clock is fixed; a real workspace uses the caller's clock.
  const now = options.now ?? (options.isDemo ? DEMO_NOW : new Date())

  const dataset: Dataset = options.isDemo
    ? (() => {
        const d = buildDemoDataset({ endDate: DEMO_NOW, days: 120, currency })
        return {
          orders: d.orders,
          refunds: d.refunds,
          spend: d.spend,
          currency,
          syncedAt: DEMO_NOW,
          system: 'demo dataset',
        }
      })()
    : emptyDataset(currency)

  const period = resolvePreset(options.preset, now)
  const comparisonPeriod = resolveComparison(period, options.comparison)

  const input = slice(dataset, period)
  const metrics = computeMetrics(input)
  const comparisonMetrics = comparisonPeriod
    ? computeMetrics(slice(dataset, comparisonPeriod))
    : null

  const granularity = defaultGranularity(period)
  const series = buildSeries(dataset, period, granularity)

  return {
    hasData: dataset.orders.length > 0 || dataset.spend.length > 0,
    currency,
    period,
    comparisonPeriod,
    metrics,
    comparisonMetrics,
    granularity,
    series,
    portfolio: buildPortfolio(dataset, period, comparisonPeriod),
    cashSteps: buildCashSteps(input, metrics),
    sankey: buildSankey(input, metrics),
  }
}

// ── Time series ─────────────────────────────────────────────────────────────

function buildSeries(dataset: Dataset, period: Period, granularity: Granularity) {
  const buckets = bucketsFor(period, granularity)
  const index = new Map(buckets.map((b, i) => [b.getTime(), i]))

  const netRevenue = buckets.map(() => 0)
  const adSpend = buckets.map(() => 0)
  const grossProfit = buckets.map(() => 0)

  for (const order of dataset.orders) {
    if (!within(period, order.createdAt)) continue
    const i = index.get(bucketStart(order.createdAt, granularity).getTime())
    if (i === undefined) continue

    let net = order.shippingRevenue.minor
    let profit = order.shippingRevenue.minor
    for (const line of order.lines) {
      const lineNet = line.grossAmount.minor - line.discountAmount.minor
      net += lineNet
      profit += lineNet - (line.cogsAmount?.minor ?? 0) - (line.fulfillmentCost?.minor ?? 0)
    }
    netRevenue[i] = (netRevenue[i] ?? 0) + net
    grossProfit[i] = (grossProfit[i] ?? 0) + profit
  }

  for (const refund of dataset.refunds) {
    if (!within(period, refund.createdAt)) continue
    const i = index.get(bucketStart(refund.createdAt, granularity).getTime())
    if (i === undefined) continue
    netRevenue[i] = (netRevenue[i] ?? 0) - refund.amount.minor
    grossProfit[i] = (grossProfit[i] ?? 0) - refund.amount.minor
  }

  for (const s of dataset.spend) {
    if (!within(period, s.createdAt)) continue
    const i = index.get(bucketStart(s.createdAt, granularity).getTime())
    if (i === undefined) continue
    adSpend[i] = (adSpend[i] ?? 0) + s.amount.minor
  }

  return { labels: buckets.map((b) => formatBucket(b, granularity)), netRevenue, adSpend, grossProfit }
}

function formatBucket(date: Date, granularity: Granularity): string {
  if (granularity === 'month') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// ── Portfolio ───────────────────────────────────────────────────────────────

function productTotals(dataset: Dataset, period: Period) {
  const totals = new Map<string, { label: string; revenue: number; profit: number }>()

  for (const order of dataset.orders) {
    if (!within(period, order.createdAt)) continue
    for (const line of order.lines) {
      const entry = totals.get(line.productId) ?? {
        label: line.productName,
        revenue: 0,
        profit: 0,
      }
      const net = line.grossAmount.minor - line.discountAmount.minor
      entry.revenue += net
      entry.profit += net - (line.cogsAmount?.minor ?? 0) - (line.fulfillmentCost?.minor ?? 0)
      totals.set(line.productId, entry)
    }
  }

  return totals
}

function buildPortfolio(
  dataset: Dataset,
  period: Period,
  comparisonPeriod: Period | null,
): PortfolioPoint[] {
  const current = productTotals(dataset, period)
  const previous = comparisonPeriod ? productTotals(dataset, comparisonPeriod) : new Map()

  return Array.from(current.entries()).map(([productId, entry]) => {
    const prior = previous.get(productId)?.revenue ?? 0
    // Growth is undefined against a zero baseline; 0 is the honest neutral
    // placement here rather than an off-scale spike.
    const growth = prior === 0 ? 0 : (entry.revenue - prior) / Math.abs(prior)
    const margin = entry.revenue === 0 ? 0 : entry.profit / entry.revenue

    return { productId, label: entry.label, growth, margin, revenue: entry.revenue }
  })
}

// ── Diagram inputs ──────────────────────────────────────────────────────────

function componentTotals(input: MetricsInput) {
  const c = input.currency
  const cogs = sum(
    input.orders.flatMap((o) => o.lines.map((l) => l.cogsAmount ?? zero(c))),
    c,
  )
  const fulfillment = sum(
    input.orders.flatMap((o) => o.lines.map((l) => l.fulfillmentCost ?? zero(c))),
    c,
  )
  const fees = sum(
    input.orders.flatMap((o) => [o.paymentFees, o.marketplaceFees]),
    c,
  )
  const returns = sum(
    input.refunds.map((r) => r.returnCost ?? zero(c)),
    c,
  )
  const adSpend = sum(
    input.spend.map((s) => s.amount),
    c,
  )
  return { cogs, fulfillment, fees, returns, adSpend }
}

/**
 * Retained profit is the residual, not an independent figure. Computing it any
 * other way lets rounding put the diagram out of balance, and the layout
 * refuses to draw an unbalanced engine.
 */
function buildSankey(input: MetricsInput, metrics: MetricsResult) {
  const { cogs, fulfillment, fees, returns, adSpend } = componentTotals(input)
  const netRevenue = metrics.netRevenue.value

  const costs = [
    { key: 'cogs', label: 'Cost of goods', amount: cogs.minor, tone: 'cost' as const },
    { key: 'fulfillment', label: 'Fulfilment', amount: fulfillment.minor, tone: 'cost' as const },
    { key: 'fees', label: 'Fees', amount: fees.minor, tone: 'cost' as const },
    { key: 'returns', label: 'Return costs', amount: returns.minor, tone: 'cost' as const },
    { key: 'ads', label: 'Advertising', amount: adSpend.minor, tone: 'cost' as const },
  ]

  const totalCost = costs.reduce((total, c) => total + c.amount, 0)
  const retained = netRevenue.minor - totalCost

  return {
    inflowLabel: 'Net revenue',
    inflow: netRevenue.minor,
    outflows: [
      ...costs,
      // A negative residual means costs exceeded revenue. Clamp to zero so the
      // diagram stays balanced, and let the contribution-profit tile carry the
      // loss — a Sankey cannot draw a negative ribbon honestly.
      { key: 'retained', label: 'Retained profit', amount: Math.max(0, retained), tone: 'retained' as const },
    ].filter((o) => o.amount > 0),
  }
}

function buildCashSteps(input: MetricsInput, metrics: MetricsResult) {
  const { cogs, fulfillment, fees, returns, adSpend } = componentTotals(input)
  return [
    { key: 'revenue', label: 'Net revenue', amount: metrics.netRevenue.value.minor },
    { key: 'cogs', label: 'Cost of goods', amount: -cogs.minor },
    { key: 'fulfillment', label: 'Fulfilment', amount: -fulfillment.minor },
    { key: 'fees', label: 'Fees', amount: -fees.minor },
    { key: 'returns', label: 'Returns', amount: -returns.minor },
    { key: 'ads', label: 'Advertising', amount: -adSpend.minor },
  ].filter((step) => step.amount !== 0)
}

// ── Comparison helpers ──────────────────────────────────────────────────────

function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  if (typeof value === 'object' && 'minor' in (value as Money)) return (value as Money).minor
  return null
}

/** Change for one metric key between the current and comparison result. */
export function changeFor(
  analytics: WorkspaceAnalytics,
  key: keyof MetricsResult,
): Change | null {
  if (!analytics.comparisonMetrics) return null

  const current = numeric((analytics.metrics[key] as { value?: unknown })?.value)
  const previous = numeric((analytics.comparisonMetrics[key] as { value?: unknown })?.value)
  if (current === null || previous === null) return null

  return computeChange(current, previous)
}

/** Absolute difference as Money, for tables that show the delta in currency. */
export function moneyDelta(current: Money, previous: Money): Money {
  return subtract(current, money(previous.minor, current.currency))
}
