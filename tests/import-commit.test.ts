import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildPreview,
  EXPENSE_FIELDS,
  parseCsv,
  suggestMapping,
  validateRows,
} from '@/lib/import/csv'
import { commitImport, planExpenses, planOrders, IMPORT_SOURCE } from '@/lib/import/commit'

const ORDER_MAPPING = {
  externalId: 'order id',
  placedAt: 'date',
  productName: 'product',
  quantity: 'qty',
  grossAmount: 'total',
  discountAmount: 'discount',
  sku: null,
  currency: null,
  customerEmail: 'email',
  shippingRevenue: 'shipping',
  tax: null,
  paymentFees: null,
}

const ORDERS_CSV = [
  'order id,date,product,qty,total,discount,email,shipping',
  '1001,2026-01-05,Amber Candle,2,68.00,6.80,ann@example.com,5.00',
  '1001,2026-01-05,Canvas Tote,1,28.00,0.00,ann@example.com,5.00',
  '1002,2026-01-06,Canvas Tote,1,$28.00,,BOB@example.com,',
  '1003,2026-01-09,Amber Candle,1,34.00,0.00,ann@example.com,4.00',
].join('\n')

describe('orders: lines become orders', () => {
  const { rows } = parseCsv(ORDERS_CSV)
  const validation = validateRows(rows, ORDER_MAPPING)

  it('keeps every line of a multi-line order', () => {
    // Two lines share order 1001 with different products: not a duplicate.
    expect(validation.duplicatesInFile).toHaveLength(0)
    expect(validation.valid).toHaveLength(4)
  })

  it('still drops an identical line repeated', () => {
    const repeated = validateRows(
      parseCsv(`${ORDERS_CSV}\n1001,2026-01-05,Amber Candle,2,68.00,6.80,ann@example.com,5.00`).rows,
      ORDER_MAPPING,
    )
    expect(repeated.duplicatesInFile).toEqual([{ line: 6, externalId: '1001', firstSeenLine: 2 }])
  })

  it('groups lines by order id, reads order-level figures once and keeps money exact', () => {
    const { orders, issues } = planOrders(validation.valid, { defaultCurrency: 'USD' })
    expect(issues).toHaveLength(0)
    expect(orders.map((o) => o.external_id)).toEqual(['1001', '1002', '1003'])

    const first = orders[0]!
    expect(first.lines).toHaveLength(2)
    expect(first.lines[0]).toEqual({ product_name: 'Amber Candle', sku: null, quantity: 2, gross_minor: 6800, discount_minor: 680 })
    // Shipping is stated on both lines; it is one $5 charge, not $10.
    expect(first.shipping_revenue_minor).toBe(500)
    expect(first.customer_email).toBe('ann@example.com')
    expect(first.currency).toBe('USD')
    expect(first.placed_at).toBe('2026-01-05T00:00:00.000Z')

    const second = orders[1]!
    expect(second.lines[0]!.gross_minor).toBe(2800)
    expect(second.customer_email).toBe('bob@example.com')
    expect(second.shipping_revenue_minor).toBe(0)
  })

  it('reports lines and orders separately in the preview', () => {
    const preview = buildPreview(parseCsv(ORDERS_CSV), validation, new Set(['1003']))
    expect(preview.willImport).toBe(3)
    expect(preview.willImportRecords).toBe(2)
    expect(preview.willSkipExisting).toBe(1)
  })

  it('takes the row currency over the workspace default, upper-cased', () => {
    const { rows: r } = parseCsv('order id,date,product,qty,total,currency\n7,2026-02-01,Mug,1,12.50,eur')
    const v = validateRows(r, { ...ORDER_MAPPING, currency: 'currency', customerEmail: null, shippingRevenue: null, discountAmount: null })
    const { orders } = planOrders(v.valid, { defaultCurrency: 'USD' })
    expect(orders[0]!.currency).toBe('EUR')
    expect(orders[0]!.lines[0]!.gross_minor).toBe(1250)
  })

  it('keeps a zero-quantity line as one unit so its money is not dropped', () => {
    const { rows: r } = parseCsv('order id,date,product,qty,total\n8,2026-02-01,Gift card,0,50.00')
    const v = validateRows(r, { ...ORDER_MAPPING, discountAmount: null, customerEmail: null, shippingRevenue: null })
    const { orders } = planOrders(v.valid, { defaultCurrency: 'USD' })
    expect(orders[0]!.lines[0]).toMatchObject({ quantity: 1, gross_minor: 5000 })
  })
})

describe('expenses: advertising spend', () => {
  const CSV = [
    'Reporting starts,Campaign name,Amount spent (USD),Currency',
    '2026-01-05,Prospecting — broad,42.17,USD',
    '2026-01-05,Retargeting — cart,11.90,USD',
    '2026-01-06,Prospecting — broad,"1,039.02",USD',
    'not a date,Prospecting — broad,10.00,USD',
  ].join('\n')

  it('auto-maps a Meta-style spend export', () => {
    const { headers } = parseCsv(CSV)
    const mapping = suggestMapping(headers, EXPENSE_FIELDS)
    expect(mapping.incurredOn).toBe('Reporting starts')
    expect(mapping.campaign).toBe('Campaign name')
    expect(mapping.amount).toBe('Amount spent (USD)')
    expect(mapping.currency).toBe('Currency')
  })

  it('validates by field type and drops the row with the unreadable date', () => {
    const { headers, rows } = parseCsv(CSV)
    const mapping = suggestMapping(headers, EXPENSE_FIELDS)
    const v = validateRows(rows, mapping, EXPENSE_FIELDS, { defaultCurrency: 'USD' })
    expect(v.valid).toHaveLength(3)
    expect(v.issues).toEqual([
      expect.objectContaining({ line: 5, field: 'incurredOn', severity: 'error' }),
    ])
    expect(v.valid[2]!.values.amount).toBe('1039.02')
  })

  it('plans one expense per row under the Advertising category by default', () => {
    const { headers, rows } = parseCsv(CSV)
    const mapping = suggestMapping(headers, EXPENSE_FIELDS)
    const v = validateRows(rows, mapping, EXPENSE_FIELDS, { defaultCurrency: 'USD' })
    const { expenses, issues } = planExpenses(v.valid, { defaultCurrency: 'USD' })
    expect(issues).toHaveLength(0)
    expect(expenses).toEqual([
      { category: 'Advertising', description: 'Prospecting — broad', amount_minor: 4217, currency: 'USD', incurred_on: '2026-01-05' },
      { category: 'Advertising', description: 'Retargeting — cart', amount_minor: 1190, currency: 'USD', incurred_on: '2026-01-05' },
      { category: 'Advertising', description: 'Prospecting — broad', amount_minor: 103902, currency: 'USD', incurred_on: '2026-01-06' },
    ])
  })

  it('keeps a stated category, so rent in a spend file is not counted as ads', () => {
    const { rows } = parseCsv('date,amount,category\n2026-01-05,900.00,Rent')
    const v = validateRows(rows, { incurredOn: 'date', amount: 'amount', category: 'category', campaign: null, currency: null }, EXPENSE_FIELDS, { defaultCurrency: 'GBP' })
    const { expenses } = planExpenses(v.valid, { defaultCurrency: 'GBP' })
    expect(expenses[0]).toMatchObject({ category: 'Rent', amount_minor: 90000, currency: 'GBP' })
  })
})

/**
 * A stand-in for the person's client: tables are arrays, inserts append and
 * return ids, upserts and selects filter on the recorded `eq`/`in` filters.
 * It proves what the writer sends, in what order, under which batch — the
 * database's own behaviour (RLS, the unique indexes) is proved in the
 * isolation suite against Postgres.
 */
function fakeDb(seed: Partial<Record<string, Record<string, unknown>[]>> = {}, options: { failOn?: string } = {}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    import_batches: [],
    orders: [],
    order_items: [],
    customers: [],
    expenses: [],
    audit_logs: [],
    ...seed,
  }
  let nextId = 1
  const log: string[] = []

  const from = (table: string) => {
    const filters: [string, unknown][] = []
    let ins: [string, unknown[]] | null = null
    let pending: Record<string, unknown>[] | null = null
    let update: Record<string, unknown> | null = null
    let upsert = false
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = chain
    builder.order = chain
    builder.limit = chain
    builder.single = chain
    builder.eq = (column: string, value: unknown) => {
      filters.push([column, value])
      return builder
    }
    builder.in = (column: string, values: unknown[]) => {
      ins = [column, values]
      return builder
    }
    builder.insert = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      pending = Array.isArray(rows) ? rows : [rows]
      return builder
    }
    builder.upsert = (rows: Record<string, unknown>[]) => {
      pending = rows
      upsert = true
      return builder
    }
    builder.update = (values: Record<string, unknown>) => {
      update = values
      return builder
    }
    const matches = (row: Record<string, unknown>) =>
      filters.every(([c, v]) => row[c] === v) && (ins === null || (ins[1] as unknown[]).includes(row[ins[0]]))
    const run = () => {
      log.push(`${pending ? (upsert ? 'upsert' : 'insert') : update ? 'update' : 'select'} ${table}`)
      if (options.failOn === table && pending) return { data: null, error: { message: `boom on ${table}`, code: 'XX000' } }
      if (pending) {
        const written: Record<string, unknown>[] = []
        for (const row of pending) {
          if (table === 'import_batches') {
            const clash = tables[table]!.find(
              (r) => r.organization_id === row.organization_id && r.kind === row.kind && r.content_hash === row.content_hash,
            )
            if (clash) return { data: null, error: { message: 'duplicate key', code: '23505' } }
          }
          const existing = upsert
            ? tables[table]!.find((r) => r.source === row.source && r.external_id === row.external_id && r.organization_id === row.organization_id)
            : undefined
          if (existing) {
            written.push(existing)
            continue
          }
          const stored = { id: `${table}-${nextId++}`, ...row }
          tables[table]!.push(stored)
          written.push(stored)
        }
        return { data: pending.length === 1 && !Array.isArray(pending) ? written[0] : written.length === 1 && table === 'import_batches' ? written[0] : written, error: null }
      }
      if (update) {
        for (const row of tables[table]!) if (matches(row)) Object.assign(row, update)
        return { data: null, error: null }
      }
      return { data: tables[table]!.filter(matches), error: null }
    }
    builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(onFulfilled, onRejected)
    return builder
  }

  const rpc = () => Promise.resolve({ data: 0, error: null })
  return { db: { from, rpc } as unknown as SupabaseClient, tables, log }
}

const INPUT = {
  organizationId: 'org-1',
  userId: 'user-1',
  kind: 'orders' as const,
  filename: 'orders.csv',
  text: ORDERS_CSV,
  mapping: ORDER_MAPPING,
  defaultCurrency: 'USD',
}

describe('commitImport', () => {
  it('writes orders, lines and customers under one batch, then marks it committed', async () => {
    const { db, tables } = fakeDb()
    const result = await commitImport(db, INPUT)

    expect(result.status).toBe('committed')
    if (result.status !== 'committed') return
    expect(result.written).toBe(3)
    expect(result.linesWritten).toBe(4)

    const batch = tables.import_batches![0]!
    expect(batch).toMatchObject({ organization_id: 'org-1', kind: 'orders', source: IMPORT_SOURCE, status: 'committed', row_count: 3, created_by: 'user-1' })
    expect(typeof batch.content_hash).toBe('string')

    expect(tables.orders).toHaveLength(3)
    for (const order of tables.orders!) {
      expect(order).toMatchObject({ organization_id: 'org-1', source: IMPORT_SOURCE, import_batch_id: batch.id, is_test: false })
    }
    expect(tables.order_items).toHaveLength(4)
    expect(tables.order_items!.every((i) => i.organization_id === 'org-1')).toBe(true)

    // Two distinct customers; Ann's first order is new, her later one is not.
    expect(tables.customers!.map((c) => c.external_id).sort()).toEqual(['ann@example.com', 'bob@example.com'])
    const byId = new Map(tables.orders!.map((o) => [o.external_id, o]))
    expect(byId.get('1001')!.is_new_customer).toBe(true)
    expect(byId.get('1003')!.is_new_customer).toBe(false)
    expect(byId.get('1002')!.is_new_customer).toBe(true)
    expect(byId.get('1001')!.customer_id).toBe(byId.get('1003')!.customer_id)

    expect(tables.audit_logs![0]).toMatchObject({ action: 'import.committed', target_id: batch.id, organization_id: 'org-1' })
  })

  it('refuses the same file twice', async () => {
    const { db } = fakeDb()
    await commitImport(db, INPUT)
    const again = await commitImport(db, INPUT)
    expect(again.status).toBe('duplicate_file')
  })

  it('skips orders already in the workspace and says how many', async () => {
    const { db, tables } = fakeDb({
      orders: [{ id: 'old', organization_id: 'org-1', source: IMPORT_SOURCE, external_id: '1001' }],
    })
    const result = await commitImport(db, { ...INPUT, filename: 'overlap.csv' })
    expect(result.status).toBe('committed')
    if (result.status !== 'committed') return
    expect(result.written).toBe(2)
    expect(result.skippedExisting).toBe(2) // two lines of order 1001
    expect(tables.orders!.filter((o) => o.external_id === '1001')).toHaveLength(1)
  })

  it('does not look at another tenant\'s orders when deciding what exists', async () => {
    const { db, tables } = fakeDb({
      orders: [{ id: 'theirs', organization_id: 'org-2', source: IMPORT_SOURCE, external_id: '1001' }],
    })
    const result = await commitImport(db, INPUT)
    expect(result.status).toBe('committed')
    if (result.status !== 'committed') return
    expect(result.written).toBe(3)
    expect(tables.orders!.filter((o) => o.organization_id === 'org-1')).toHaveLength(3)
  })

  it('reports nothing to import, and creates no batch, when every row is present or invalid', async () => {
    const { db, tables } = fakeDb({
      orders: ['1001', '1002', '1003'].map((id) => ({ id, organization_id: 'org-1', source: IMPORT_SOURCE, external_id: id })),
    })
    const result = await commitImport(db, INPUT)
    expect(result.status).toBe('nothing_to_import')
    expect(tables.import_batches).toHaveLength(0)
  })

  it('marks the batch failed, pointing at what was written, when a write fails', async () => {
    const { db, tables } = fakeDb({}, { failOn: 'order_items' })
    const result = await commitImport(db, INPUT)
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.message).toContain('boom on order_items')
    const batch = tables.import_batches![0]!
    expect(batch.status).toBe('failed')
    expect((batch.summary as { error: string }).error).toContain('boom')
    // The orders written before the failure still carry the batch id, so a
    // rollback removes exactly them.
    expect(tables.orders!.every((o) => o.import_batch_id === batch.id)).toBe(true)
  })

  it('writes expenses with the batch id and the default category', async () => {
    const { db, tables } = fakeDb()
    const result = await commitImport(db, {
      ...INPUT,
      kind: 'expenses',
      filename: 'spend.csv',
      text: 'date,campaign,amount spent\n2026-01-05,Broad,42.17\n2026-01-06,Broad,39.02',
      mapping: { incurredOn: 'date', campaign: 'campaign', amount: 'amount spent', category: null, currency: null },
    })
    expect(result.status).toBe('committed')
    if (result.status !== 'committed') return
    expect(result.written).toBe(2)
    expect(tables.expenses).toHaveLength(2)
    expect(tables.expenses![0]).toMatchObject({
      organization_id: 'org-1',
      category: 'Advertising',
      description: 'Broad',
      amount_minor: 4217,
      currency: 'USD',
      incurred_on: '2026-01-05',
      import_batch_id: tables.import_batches![0]!.id,
    })
    expect(tables.orders).toHaveLength(0)
  })
})
