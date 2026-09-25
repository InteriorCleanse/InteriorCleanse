import {
  add,
  divideByCount,
  type Money,
  money,
  ratio,
  subtract,
  sum,
  zero,
} from '@/lib/money'
import {
  allocateAdSpend,
  type AllocationModel,
  type AllocationResult,
} from './allocation'

/**
 * The metrics engine.
 *
 * Implements docs/METRICS_DICTIONARY.md exactly. Two design rules carry the
 * product's honesty guarantee:
 *
 *   1. Every result is a `Metric`, not a bare number. It carries its formula,
 *      the records it was computed from, the time range, the currency, and how
 *      fresh the inputs are. A figure that cannot show its work does not ship,
 *      so the type makes it impossible to produce one that can't.
 *
 *   2. Anything undefined is `null`, never 0 and never NaN. Zero ad spend means
 *      "ROAS not applicable", not "ROAS is zero" — those read very differently
 *      to someone deciding where to put money.
 */

export type MetricKind = 'money' | 'ratio' | 'count' | 'percent'

export type DataSource = {
  /** e.g. 'stripe', 'csv_import', 'shopify'. */
  system: string
  /** When the underlying records were last synced. Null when never. */
  lastSyncedAt: Date | null
  recordCount: number
}

export type Period = {
  start: Date
  end: Date
  label: string
  timezone: string
}

export type Metric<T = Money | number | null> = {
  key: string
  label: string
  kind: MetricKind
  value: T
  currency: string | null
  /** Plain-English formula shown in the tooltip. */
  formula: string
  /** What is deliberately excluded, so the number is not misread. */
  exclusions: string[]
  period: Period
  sources: DataSource[]
  /** Oldest sync across contributing sources — the figure is only as fresh as this. */
  freshestAt: Date | null
  /** Route for the drill-down to underlying records. */
  drillDown: string | null
  /** Set when the value is null, explaining why rather than showing a dash. */
  unavailableReason?: string
}

// ── Normalised inputs ───────────────────────────────────────────────────────
// The engine works over these shapes, never over a vendor payload. Connectors
// normalise into them, which is what keeps the calculations vendor-neutral.

export type OrderLine = {
  productId: string
  productName: string
  quantity: number
  grossAmount: Money
  discountAmount: Money
  /** Cost of goods for this line, when a cost is known. */
  cogsAmount: Money | null
  fulfillmentCost: Money | null
}

export type NormalisedOrder = {
  id: string
  createdAt: Date
  currency: string
  lines: OrderLine[]
  shippingRevenue: Money
  taxAmount: Money
  paymentFees: Money
  marketplaceFees: Money
  /** True for test-mode orders; excluded from AOV and order counts. */
  isTest: boolean
  customerId: string | null
  isNewCustomer: boolean
}

export type NormalisedRefund = {
  id: string
  orderId: string
  createdAt: Date
  amount: Money
  returnCost: Money | null
}

export type NormalisedSpend = {
  id: string
  campaignId: string
  productId: string | null
  createdAt: Date
  amount: Money
  attributedRevenue: Money | null
  newCustomers: number
}

export type MetricsInput = {
  period: Period
  currency: string
  orders: readonly NormalisedOrder[]
  refunds: readonly NormalisedRefund[]
  spend: readonly NormalisedSpend[]
  /** Overhead allocated to this period by the tenant's configured rule. */
  allocatedOverhead: Money | null
  allocationModel: AllocationModel
  sources: DataSource[]
}

function freshest(sources: DataSource[]): Date | null {
  const stamps = sources.map((s) => s.lastSyncedAt).filter((d): d is Date => d !== null)
  if (stamps.length === 0) return null
  // The oldest sync bounds how fresh the combined figure really is.
  return stamps.reduce((oldest, d) => (d < oldest ? d : oldest))
}

function metric<T>(base: Omit<Metric<T>, 'freshestAt'> & { sources: DataSource[] }): Metric<T> {
  return { ...base, freshestAt: freshest(base.sources) }
}

// ── Component totals ────────────────────────────────────────────────────────

function grossSalesOf(input: MetricsInput): Money {
  return sum(
    input.orders.flatMap((o) => o.lines.map((l) => l.grossAmount)),
    input.currency,
  )
}

function discountsOf(input: MetricsInput): Money {
  return sum(
    input.orders.flatMap((o) => o.lines.map((l) => l.discountAmount)),
    input.currency,
  )
}

function refundsOf(input: MetricsInput): Money {
  return sum(
    input.refunds.map((r) => r.amount),
    input.currency,
  )
}

function shippingRevenueOf(input: MetricsInput): Money {
  return sum(
    input.orders.map((o) => o.shippingRevenue),
    input.currency,
  )
}

function cogsOf(input: MetricsInput): { total: Money; missingLines: number } {
  let missing = 0
  const amounts: Money[] = []
  for (const order of input.orders) {
    for (const line of order.lines) {
      if (line.cogsAmount === null) missing += 1
      else amounts.push(line.cogsAmount)
    }
  }
  return { total: sum(amounts, input.currency), missingLines: missing }
}

function fulfillmentOf(input: MetricsInput): Money {
  return sum(
    input.orders.flatMap((o) =>
      o.lines.map((l) => l.fulfillmentCost ?? zero(input.currency)),
    ),
    input.currency,
  )
}

function feesOf(input: MetricsInput): Money {
  const payment = sum(
    input.orders.map((o) => o.paymentFees),
    input.currency,
  )
  const marketplace = sum(
    input.orders.map((o) => o.marketplaceFees),
    input.currency,
  )
  return add(payment, marketplace)
}

function returnCostsOf(input: MetricsInput): Money {
  return sum(
    input.refunds.map((r) => r.returnCost ?? zero(input.currency)),
    input.currency,
  )
}

function adSpendOf(input: MetricsInput): Money {
  return sum(
    input.spend.map((s) => s.amount),
    input.currency,
  )
}

function attributedRevenueOf(input: MetricsInput): Money {
  return sum(
    input.spend.map((s) => s.attributedRevenue ?? zero(input.currency)),
    input.currency,
  )
}

/** Non-test orders only — a test order inflates counts and deflates AOV. */
function completedOrders(input: MetricsInput): readonly NormalisedOrder[] {
  return input.orders.filter((o) => !o.isTest)
}

// ── The dictionary, implemented ─────────────────────────────────────────────

export type MetricsResult = {
  grossSales: Metric<Money>
  netRevenue: Metric<Money>
  grossProfit: Metric<Money>
  contributionProfit: Metric<Money>
  operatingProfitEstimate: Metric<Money | null>
  adSpend: Metric<Money>
  roas: Metric<number | null>
  mer: Metric<number | null>
  cac: Metric<Money | null>
  aov: Metric<Money | null>
  refundRate: Metric<number | null>
  contributionMargin: Metric<number | null>
  orderCount: Metric<number>
  unitsSold: Metric<number>
  allocation: AllocationResult
  /** Anything that made a figure partial, shown as a data-quality warning. */
  warnings: string[]
}

export function computeMetrics(input: MetricsInput): MetricsResult {
  const { currency, period, sources } = input
  const base = { period, sources, currency }

  const grossSales = grossSalesOf(input)
  const discounts = discountsOf(input)
  const refunds = refundsOf(input)
  const shipping = shippingRevenueOf(input)
  const { total: cogs, missingLines } = cogsOf(input)
  const fulfillment = fulfillmentOf(input)
  const fees = feesOf(input)
  const returnCosts = returnCostsOf(input)
  const adSpend = adSpendOf(input)
  const attributedRevenue = attributedRevenueOf(input)

  const netRevenue = add(subtract(subtract(grossSales, discounts), refunds), shipping)
  const grossProfit = subtract(subtract(netRevenue, cogs), fulfillment)
  const contributionProfit = subtract(
    subtract(subtract(grossProfit, fees), returnCosts),
    adSpend,
  )

  const completed = completedOrders(input)
  const orderCount = completed.length
  const unitsSold = input.orders.reduce(
    (total, o) => total + o.lines.reduce((n, l) => n + l.quantity, 0),
    0,
  )
  const newCustomers = completed.filter((o) => o.isNewCustomer).length

  const warnings: string[] = []
  if (missingLines > 0) {
    warnings.push(
      `${missingLines} order line${missingLines === 1 ? '' : 's'} have no cost of goods recorded, so profit figures are overstated. Add costs under product settings.`,
    )
  }
  if (input.allocatedOverhead === null) {
    warnings.push('No overhead rule is configured, so operating profit cannot be estimated.')
  }
  const testCount = input.orders.length - completed.length
  if (testCount > 0) {
    warnings.push(`${testCount} test order${testCount === 1 ? '' : 's'} excluded from order count and AOV.`)
  }

  const allocation = allocateAdSpend({
    model: input.allocationModel,
    spend: input.spend.map((s) => ({
      id: s.id,
      campaignId: s.campaignId,
      amount: s.amount,
      productId: s.productId,
    })),
    products: productRevenues(input),
    currency,
  })
  if (allocation.unallocated.minor !== 0) {
    warnings.push(
      `Some advertising spend could not be attributed to a product and is shown as unallocated.`,
    )
  }

  return {
    grossSales: metric({
      ...base,
      key: 'gross_sales',
      label: 'Gross sales',
      kind: 'money',
      value: grossSales,
      formula: 'Sum of line value before discounts, refunds, tax, and shipping',
      exclusions: ['Discounts', 'Refunds', 'Tax', 'Shipping'],
      drillDown: '/app/revenue?breakdown=orders',
    }),

    netRevenue: metric({
      ...base,
      key: 'net_revenue',
      label: 'Net revenue',
      kind: 'money',
      value: netRevenue,
      formula: 'Gross sales − discounts − refunds + recognised shipping revenue',
      exclusions: ['Tax'],
      drillDown: '/app/revenue',
    }),

    grossProfit: metric({
      ...base,
      key: 'gross_profit',
      label: 'Gross profit',
      kind: 'money',
      value: grossProfit,
      formula: 'Net revenue − cost of goods − direct fulfilment cost',
      exclusions: ['Advertising', 'Payment fees', 'Overhead'],
      drillDown: '/app/products',
    }),

    contributionProfit: metric({
      ...base,
      key: 'contribution_profit',
      label: 'Contribution profit',
      kind: 'money',
      value: contributionProfit,
      formula:
        'Gross profit − payment fees − marketplace fees − return costs − advertising spend',
      exclusions: ['Overhead'],
      drillDown: '/app/products',
    }),

    operatingProfitEstimate: metric({
      ...base,
      key: 'operating_profit_estimate',
      label: 'Operating profit (estimate)',
      kind: 'money',
      value:
        input.allocatedOverhead === null
          ? null
          : subtract(contributionProfit, input.allocatedOverhead),
      formula: 'Contribution profit − allocated overhead',
      exclusions: [],
      drillDown: '/app/cash-flow',
      ...(input.allocatedOverhead === null
        ? { unavailableReason: 'No overhead rule configured' }
        : {}),
    }),

    adSpend: metric({
      ...base,
      key: 'ad_spend',
      label: 'Ad spend',
      kind: 'money',
      value: adSpend,
      formula: 'Total spend across connected advertising sources',
      exclusions: [],
      drillDown: '/app/advertising',
    }),

    roas: metric({
      ...base,
      key: 'roas',
      label: 'ROAS',
      kind: 'ratio',
      value: ratio(attributedRevenue, adSpend),
      currency: null,
      formula: 'Attributed revenue ÷ ad spend',
      exclusions: ['Unattributed revenue'],
      drillDown: '/app/advertising',
      ...(adSpend.minor === 0 ? { unavailableReason: 'No ad spend in this period' } : {}),
    }),

    mer: metric({
      ...base,
      key: 'mer',
      label: 'MER',
      kind: 'ratio',
      value: ratio(netRevenue, adSpend),
      currency: null,
      formula: 'Total net revenue ÷ total ad spend',
      exclusions: [],
      drillDown: '/app/advertising',
      ...(adSpend.minor === 0 ? { unavailableReason: 'No ad spend in this period' } : {}),
    }),

    cac: metric({
      ...base,
      key: 'cac',
      label: 'CAC',
      kind: 'money',
      value: divideByCount(adSpend, newCustomers),
      formula: 'Acquisition spend ÷ new customers acquired',
      exclusions: ['Returning customers'],
      drillDown: '/app/customers',
      ...(newCustomers === 0
        ? { unavailableReason: 'No new customers in this period' }
        : {}),
    }),

    aov: metric({
      ...base,
      key: 'aov',
      label: 'AOV',
      kind: 'money',
      value: divideByCount(netRevenue, orderCount),
      formula: 'Net revenue ÷ completed non-test orders',
      exclusions: ['Test orders'],
      drillDown: '/app/revenue?breakdown=orders',
      ...(orderCount === 0 ? { unavailableReason: 'No completed orders in this period' } : {}),
    }),

    refundRate: metric({
      ...base,
      key: 'refund_rate',
      label: 'Refund rate',
      kind: 'percent',
      value: ratio(refunds, grossSales),
      currency: null,
      formula: 'Refunded order value ÷ gross order value',
      exclusions: [],
      drillDown: '/app/revenue?breakdown=refunds',
      ...(grossSales.minor === 0 ? { unavailableReason: 'No sales in this period' } : {}),
    }),

    contributionMargin: metric({
      ...base,
      key: 'contribution_margin',
      label: 'Contribution margin',
      kind: 'percent',
      value: ratio(contributionProfit, netRevenue),
      currency: null,
      formula: 'Contribution profit ÷ net revenue',
      exclusions: [],
      drillDown: '/app/products',
      ...(netRevenue.minor === 0 ? { unavailableReason: 'No revenue in this period' } : {}),
    }),

    orderCount: metric({
      ...base,
      key: 'order_count',
      label: 'Orders',
      kind: 'count',
      value: orderCount,
      currency: null,
      formula: 'Count of completed non-test orders',
      exclusions: ['Test orders'],
      drillDown: '/app/revenue?breakdown=orders',
    }),

    unitsSold: metric({
      ...base,
      key: 'units_sold',
      label: 'Units sold',
      kind: 'count',
      value: unitsSold,
      currency: null,
      formula: 'Sum of quantity across all order lines',
      exclusions: [],
      drillDown: '/app/products',
    }),

    allocation,
    warnings,
  }
}

/** Net revenue per product, used as the weight for proportional allocation. */
export function productRevenues(input: MetricsInput) {
  const byProduct = new Map<string, Money>()

  for (const order of input.orders) {
    for (const line of order.lines) {
      const current = byProduct.get(line.productId) ?? zero(input.currency)
      const lineNet = subtract(line.grossAmount, line.discountAmount)
      byProduct.set(line.productId, money(current.minor + lineNet.minor, input.currency))
    }
  }

  return Array.from(byProduct.entries()).map(([productId, netRevenue]) => ({
    productId,
    netRevenue,
  }))
}
