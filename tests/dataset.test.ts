import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  datasetFromRows,
  emptyDataset,
  isAdCategory,
  loadWorkspaceDataset,
  LOOKBACK_DAYS,
  MAX_ORDERS,
  type DatasetRows,
  type ExpenseRow,
  type OrderItemRow,
  type OrderRow,
  type RefundRow,
} from '@/lib/workspace/dataset'
import { loadWorkspaceAnalytics } from '@/lib/workspace-analytics'
import { buildBriefing } from '@/lib/assistant/briefings'
import { evaluateRules } from '@/lib/notifications/evaluate'

const NOW = new Date('2026-06-15T12:00:00Z')

function order(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'o1',
    currency: 'USD',
    placed_at: '2026-06-10T10:00:00Z',
    shipping_revenue_minor: 500,
    tax_minor: 0,
    payment_fees_minor: 120,
    marketplace_fees_minor: 0,
    is_test: false,
    is_new_customer: true,
    customer_id: 'c1',
    source: 'shopify',
    ...over,
  }
}

function item(over: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    order_id: 'o1',
    product_id: 'p1',
    product_name: 'Candle',
    quantity: 2,
    gross_minor: 4000,
    discount_minor: 400,
    cogs_minor: 1200,
    fulfillment_minor: null,
    ...over,
  }
}

function refund(over: Partial<RefundRow> = {}): RefundRow {
  return {
    id: 'r1',
    order_id: 'o1',
    amount_minor: 1000,
    return_cost_minor: null,
    currency: 'USD',
    refunded_at: '2026-06-12T10:00:00Z',
    ...over,
  }
}

function expense(over: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: 'e1',
    category: 'Advertising',
    description: 'Meta — June prospecting',
    amount_minor: 2500,
    currency: 'USD',
    incurred_on: '2026-06-11',
    ...over,
  }
}

function rows(over: Partial<DatasetRows> = {}): DatasetRows {
  return {
    orders: [order()],
    items: [item()],
    refunds: [refund()],
    expenses: [expense()],
    sources: [{ provider: 'shopify', status: 'connected', last_success_at: '2026-06-15T09:00:00Z' }],
    ...over,
  }
}

describe('datasetFromRows', () => {
  it('maps the commerce tables into the shapes the engine reads', () => {
    const d = datasetFromRows(rows(), 'USD')

    expect(d.orders).toHaveLength(1)
    const o = d.orders[0]!
    expect(o.createdAt.toISOString()).toBe('2026-06-10T10:00:00.000Z')
    expect(o.shippingRevenue).toEqual({ minor: 500, currency: 'USD' })
    expect(o.paymentFees.minor).toBe(120)
    expect(o.isNewCustomer).toBe(true)
    expect(o.lines).toHaveLength(1)
    expect(o.lines[0]).toMatchObject({
      productId: 'p1',
      productName: 'Candle',
      quantity: 2,
      grossAmount: { minor: 4000, currency: 'USD' },
      discountAmount: { minor: 400, currency: 'USD' },
      cogsAmount: { minor: 1200, currency: 'USD' },
      fulfillmentCost: null,
    })

    expect(d.refunds).toHaveLength(1)
    expect(d.refunds[0]).toMatchObject({ orderId: 'o1', amount: { minor: 1000, currency: 'USD' }, returnCost: null })

    expect(d.spend).toHaveLength(1)
    expect(d.spend[0]).toMatchObject({
      campaignId: 'Meta — June prospecting',
      productId: null,
      amount: { minor: 2500, currency: 'USD' },
      attributedRevenue: null,
      newCustomers: 0,
    })
    expect(d.spend[0]!.createdAt.toISOString()).toBe('2026-06-11T00:00:00.000Z')

    expect(d.system).toBe('shopify')
    expect(d.syncedAt?.toISOString()).toBe('2026-06-15T09:00:00.000Z')
    expect(d.excluded.foreignCurrencyOrders).toBe(0)
    expect(d.truncated).toBe(false)
  })

  it('reads bigint columns that arrive as strings, and never produces NaN', () => {
    const d = datasetFromRows(
      rows({
        orders: [order({ shipping_revenue_minor: '500', payment_fees_minor: 'not a number' })],
        items: [item({ gross_minor: '4000', cogs_minor: '1200' })],
      }),
      'USD',
    )
    expect(d.orders[0]!.shippingRevenue.minor).toBe(500)
    expect(d.orders[0]!.paymentFees.minor).toBe(0)
    expect(d.orders[0]!.lines[0]!.grossAmount.minor).toBe(4000)
    expect(d.orders[0]!.lines[0]!.cogsAmount?.minor).toBe(1200)
  })

  it('excludes orders in another currency and counts them, rather than adding them up', () => {
    const d = datasetFromRows(
      rows({
        orders: [order(), order({ id: 'o2', currency: 'EUR' }), order({ id: 'o3', currency: 'eur' })],
        items: [item(), item({ order_id: 'o2' })],
        // A refund of an excluded order is excluded with it.
        refunds: [refund(), refund({ id: 'r2', order_id: 'o2', currency: 'EUR' })],
      }),
      'USD',
    )
    expect(d.orders.map((o) => o.id)).toEqual(['o1'])
    expect(d.refunds.map((r) => r.id)).toEqual(['r1'])
    expect(d.excluded.foreignCurrencyOrders).toBe(2)
  })

  it('treats the workspace currency case-insensitively', () => {
    const d = datasetFromRows(rows({ orders: [order({ currency: 'usd' })] }), 'USD')
    expect(d.orders).toHaveLength(1)
    expect(d.currency).toBe('USD')
  })

  it('drops a refund whose order is not in the dataset', () => {
    const d = datasetFromRows(rows({ refunds: [refund({ order_id: 'missing' })] }), 'USD')
    expect(d.refunds).toHaveLength(0)
  })

  it('counts only advertising expenses as ad spend', () => {
    const d = datasetFromRows(
      rows({
        expenses: [
          expense({ id: 'ads', category: 'Advertising' }),
          expense({ id: 'mkt', category: 'Marketing - paid social' }),
          expense({ id: 'ppc', category: 'PPC' }),
          expense({ id: 'rent', category: 'Rent' }),
          expense({ id: 'sal', category: 'Salaries' }),
          expense({ id: 'eur', category: 'Advertising', currency: 'EUR' }),
        ],
      }),
      'USD',
    )
    expect(d.spend.map((s) => s.id).sort()).toEqual(['ads', 'mkt', 'ppc'])
  })

  it.each([
    ['Advertising', true],
    ['ads', true],
    ['Paid search', true],
    ['Marketing', true],
    ['Campaign — Q3', true],
    ['Rent', false],
    ['Salaries', false],
    ['Software', false],
    ['Admin', false],
    ['Advent calendar stock', false],
  ])('isAdCategory(%s) is %s', (category, expected) => {
    expect(isAdCategory(category)).toBe(expected)
  })

  it('falls back to the category when an expense has no description', () => {
    const d = datasetFromRows(rows({ expenses: [expense({ description: null })] }), 'USD')
    expect(d.spend[0]!.campaignId).toBe('Advertising')
  })

  it('groups lines with no product id by name so the portfolio can still draw them', () => {
    const d = datasetFromRows(
      rows({
        items: [
          item({ product_id: null, product_name: 'Candle' }),
          item({ product_id: null, product_name: 'candle ' }),
          item({ product_id: null, product_name: 'Diffuser' }),
        ],
      }),
      'USD',
    )
    const keys = d.orders[0]!.lines.map((l) => l.productId)
    expect(keys[0]).toBe(keys[1])
    expect(keys[0]).not.toBe(keys[2])
    expect(keys[0]).not.toBe('')
  })

  it('names the source after the connected providers, or the import when there is none', () => {
    expect(
      datasetFromRows(
        rows({
          sources: [
            { provider: 'stripe', status: 'connected', last_success_at: '2026-06-14T09:00:00Z' },
            { provider: 'shopify', status: 'degraded', last_success_at: '2026-06-15T09:00:00Z' },
            { provider: 'hubspot', status: 'disconnected', last_success_at: '2026-06-16T09:00:00Z' },
          ],
        }),
        'USD',
      ),
    ).toMatchObject({ system: 'shopify, stripe', syncedAt: new Date('2026-06-15T09:00:00Z') })

    expect(datasetFromRows(rows({ sources: [] }), 'USD')).toMatchObject({ system: 'imported records', syncedAt: null })
    expect(datasetFromRows(rows({ sources: [], orders: [], items: [], refunds: [], expenses: [] }), 'USD')).toMatchObject({
      system: 'no source',
    })
  })

  it('skips a row with an unreadable date rather than throwing', () => {
    const d = datasetFromRows(rows({ orders: [order({ placed_at: 'yesterday-ish' })] }), 'USD')
    expect(d.orders).toHaveLength(0)
  })

  it('starts empty', () => {
    expect(emptyDataset('GBP')).toMatchObject({
      orders: [],
      spend: [],
      currency: 'GBP',
      system: 'no source',
      excluded: { foreignCurrencyOrders: 0 },
      truncated: false,
    })
  })
})

describe('a real workspace computes real metrics', () => {
  const dataset = datasetFromRows(rows(), 'USD')

  it('feeds the analytics the engine reads, with provenance', () => {
    const a = loadWorkspaceAnalytics({
      isDemo: false,
      currency: 'USD',
      preset: 'last_30',
      comparison: 'previous_period',
      now: NOW,
      dataset,
    })
    expect(a.hasData).toBe(true)
    // 4000 gross − 400 discount + 500 shipping − 1000 refund.
    expect(a.metrics.netRevenue.value.minor).toBe(3100)
    expect(a.metrics.adSpend.value.minor).toBe(2500)
    expect(a.metrics.orderCount.value).toBe(1)
    expect(a.metrics.netRevenue.sources[0]).toMatchObject({ system: 'shopify', recordCount: 1 })
    expect(a.metrics.netRevenue.freshestAt?.toISOString()).toBe('2026-06-15T09:00:00.000Z')
    expect(a.caveats).toEqual([])
  })

  it('says what was left out', () => {
    const a = loadWorkspaceAnalytics({
      isDemo: false,
      currency: 'USD',
      preset: 'last_30',
      comparison: 'none',
      now: NOW,
      dataset: datasetFromRows(
        rows({ orders: [order(), order({ id: 'o2', currency: 'EUR' })], truncated: true }),
        'USD',
      ),
    })
    expect(a.caveats).toHaveLength(2)
    expect(a.caveats[0]).toContain('1 order in a currency other than USD is not included')
    expect(a.caveats[1]).toContain('most recent orders')
  })

  it('ignores a dataset handed to a demo workspace: the two never mix', () => {
    const a = loadWorkspaceAnalytics({
      isDemo: true,
      currency: 'USD',
      preset: 'last_30',
      comparison: 'none',
      dataset,
    })
    expect(a.metrics.netRevenue.sources[0]?.system).toBe('demo dataset')
    expect(a.metrics.orderCount.value).toBeGreaterThan(1)
  })

  it('is still the empty state without one', () => {
    const a = loadWorkspaceAnalytics({ isDemo: false, currency: 'USD', preset: 'last_30', comparison: 'none', now: NOW })
    expect(a.hasData).toBe(false)
    expect(a.metrics.netRevenue.value.minor).toBe(0)
  })

  it('briefs on real figures and carries the dataset caveats', () => {
    const briefing = buildBriefing({
      kind: 'weekly',
      isDemo: false,
      currency: 'USD',
      dataset: datasetFromRows(rows({ orders: [order(), order({ id: 'o2', currency: 'EUR' })] }), 'USD'),
      now: NOW,
    })
    expect(briefing.isDemo).toBe(false)
    expect(briefing.headline).not.toContain('No data')
    expect(briefing.lines.find((l) => l.label === 'Net revenue')?.value).toBe('$31.00')
    expect(briefing.caveats.some((c) => c.includes('currency other than USD'))).toBe(true)
  })

  it('judges a rule against real figures', () => {
    const evaluation = evaluateRules({
      rules: [
        {
          id: 'rule-1',
          organizationId: 'org-1',
          name: 'Spend guard',
          metricKey: 'adSpend',
          comparator: 'above',
          threshold: 20,
          channel: 'in_app',
          enabled: true,
        },
      ],
      isDemo: false,
      currency: 'USD',
      preset: 'last_30',
      dataset,
      now: NOW,
    })
    expect(evaluation.raised).toHaveLength(1)
    expect(evaluation.raised[0]!.evidence.observedDisplay).toBe('$25.00')
  })
})

/**
 * A query builder stand-in: every chained call returns the builder, `.range`
 * records the window, and awaiting it yields a page from the table's rows.
 * Enough to prove the loader pages, filters by organization and never sends
 * an unbounded request — without a database.
 */
function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
  const calls: { table: string; filters: Record<string, unknown>; range: [number, number] | null }[] = []

  const from = (table: string) => {
    const call = { table, filters: {} as Record<string, unknown>, range: null as [number, number] | null }
    calls.push(call)
    let ids: string[] | null = null
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    for (const method of ['select', 'order', 'gte', 'lte']) builder[method] = chain
    builder.eq = (column: string, value: unknown) => {
      call.filters[column] = value
      return builder
    }
    builder.in = (_column: string, values: string[]) => {
      ids = values
      return builder
    }
    builder.range = (from: number, to: number) => {
      call.range = [from, to]
      return builder
    }
    const resolve = () => {
      let data = tables[table] ?? []
      if (ids) data = data.filter((r) => (ids as string[]).includes(String(r.order_id)))
      if (call.range) data = data.slice(call.range[0], call.range[1] + 1)
      return { data, error: null }
    }
    builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected)
    return builder
  }

  return { client: { from } as unknown as SupabaseClient, calls }
}

describe('loadWorkspaceDataset', () => {
  it('reads every table for the one organization, through the client it was given', async () => {
    const { client, calls } = fakeClient({
      orders: [order()],
      order_items: [item()],
      refunds: [refund()],
      expenses: [expense()],
      integration_connections: [{ provider: 'shopify', status: 'connected', last_success_at: '2026-06-15T09:00:00Z' }],
    })

    const d = await loadWorkspaceDataset(client, 'org-1', 'USD', { now: NOW })

    expect(d.orders).toHaveLength(1)
    expect(d.orders[0]!.lines).toHaveLength(1)
    expect(d.refunds).toHaveLength(1)
    expect(d.spend).toHaveLength(1)
    expect(d.system).toBe('shopify')

    for (const call of calls) expect(call.filters.organization_id).toBe('org-1')
    expect(calls.find((c) => c.table === 'orders')?.filters.is_test).toBe(false)
    expect(new Set(calls.map((c) => c.table))).toEqual(
      new Set(['orders', 'order_items', 'refunds', 'expenses', 'integration_connections']),
    )
  })

  it('pages in windows of a thousand and stops at the first short page', async () => {
    const many = Array.from({ length: 2_300 }, (_, i) =>
      order({ id: `o${i}`, placed_at: new Date(NOW.getTime() - i * 60_000).toISOString() }),
    )
    const { client, calls } = fakeClient({ orders: many, order_items: [], refunds: [], expenses: [], integration_connections: [] })

    const d = await loadWorkspaceDataset(client, 'org-1', 'USD', { now: NOW })

    expect(d.orders).toHaveLength(2_300)
    expect(d.truncated).toBe(false)
    const windows = calls.filter((c) => c.table === 'orders').map((c) => c.range)
    expect(windows).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    // Items are asked for in chunks of order ids, never one request per order
    // and never one request for every id at once.
    const itemCalls = calls.filter((c) => c.table === 'order_items')
    expect(itemCalls.length).toBeGreaterThan(1)
    expect(itemCalls.length).toBeLessThan(2_300)
  })

  it('reports truncation at the order cap instead of reading forever', async () => {
    const endless = Array.from({ length: MAX_ORDERS + 1 }, (_, i) =>
      order({ id: `o${i}`, placed_at: new Date(NOW.getTime() - i * 1_000).toISOString() }),
    )
    const { client } = fakeClient({ orders: endless, order_items: [], refunds: [], expenses: [], integration_connections: [] })

    const d = await loadWorkspaceDataset(client, 'org-1', 'USD', { now: NOW })

    expect(d.orders).toHaveLength(MAX_ORDERS)
    expect(d.truncated).toBe(true)
  })

  it('reads back far enough for year-to-date against its previous period', () => {
    expect(LOOKBACK_DAYS).toBeGreaterThanOrEqual(2 * 365)
  })

  it('raises a database error rather than reporting an empty workspace', async () => {
    const client = {
      from: () => {
        const builder: Record<string, unknown> = {}
        for (const m of ['select', 'order', 'gte', 'eq', 'in', 'range']) builder[m] = () => builder
        builder.then = (onFulfilled: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'permission denied for table orders' } }).then(onFulfilled)
        return builder
      },
    } as unknown as SupabaseClient

    await expect(loadWorkspaceDataset(client, 'org-1', 'USD', { now: NOW })).rejects.toThrow('permission denied')
  })
})
