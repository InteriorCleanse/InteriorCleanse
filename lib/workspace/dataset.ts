import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalisedOrder, NormalisedRefund, NormalisedSpend } from '@/lib/metrics/engine'
import { money, type Money } from '@/lib/money'

/**
 * A real workspace's records, in the shape the metrics engine reads.
 *
 * This is the join between the commerce tables and the engine that the demo
 * dataset has always had and a real workspace did not. Two halves, kept apart
 * so each can be tested on its own:
 *
 *   - `datasetFromRows` is pure. Rows in, normalised records out, with every
 *     decision about what is excluded made explicit and counted.
 *   - `loadWorkspaceDataset` reads the rows through whatever client the caller
 *     holds. A page or the assistant route hands in the person's own client,
 *     so RLS decides what is visible; the owner console and the scheduled
 *     sweep hand in the service role *after* their own gates. The loader never
 *     chooses a client and never takes an organization id from a request body.
 *
 * What is deliberately left out, and why:
 *
 *   - **Orders in another currency.** The engine refuses to add money across
 *     currencies, and so does this. They are counted in `excluded` so the
 *     page can say "12 orders in EUR were not included" rather than quietly
 *     reporting a smaller business.
 *   - **Test orders.** Filtered at the query, not in the engine, because a
 *     workspace with a busy test mode would otherwise spend its row budget on
 *     records that count for nothing.
 *   - **Expenses that are not advertising.** Rent is a cost, but it is not ad
 *     spend, and ROAS over rent is a number nobody asked for. Expense rows
 *     whose category reads as advertising or marketing become spend with no
 *     product attached, which the allocation model reports as unallocated —
 *     the honest answer when a CSV did not say which product a campaign sold.
 */

export type Dataset = {
  orders: NormalisedOrder[]
  refunds: NormalisedRefund[]
  spend: NormalisedSpend[]
  currency: string
  syncedAt: Date | null
  /** Which system the records came from, for the provenance line. */
  system: string
  /** What was read but not included, so the page can say so. */
  excluded: { foreignCurrencyOrders: number }
  /** True when the row cap was reached and older records were not loaded. */
  truncated: boolean
}

export function emptyDataset(currency: string): Dataset {
  return {
    orders: [],
    refunds: [],
    spend: [],
    currency,
    syncedAt: null,
    system: 'no source',
    excluded: { foreignCurrencyOrders: 0 },
    truncated: false,
  }
}

// ── Row shapes, exactly as the tables hold them ─────────────────────────────

export type OrderRow = {
  id: string
  currency: string
  placed_at: string
  shipping_revenue_minor: number | string
  tax_minor: number | string
  payment_fees_minor: number | string
  marketplace_fees_minor: number | string
  is_test: boolean
  is_new_customer: boolean
  customer_id: string | null
  source: string
}

export type OrderItemRow = {
  order_id: string
  product_id: string | null
  product_name: string
  quantity: number
  gross_minor: number | string
  discount_minor: number | string
  cogs_minor: number | string | null
  fulfillment_minor: number | string | null
}

export type RefundRow = {
  id: string
  order_id: string
  amount_minor: number | string
  return_cost_minor: number | string | null
  currency: string
  refunded_at: string
}

export type ExpenseRow = {
  id: string
  category: string
  description: string | null
  amount_minor: number | string
  currency: string
  incurred_on: string
}

export type SourceRow = {
  provider: string
  status: string
  last_success_at: string | null
}

/** A committed CSV import: the records arrived when it was committed. */
export type ImportRow = {
  kind: string
  committed_at: string | null
}

export type DatasetRows = {
  orders: readonly OrderRow[]
  items: readonly OrderItemRow[]
  refunds: readonly RefundRow[]
  expenses: readonly ExpenseRow[]
  sources: readonly SourceRow[]
  imports?: readonly ImportRow[]
  truncated?: boolean
}

/** Expense categories that count as advertising spend. */
const AD_CATEGORY = /\b(ad|ads|advertis\w*|marketing|campaign|paid\s*social|paid\s*search|ppc)\b/i

export function isAdCategory(category: string): boolean {
  return AD_CATEGORY.test(category)
}

/** Orders without a product id share one bucket per name, so the portfolio can still draw them. */
function productKey(item: OrderItemRow): string {
  return item.product_id ?? `name:${item.product_name.trim().toLowerCase()}`
}

/** `bigint` columns arrive as strings through PostgREST; a NaN here would poison every total. */
function minor(value: number | string | null | undefined, currency: string): Money {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  return money(Number.isFinite(n) ? Math.trunc(n) : 0, currency)
}

function optionalMinor(value: number | string | null | undefined, currency: string): Money | null {
  if (value === null || value === undefined) return null
  return minor(value, currency)
}

function code(value: string): string {
  return value.trim().toUpperCase()
}

/**
 * Normalises rows into a dataset. Pure, so the mapping is tested without a
 * database and the loader below is only a set of queries.
 */
export function datasetFromRows(rows: DatasetRows, currency: string): Dataset {
  const want = code(currency)
  const itemsByOrder = new Map<string, OrderItemRow[]>()
  for (const item of rows.items) {
    const list = itemsByOrder.get(item.order_id)
    if (list) list.push(item)
    else itemsByOrder.set(item.order_id, [item])
  }

  let foreignCurrencyOrders = 0
  const orders: NormalisedOrder[] = []
  const kept = new Set<string>()

  for (const row of rows.orders) {
    if (code(row.currency) !== want) {
      foreignCurrencyOrders += 1
      continue
    }
    const placedAt = new Date(row.placed_at)
    if (Number.isNaN(placedAt.getTime())) continue
    kept.add(row.id)

    orders.push({
      id: row.id,
      createdAt: placedAt,
      currency: want,
      lines: (itemsByOrder.get(row.id) ?? []).map((item) => ({
        productId: productKey(item),
        productName: item.product_name,
        quantity: item.quantity,
        grossAmount: minor(item.gross_minor, want),
        discountAmount: minor(item.discount_minor, want),
        cogsAmount: optionalMinor(item.cogs_minor, want),
        fulfillmentCost: optionalMinor(item.fulfillment_minor, want),
      })),
      shippingRevenue: minor(row.shipping_revenue_minor, want),
      taxAmount: minor(row.tax_minor, want),
      paymentFees: minor(row.payment_fees_minor, want),
      marketplaceFees: minor(row.marketplace_fees_minor, want),
      isTest: row.is_test,
      customerId: row.customer_id,
      isNewCustomer: row.is_new_customer,
    })
  }

  // A refund whose order was excluded (another currency, or outside the
  // window) is excluded with it: it cannot reduce revenue that was never
  // counted, and the engine's refund rate is per order.
  const refunds: NormalisedRefund[] = []
  for (const row of rows.refunds) {
    if (!kept.has(row.order_id) || code(row.currency) !== want) continue
    const at = new Date(row.refunded_at)
    if (Number.isNaN(at.getTime())) continue
    refunds.push({
      id: row.id,
      orderId: row.order_id,
      createdAt: at,
      amount: minor(row.amount_minor, want),
      returnCost: optionalMinor(row.return_cost_minor, want),
    })
  }

  const spend: NormalisedSpend[] = []
  for (const row of rows.expenses) {
    if (!isAdCategory(row.category) || code(row.currency) !== want) continue
    // A date column: anchor it at midnight UTC so it buckets with the day.
    const at = new Date(`${row.incurred_on.slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(at.getTime())) continue
    spend.push({
      id: row.id,
      campaignId: (row.description?.trim() || row.category).slice(0, 120),
      productId: null,
      createdAt: at,
      amount: minor(row.amount_minor, want),
      attributedRevenue: null,
      newCustomers: 0,
    })
  }

  // Freshness is the newest moment any record arrived: a connector's last
  // successful sync, or a CSV import's commit. An import counts as a source
  // in its own right so the provenance line can say "csv import" and the
  // freshness is not "never synced" for a workspace that uploads monthly.
  const connected = rows.sources.filter((s) => s.status === 'connected' || s.status === 'degraded')
  const imports = (rows.imports ?? []).filter((i) => i.committed_at !== null)
  const syncedAt = [
    ...connected.map((s) => (s.last_success_at ? new Date(s.last_success_at) : null)),
    ...imports.map((i) => new Date(i.committed_at as string)),
  ]
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  const providers = Array.from(new Set(connected.map((s) => s.provider))).sort()
  if (imports.length > 0) providers.push('csv import')
  const system =
    providers.length > 0
      ? providers.join(', ')
      : orders.length > 0 || spend.length > 0
        ? 'imported records'
        : 'no source'

  return {
    orders,
    refunds,
    spend,
    currency: want,
    syncedAt,
    system,
    excluded: { foreignCurrencyOrders },
    truncated: rows.truncated ?? false,
  }
}

// ── Loading ─────────────────────────────────────────────────────────────────

/**
 * How far back to read. Year-to-date against its previous period needs up to
 * two years; anything older is not shown by any preset and is left in the
 * database.
 */
export const LOOKBACK_DAYS = 740

/** PostgREST returns at most this many rows per request regardless of `limit`. */
const PAGE = 1_000
/** The most orders one dataset holds; a workspace past this gets `truncated`. */
export const MAX_ORDERS = 20_000
const MAX_ROWS = 60_000
/** `in (...)` filters travel in the URL; keep each chunk comfortably short. */
const ID_CHUNK = 150

type Rows<T> = { data: T[] | null; error: { message: string } | null }

async function pageAll<T>(
  query: (from: number, to: number) => PromiseLike<Rows<T>>,
  max: number,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  for (let from = 0; from < max; from += PAGE) {
    const to = Math.min(from + PAGE, max) - 1
    const { data, error } = await query(from, to)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < to - from + 1) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

/**
 * Reads a workspace's commerce rows through the client it is given.
 *
 * The caller's client is the authority: a tenant client sees its own rows and
 * nothing else by RLS, and the organization id is a filter on top of that,
 * never a substitute for it.
 */
export async function loadWorkspaceDataset(
  db: SupabaseClient,
  organizationId: string,
  currency: string,
  options: { now?: Date } = {},
): Promise<Dataset> {
  const now = options.now ?? new Date()
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const sinceIso = since.toISOString()
  const sinceDate = sinceIso.slice(0, 10)

  const ordersRead = await pageAll<OrderRow>(
    (from, to) =>
      db
        .from('orders')
        .select(
          'id, currency, placed_at, shipping_revenue_minor, tax_minor, payment_fees_minor, marketplace_fees_minor, is_test, is_new_customer, customer_id, source',
        )
        .eq('organization_id', organizationId)
        .eq('is_test', false)
        .gte('placed_at', sinceIso)
        .order('placed_at', { ascending: false })
        .range(from, to),
    MAX_ORDERS,
  )

  const orderIds = ordersRead.rows.map((o) => o.id)
  const items: OrderItemRow[] = []
  for (let i = 0; i < orderIds.length; i += ID_CHUNK) {
    const chunk = orderIds.slice(i, i + ID_CHUNK)
    const read = await pageAll<OrderItemRow>(
      (from, to) =>
        db
          .from('order_items')
          .select(
            'order_id, product_id, product_name, quantity, gross_minor, discount_minor, cogs_minor, fulfillment_minor',
          )
          .eq('organization_id', organizationId)
          .in('order_id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
      MAX_ROWS,
    )
    items.push(...read.rows)
  }

  const [refundsRead, expensesRead, sources, imports] = await Promise.all([
    pageAll<RefundRow>(
      (from, to) =>
        db
          .from('refunds')
          .select('id, order_id, amount_minor, return_cost_minor, currency, refunded_at')
          .eq('organization_id', organizationId)
          .gte('refunded_at', sinceIso)
          .order('refunded_at', { ascending: false })
          .range(from, to),
      MAX_ROWS,
    ),
    pageAll<ExpenseRow>(
      (from, to) =>
        db
          .from('expenses')
          .select('id, category, description, amount_minor, currency, incurred_on')
          .eq('organization_id', organizationId)
          .gte('incurred_on', sinceDate)
          .order('incurred_on', { ascending: false })
          .range(from, to),
      MAX_ROWS,
    ),
    db
      .from('integration_connections')
      .select('provider, status, last_success_at')
      .eq('organization_id', organizationId)
      .then((result) => {
        if (result.error) throw new Error(result.error.message)
        return (result.data ?? []) as SourceRow[]
      }),
    db
      .from('import_batches')
      .select('kind, committed_at')
      .eq('organization_id', organizationId)
      .eq('status', 'committed')
      .order('committed_at', { ascending: false })
      .limit(50)
      .then((result) => {
        if (result.error) throw new Error(result.error.message)
        return (result.data ?? []) as ImportRow[]
      }),
  ])

  return datasetFromRows(
    {
      orders: ordersRead.rows,
      items,
      refunds: refundsRead.rows,
      expenses: expensesRead.rows,
      sources,
      imports,
      truncated: ordersRead.truncated,
    },
    currency,
  )
}
