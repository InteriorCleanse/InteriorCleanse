/**
 * CSV parsing and import validation.
 *
 * Deliberately dependency-free and pure: parsing is where malformed customer
 * data first meets the system, and it is the one place worth being able to test
 * exhaustively without mocking a file upload or a database.
 *
 * The pipeline is parse → map → validate → detect duplicates → preview →
 * commit. Nothing is written until the operator has seen the preview, and
 * everything written carries an `import_batch_id` so it can be undone.
 */

export type CsvRow = Record<string, string>

export type ParseResult = {
  headers: string[]
  rows: CsvRow[]
  /** Rows whose column count did not match the header, kept for the error report. */
  malformed: { line: number; raw: string; reason: string }[]
}

/**
 * RFC 4180-style parser: handles quoted fields, embedded commas and newlines,
 * and doubled quotes. A naive `split(',')` corrupts any export containing a
 * product name with a comma in it, which is most of them.
 */
export function parseCsv(input: string, delimiter = ','): ParseResult {
  const text = input.replace(/^﻿/, '') // strip BOM from Excel exports
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let i = 0

  const pushField = () => {
    record.push(field)
    field = ''
  }
  const pushRecord = () => {
    pushField()
    records.push(record)
    record = []
  }

  while (i < text.length) {
    const char = text[i]!

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"' && field === '') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === delimiter) {
      pushField()
      i += 1
      continue
    }
    if (char === '\r') {
      i += 1
      continue
    }
    if (char === '\n') {
      pushRecord()
      i += 1
      continue
    }

    field += char
    i += 1
  }

  // Trailing field, unless the file ended on a clean newline.
  if (field !== '' || record.length > 0) pushRecord()

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [], malformed: [] }

  const headers = (nonEmpty[0] ?? []).map((h) => h.trim())
  const rows: CsvRow[] = []
  const malformed: ParseResult['malformed'] = []

  nonEmpty.slice(1).forEach((cells, index) => {
    const line = index + 2 // 1-based, and the header is line 1
    if (cells.length !== headers.length) {
      malformed.push({
        line,
        raw: cells.join(delimiter),
        reason: `Expected ${headers.length} columns, found ${cells.length}`,
      })
      return
    }
    const row: CsvRow = {}
    headers.forEach((header, c) => {
      row[header] = (cells[c] ?? '').trim()
    })
    rows.push(row)
  })

  return { headers, rows, malformed }
}

// ── Field mapping ───────────────────────────────────────────────────────────

export type FieldSpec = {
  key: string
  label: string
  required: boolean
  /** Header names commonly used by real exports, for auto-detection. */
  aliases: string[]
  hint?: string
}

export const ORDER_FIELDS: FieldSpec[] = [
  {
    key: 'externalId',
    label: 'Order ID',
    required: true,
    aliases: ['order id', 'order_id', 'id', 'order number', 'name', 'reference'],
    hint: 'Used to detect re-imports of the same order.',
  },
  {
    key: 'placedAt',
    label: 'Order date',
    required: true,
    aliases: ['date', 'created at', 'created_at', 'order date', 'processed at', 'paid at'],
  },
  {
    key: 'productName',
    label: 'Product',
    required: true,
    aliases: ['product', 'product name', 'item', 'line item name', 'title', 'description'],
  },
  { key: 'sku', label: 'SKU', required: false, aliases: ['sku', 'variant sku', 'item sku'] },
  {
    key: 'quantity',
    label: 'Quantity',
    required: true,
    aliases: ['quantity', 'qty', 'units', 'lineitem quantity'],
  },
  {
    key: 'grossAmount',
    label: 'Line total',
    required: true,
    aliases: ['total', 'amount', 'line total', 'gross', 'lineitem price', 'subtotal'],
  },
  {
    key: 'discountAmount',
    label: 'Discount',
    required: false,
    aliases: ['discount', 'discount amount', 'lineitem discount'],
  },
  { key: 'currency', label: 'Currency', required: false, aliases: ['currency', 'currency code'] },
  { key: 'customerEmail', label: 'Customer email', required: false, aliases: ['email', 'customer email', 'buyer email'] },
  { key: 'shippingRevenue', label: 'Shipping charged', required: false, aliases: ['shipping', 'shipping price'] },
  { key: 'tax', label: 'Tax', required: false, aliases: ['tax', 'taxes', 'tax amount'] },
  { key: 'paymentFees', label: 'Payment fees', required: false, aliases: ['fee', 'fees', 'payment fee', 'processing fee'] },
]

const normalise = (value: string) => value.toLowerCase().replace(/[\s_\-.]+/g, ' ').trim()

/**
 * Suggests a header for each field. Suggestions only — the operator confirms
 * the mapping in the UI, because guessing wrong about which column is revenue
 * is not a mistake worth making silently.
 */
export function suggestMapping(
  headers: string[],
  fields: FieldSpec[] = ORDER_FIELDS,
): Record<string, string | null> {
  const used = new Set<string>()
  const mapping: Record<string, string | null> = {}

  for (const field of fields) {
    const match =
      headers.find((h) => !used.has(h) && normalise(h) === normalise(field.label)) ??
      headers.find((h) => !used.has(h) && field.aliases.includes(normalise(h))) ??
      headers.find(
        (h) => !used.has(h) && field.aliases.some((a) => normalise(h).includes(a)),
      ) ??
      null

    if (match) used.add(match)
    mapping[field.key] = match
  }

  return mapping
}

// ── Validation ──────────────────────────────────────────────────────────────

export type RowIssue = {
  line: number
  field: string
  value: string
  message: string
  severity: 'error' | 'warning'
}

export type MappedRow = {
  line: number
  values: Record<string, string>
}

export type ValidationResult = {
  valid: MappedRow[]
  issues: RowIssue[]
  /** Rows dropped because an identical external id appeared earlier in the file. */
  duplicatesInFile: { line: number; externalId: string; firstSeenLine: number }[]
}

const DECIMAL = /^-?\d{1,15}(\.\d+)?$/

export function validateRows(
  rows: CsvRow[],
  mapping: Record<string, string | null>,
  fields: FieldSpec[] = ORDER_FIELDS,
  options: { defaultCurrency?: string } = {},
): ValidationResult {
  const valid: MappedRow[] = []
  const issues: RowIssue[] = []
  const duplicatesInFile: ValidationResult['duplicatesInFile'] = []
  const seen = new Map<string, number>()

  rows.forEach((row, index) => {
    const line = index + 2
    const values: Record<string, string> = {}
    let fatal = false

    for (const field of fields) {
      const header = mapping[field.key]
      const raw = header ? (row[header] ?? '') : ''
      values[field.key] = raw

      if (field.required && raw === '') {
        issues.push({
          line,
          field: field.key,
          value: '',
          message: `${field.label} is required`,
          severity: 'error',
        })
        fatal = true
      }
    }

    // Quantity must be a positive whole number.
    const quantity = values.quantity ?? ''
    if (quantity !== '' && !/^\d+$/.test(quantity)) {
      issues.push({
        line,
        field: 'quantity',
        value: quantity,
        message: 'Quantity must be a whole number',
        severity: 'error',
      })
      fatal = true
    } else if (quantity === '0') {
      issues.push({
        line,
        field: 'quantity',
        value: quantity,
        message: 'Quantity is zero; the line will not contribute units',
        severity: 'warning',
      })
    }

    // Amount columns must parse as decimals, with currency symbols stripped.
    for (const key of ['grossAmount', 'discountAmount', 'shippingRevenue', 'tax', 'paymentFees']) {
      const raw = (values[key] ?? '').replace(/[$£€,\s]/g, '')
      if (raw === '') continue
      if (!DECIMAL.test(raw)) {
        issues.push({
          line,
          field: key,
          value: values[key] ?? '',
          message: 'Not a valid amount',
          severity: key === 'grossAmount' ? 'error' : 'warning',
        })
        if (key === 'grossAmount') fatal = true
      } else {
        values[key] = raw
      }
    }

    // Dates must parse; an unparseable date silently lands revenue in the wrong period.
    const placedAt = values.placedAt ?? ''
    if (placedAt !== '') {
      const parsed = new Date(placedAt)
      if (Number.isNaN(parsed.getTime())) {
        issues.push({
          line,
          field: 'placedAt',
          value: placedAt,
          message: 'Could not read this as a date',
          severity: 'error',
        })
        fatal = true
      } else {
        values.placedAt = parsed.toISOString()
      }
    }

    if (!values.currency && options.defaultCurrency) {
      values.currency = options.defaultCurrency
    }

    const externalId = values.externalId ?? ''
    if (externalId !== '') {
      const first = seen.get(externalId)
      if (first !== undefined) {
        duplicatesInFile.push({ line, externalId, firstSeenLine: first })
        return
      }
      seen.set(externalId, line)
    }

    if (!fatal) valid.push({ line, values })
  })

  return { valid, issues, duplicatesInFile }
}

// ── Preview ─────────────────────────────────────────────────────────────────

export type ImportPreview = {
  totalRows: number
  willImport: number
  willSkipDuplicateInFile: number
  willSkipExisting: number
  errorRows: number
  warningCount: number
  malformedRows: number
  /** Sample of what will be created, for the confirmation screen. */
  sample: MappedRow[]
}

/**
 * Summarises an import before anything is written.
 *
 * `existingExternalIds` comes from the database and makes re-importing the same
 * export a no-op rather than a doubling of revenue — the single most damaging
 * import bug there is.
 */
export function buildPreview(
  parse: ParseResult,
  validation: ValidationResult,
  existingExternalIds: ReadonlySet<string>,
): ImportPreview {
  const fresh = validation.valid.filter(
    (row) => !existingExternalIds.has(row.values.externalId ?? ''),
  )
  const errorLines = new Set(
    validation.issues.filter((i) => i.severity === 'error').map((i) => i.line),
  )

  return {
    totalRows: parse.rows.length + parse.malformed.length,
    willImport: fresh.length,
    willSkipDuplicateInFile: validation.duplicatesInFile.length,
    willSkipExisting: validation.valid.length - fresh.length,
    errorRows: errorLines.size,
    warningCount: validation.issues.filter((i) => i.severity === 'warning').length,
    malformedRows: parse.malformed.length,
    sample: fresh.slice(0, 10),
  }
}

/** Stable hash of file content, so the same upload is rejected as a duplicate batch. */
export async function contentHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
