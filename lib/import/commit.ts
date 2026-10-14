import type { SupabaseClient } from '@supabase/supabase-js'
import { fromDecimalString } from '@/lib/money'
import {
  buildPreview,
  contentHash,
  FIELDS_FOR,
  parseCsv,
  validateRows,
  type ImportKind,
  type ImportPreview,
  type MappedRow,
  type RowIssue,
} from './csv'

/**
 * The commit step: validated rows become database rows, under one batch.
 *
 * Two halves, kept apart so the mapping is tested without a database:
 *
 *   - `planOrders` and `planExpenses` are pure. Validated rows in, the exact
 *     rows to insert out, with every decision (which line's shipping figure
 *     an order uses, what a missing category becomes) made in one place.
 *   - `commitImport` runs the whole pipeline — parse, validate, plan, write —
 *     on the server, through the **person's own client**. The browser showed
 *     them a preview from the same pure functions, and the server re-derives
 *     it rather than trusting a list of rows the browser says it validated.
 *     RLS decides whether they may write at all; the organization id is their
 *     membership's, never a field in the request.
 *
 * What makes an import safe to repeat:
 *
 *   - The file's content hash is unique per workspace and kind, so the same
 *     export uploaded twice is refused before a row is read.
 *   - Orders are keyed by `(organization_id, source, external_id)`. A fresh
 *     export that overlaps last week's skips the orders already present
 *     instead of doubling their revenue.
 *   - Every row carries `import_batch_id`, and `rollback_import_batch()`
 *     removes exactly that batch and nothing else.
 *   - A write that fails midway marks the batch `failed` and leaves what was
 *     written pointing at it, so an admin can roll it back. Nothing is
 *     silently half-imported.
 */

export const IMPORT_SOURCE = 'csv_import'

/** The most text one import accepts. A larger file is split by the operator. */
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024
/** Rows per insert statement. */
const CHUNK = 200
/** Ids per `in (...)` lookup; they travel in the URL. */
const ID_CHUNK = 150

export type PlannedLine = {
  product_name: string
  sku: string | null
  quantity: number
  gross_minor: number
  discount_minor: number
}

export type PlannedOrder = {
  external_id: string
  order_number: string
  placed_at: string
  currency: string
  shipping_revenue_minor: number
  tax_minor: number
  payment_fees_minor: number
  customer_email: string | null
  lines: PlannedLine[]
}

export type PlannedExpense = {
  category: string
  description: string | null
  amount_minor: number
  currency: string
  incurred_on: string
}

export type PlanIssue = { line: number; message: string }

const DEFAULT_EXPENSE_CATEGORY = 'Advertising'

function minorOf(value: string | undefined, currency: string): number | null {
  if (!value) return 0
  try {
    return fromDecimalString(value, currency).minor
  } catch {
    return null
  }
}

/**
 * Lines → orders.
 *
 * A store export is one row per line item, with the order's own figures
 * (shipping, tax, fees, customer) repeated on every row or present on the
 * first. They are read from the first row that has them and never summed:
 * three lines each repeating a $5 shipping charge are one $5 charge.
 */
export function planOrders(
  rows: readonly MappedRow[],
  options: { defaultCurrency: string },
): { orders: PlannedOrder[]; issues: PlanIssue[] } {
  const byId = new Map<string, PlannedOrder>()
  const issues: PlanIssue[] = []

  for (const row of rows) {
    const v = row.values
    const externalId = (v.externalId ?? '').trim()
    if (!externalId) continue
    const currency = (v.currency || options.defaultCurrency).trim().toUpperCase()

    const gross = minorOf(v.grossAmount, currency)
    const discount = minorOf(v.discountAmount, currency) ?? 0
    const quantity = Number(v.quantity ?? '0')
    if (gross === null || !Number.isInteger(quantity)) {
      issues.push({ line: row.line, message: 'Amount or quantity could not be read as money' })
      continue
    }

    let order = byId.get(externalId)
    if (!order) {
      order = {
        external_id: externalId,
        order_number: externalId,
        placed_at: v.placedAt ?? '',
        currency,
        shipping_revenue_minor: 0,
        tax_minor: 0,
        payment_fees_minor: 0,
        customer_email: null,
        lines: [],
      }
      byId.set(externalId, order)
    }

    // Order-level figures: the first row that states them wins.
    if (order.shipping_revenue_minor === 0 && v.shippingRevenue) {
      order.shipping_revenue_minor = minorOf(v.shippingRevenue, currency) ?? 0
    }
    if (order.tax_minor === 0 && v.tax) order.tax_minor = minorOf(v.tax, currency) ?? 0
    if (order.payment_fees_minor === 0 && v.paymentFees) {
      order.payment_fees_minor = minorOf(v.paymentFees, currency) ?? 0
    }
    if (!order.customer_email && v.customerEmail) {
      const email = v.customerEmail.trim().toLowerCase()
      if (email.includes('@')) order.customer_email = email
    }
    // The earliest line's date is the order's date, should they differ.
    if (v.placedAt && (!order.placed_at || v.placedAt < order.placed_at)) order.placed_at = v.placedAt

    order.lines.push({
      product_name: (v.productName ?? '').trim() || 'Unnamed product',
      sku: (v.sku ?? '').trim() || null,
      // The schema requires a positive quantity; a zero-quantity line is kept
      // as one unit of its amount so money that moved is not dropped.
      quantity: Math.max(1, quantity),
      gross_minor: gross,
      discount_minor: discount,
    })
  }

  return { orders: Array.from(byId.values()), issues }
}

/** Rows → expenses. One row is one expense; nothing is grouped. */
export function planExpenses(
  rows: readonly MappedRow[],
  options: { defaultCurrency: string },
): { expenses: PlannedExpense[]; issues: PlanIssue[] } {
  const expenses: PlannedExpense[] = []
  const issues: PlanIssue[] = []

  for (const row of rows) {
    const v = row.values
    const currency = (v.currency || options.defaultCurrency).trim().toUpperCase()
    const amount = minorOf(v.amount, currency)
    const date = (v.incurredOn ?? '').slice(0, 10)
    if (amount === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      issues.push({ line: row.line, message: 'Amount or date could not be read' })
      continue
    }
    expenses.push({
      category: (v.category ?? '').trim() || DEFAULT_EXPENSE_CATEGORY,
      description: (v.campaign ?? '').trim().slice(0, 200) || null,
      amount_minor: amount,
      currency,
      incurred_on: date,
    })
  }

  return { expenses, issues }
}

// ── Writing ─────────────────────────────────────────────────────────────────

export type CommitInput = {
  organizationId: string
  userId: string
  kind: ImportKind
  filename: string
  text: string
  mapping: Record<string, string | null>
  defaultCurrency: string
}

export type CommitResult =
  | {
      status: 'committed'
      batchId: string
      /** Records written: orders for an order file, expenses otherwise. */
      written: number
      /** Lines written, for an order file. */
      linesWritten: number
      skippedExisting: number
      skippedDuplicateInFile: number
      errorRows: number
      preview: ImportPreview
      issues: RowIssue[]
    }
  | { status: 'duplicate_file' }
  | { status: 'nothing_to_import'; preview: ImportPreview; issues: RowIssue[] }
  | { status: 'failed'; batchId: string; message: string }

type Db = SupabaseClient

export async function commitImport(db: Db, input: CommitInput): Promise<CommitResult> {
  // The same file again is refused before a row is read, with a message that
  // says so; the unique index on the batch table is the guard against two
  // uploads racing past this check.
  const hash = await contentHash(input.text)
  const { data: previous, error: lookupError } = await db
    .from('import_batches')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('kind', input.kind)
    .eq('content_hash', hash)
    .limit(1)
  if (lookupError) throw new Error(lookupError.message)
  if ((previous ?? []).length > 0) return { status: 'duplicate_file' }

  const fields = FIELDS_FOR[input.kind]
  const parsed = parseCsv(input.text)
  const validation = validateRows(parsed.rows, input.mapping, fields, {
    defaultCurrency: input.defaultCurrency,
  })

  // Already-present orders are resolved here, on the server, where the
  // table is. The browser's preview said it could not know this.
  const existing =
    input.kind === 'orders'
      ? await existingExternalIds(
          db,
          input.organizationId,
          validation.valid.map((r) => r.values.externalId ?? '').filter((id) => id !== ''),
        )
      : new Set<string>()
  const preview = buildPreview(parsed, validation, existing)
  const fresh = validation.valid.filter((row) => !existing.has(row.values.externalId ?? ''))

  const plan =
    input.kind === 'orders'
      ? planOrders(fresh, { defaultCurrency: input.defaultCurrency })
      : planExpenses(fresh, { defaultCurrency: input.defaultCurrency })
  const records = 'orders' in plan ? plan.orders.length : plan.expenses.length
  const issues: RowIssue[] = [
    ...validation.issues,
    ...plan.issues.map((i) => ({ line: i.line, field: 'row', value: '', message: i.message, severity: 'error' as const })),
  ]

  if (records === 0) return { status: 'nothing_to_import', preview, issues }

  const { data: batch, error: batchError } = await db
    .from('import_batches')
    .insert({
      organization_id: input.organizationId,
      source: IMPORT_SOURCE,
      kind: input.kind,
      filename: input.filename.slice(0, 200),
      status: 'pending',
      content_hash: hash,
      created_by: input.userId,
      row_count: 0,
      skipped_count: preview.willSkipExisting + preview.willSkipDuplicateInFile,
      error_count: preview.errorRows + plan.issues.length,
      summary: { mapping: input.mapping, totalRows: preview.totalRows },
    })
    .select('id')
    .single()

  if (batchError) {
    // 23505 is the content hash: this exact file was imported before.
    if (batchError.code === '23505') return { status: 'duplicate_file' }
    throw new Error(batchError.message)
  }
  const batchId = batch.id as string

  try {
    const written =
      'orders' in plan
        ? await writeOrders(db, input.organizationId, batchId, plan.orders)
        : await writeExpenses(db, input.organizationId, batchId, plan.expenses)

    const { error: doneError } = await db
      .from('import_batches')
      .update({
        status: 'committed',
        committed_at: new Date().toISOString(),
        row_count: written.records,
        summary: {
          mapping: input.mapping,
          totalRows: preview.totalRows,
          records: written.records,
          lines: written.lines,
          skippedExisting: preview.willSkipExisting,
          skippedDuplicateInFile: preview.willSkipDuplicateInFile,
          errorRows: preview.errorRows + plan.issues.length,
        },
      })
      .eq('id', batchId)
    if (doneError) throw new Error(doneError.message)

    await db.from('audit_logs').insert({
      organization_id: input.organizationId,
      actor_user_id: input.userId,
      action: 'import.committed',
      target_type: 'import_batch',
      target_id: batchId,
      metadata: { kind: input.kind, records: written.records, lines: written.lines },
    })

    return {
      status: 'committed',
      batchId,
      written: written.records,
      linesWritten: written.lines,
      skippedExisting: preview.willSkipExisting,
      skippedDuplicateInFile: preview.willSkipDuplicateInFile,
      errorRows: preview.errorRows + plan.issues.length,
      preview,
      issues,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    // Left pointing at whatever was written, so a rollback removes it. Never
    // deleted here: a member can insert but only an admin can delete, and a
    // failed import that vanished without trace is worse than one that
    // says what happened.
    await db
      .from('import_batches')
      .update({ status: 'failed', summary: { mapping: input.mapping, error: message.slice(0, 500) } })
      .eq('id', batchId)
    return { status: 'failed', batchId, message }
  }
}

async function existingExternalIds(db: Db, organizationId: string, ids: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>()
  const unique = Array.from(new Set(ids))
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK)
    const { data, error } = await db
      .from('orders')
      .select('external_id')
      .eq('organization_id', organizationId)
      .eq('source', IMPORT_SOURCE)
      .in('external_id', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) if (row.external_id) found.add(String(row.external_id))
  }
  return found
}

/**
 * Customers are keyed by lower-cased email under the import source. A
 * customer who did not exist before this import, on their earliest order in
 * it, is new; every other order of theirs is a repeat. That is what CAC and
 * the new-customer count read.
 */
async function resolveCustomers(
  db: Db,
  organizationId: string,
  orders: readonly PlannedOrder[],
): Promise<Map<string, { id: string; existed: boolean }>> {
  const emails = Array.from(new Set(orders.map((o) => o.customer_email).filter((e): e is string => e !== null)))
  const result = new Map<string, { id: string; existed: boolean }>()
  if (emails.length === 0) return result

  for (let i = 0; i < emails.length; i += ID_CHUNK) {
    const chunk = emails.slice(i, i + ID_CHUNK)
    const { data, error } = await db
      .from('customers')
      .select('id, external_id')
      .eq('organization_id', organizationId)
      .eq('source', IMPORT_SOURCE)
      .in('external_id', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) result.set(String(row.external_id), { id: String(row.id), existed: true })
  }

  const missing = emails.filter((e) => !result.has(e))
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK)
    const firstOrderAt = new Map<string, string>()
    for (const o of orders) {
      if (!o.customer_email || !chunk.includes(o.customer_email)) continue
      const current = firstOrderAt.get(o.customer_email)
      if (!current || o.placed_at < current) firstOrderAt.set(o.customer_email, o.placed_at)
    }
    const { data, error } = await db
      .from('customers')
      .upsert(
        chunk.map((email) => ({
          organization_id: organizationId,
          source: IMPORT_SOURCE,
          external_id: email,
          email,
          first_order_at: firstOrderAt.get(email) ?? null,
        })),
        { onConflict: 'organization_id,source,external_id' },
      )
      .select('id, external_id')
    if (error) throw new Error(error.message)
    for (const row of data ?? []) result.set(String(row.external_id), { id: String(row.id), existed: false })
  }

  return result
}

async function writeOrders(
  db: Db,
  organizationId: string,
  batchId: string,
  orders: readonly PlannedOrder[],
): Promise<{ records: number; lines: number }> {
  const customers = await resolveCustomers(db, organizationId, orders)

  // Earliest order per new customer, for is_new_customer.
  const earliest = new Map<string, string>()
  for (const o of orders) {
    if (!o.customer_email) continue
    const current = earliest.get(o.customer_email)
    if (!current || o.placed_at < current) earliest.set(o.customer_email, o.placed_at)
  }

  let records = 0
  let lines = 0
  for (let i = 0; i < orders.length; i += CHUNK) {
    const chunk = orders.slice(i, i + CHUNK)
    const { data, error } = await db
      .from('orders')
      .insert(
        chunk.map((o) => {
          const customer = o.customer_email ? customers.get(o.customer_email) : undefined
          return {
            organization_id: organizationId,
            source: IMPORT_SOURCE,
            external_id: o.external_id,
            order_number: o.order_number,
            currency: o.currency,
            placed_at: o.placed_at,
            shipping_revenue_minor: o.shipping_revenue_minor,
            tax_minor: o.tax_minor,
            payment_fees_minor: o.payment_fees_minor,
            marketplace_fees_minor: 0,
            is_test: false,
            customer_id: customer?.id ?? null,
            is_new_customer:
              customer !== undefined && !customer.existed && earliest.get(o.customer_email as string) === o.placed_at,
            import_batch_id: batchId,
          }
        }),
      )
      .select('id, external_id')
    if (error) throw new Error(error.message)

    const idFor = new Map((data ?? []).map((row) => [String(row.external_id), String(row.id)]))
    const items = chunk.flatMap((o) => {
      const orderId = idFor.get(o.external_id)
      if (!orderId) return []
      return o.lines.map((line) => ({
        organization_id: organizationId,
        order_id: orderId,
        product_name: line.product_name,
        quantity: line.quantity,
        gross_minor: line.gross_minor,
        discount_minor: line.discount_minor,
        currency: o.currency,
      }))
    })
    for (let j = 0; j < items.length; j += CHUNK) {
      const { error: itemError } = await db.from('order_items').insert(items.slice(j, j + CHUNK))
      if (itemError) throw new Error(itemError.message)
    }
    records += data?.length ?? 0
    lines += items.length
  }

  return { records, lines }
}

async function writeExpenses(
  db: Db,
  organizationId: string,
  batchId: string,
  expenses: readonly PlannedExpense[],
): Promise<{ records: number; lines: number }> {
  let records = 0
  for (let i = 0; i < expenses.length; i += CHUNK) {
    const chunk = expenses.slice(i, i + CHUNK)
    const { error } = await db.from('expenses').insert(
      chunk.map((e) => ({
        organization_id: organizationId,
        category: e.category,
        description: e.description,
        amount_minor: e.amount_minor,
        currency: e.currency,
        incurred_on: e.incurred_on,
        import_batch_id: batchId,
      })),
    )
    if (error) throw new Error(error.message)
    records += chunk.length
  }
  return { records, lines: records }
}

/** Undoes one batch through the database function, which checks the role. */
export async function rollbackImport(db: Db, batchId: string): Promise<{ removed: number }> {
  const { data, error } = await db.rpc('rollback_import_batch', { batch: batchId })
  if (error) throw new Error(error.message)
  return { removed: Number(data ?? 0) }
}
