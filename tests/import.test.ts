import { describe, expect, it } from 'vitest'
import {
  buildPreview,
  contentHash,
  ORDER_FIELDS,
  parseCsv,
  suggestMapping,
  validateRows,
} from '@/lib/import/csv'

describe('parseCsv', () => {
  it('parses a plain file', () => {
    const result = parseCsv('a,b\n1,2\n3,4\n')
    expect(result.headers).toEqual(['a', 'b'])
    expect(result.rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
    expect(result.malformed).toEqual([])
  })

  it('handles quoted fields containing the delimiter', () => {
    // The case a naive split(',') gets wrong on almost every real export.
    const result = parseCsv('name,total\n"Candle, large",19.99\n')
    expect(result.rows[0]).toEqual({ name: 'Candle, large', total: '19.99' })
  })

  it('handles embedded newlines and doubled quotes', () => {
    const result = parseCsv('name,note\n"Two\nlines","He said ""hi"""\n')
    expect(result.rows[0]?.name).toBe('Two\nlines')
    expect(result.rows[0]?.note).toBe('He said "hi"')
  })

  it('strips the Excel BOM', () => {
    const result = parseCsv('﻿order id,total\n1,5\n')
    expect(result.headers[0]).toBe('order id')
  })

  it('handles CRLF line endings', () => {
    const result = parseCsv('a,b\r\n1,2\r\n')
    expect(result.rows).toEqual([{ a: '1', b: '2' }])
  })

  it('collects malformed rows instead of throwing', () => {
    const result = parseCsv('a,b\n1,2\n3\n4,5\n')
    expect(result.rows).toHaveLength(2)
    expect(result.malformed).toHaveLength(1)
    expect(result.malformed[0]?.line).toBe(3)
  })

  it('returns nothing for an empty file', () => {
    expect(parseCsv('').rows).toEqual([])
    expect(parseCsv('\n\n').rows).toEqual([])
  })

  it('handles a file with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2').rows).toEqual([{ a: '1', b: '2' }])
  })
})

describe('suggestMapping', () => {
  it('matches common Shopify-style headers', () => {
    const mapping = suggestMapping([
      'Name',
      'Created at',
      'Lineitem name',
      'Lineitem quantity',
      'Lineitem price',
      'Currency',
    ])
    expect(mapping.externalId).toBe('Name')
    expect(mapping.placedAt).toBe('Created at')
    expect(mapping.quantity).toBe('Lineitem quantity')
    expect(mapping.currency).toBe('Currency')
  })

  it('never maps one header to two fields', () => {
    const mapping = suggestMapping(['total', 'discount'])
    const assigned = Object.values(mapping).filter(Boolean)
    expect(new Set(assigned).size).toBe(assigned.length)
  })

  it('returns null for fields it cannot find', () => {
    const mapping = suggestMapping(['completely', 'unrelated'])
    expect(mapping.placedAt).toBeNull()
  })
})

const MAPPING = {
  externalId: 'order id',
  placedAt: 'date',
  productName: 'product',
  quantity: 'qty',
  grossAmount: 'total',
  discountAmount: null,
  sku: null,
  currency: null,
  customerEmail: null,
  shippingRevenue: null,
  tax: null,
  paymentFees: null,
}

describe('validateRows', () => {
  it('accepts a clean file', () => {
    const { rows } = parseCsv('order id,date,product,qty,total\n1001,2026-01-05,Candle,2,39.98\n')
    const result = validateRows(rows, MAPPING, ORDER_FIELDS, { defaultCurrency: 'USD' })
    expect(result.valid).toHaveLength(1)
    expect(result.issues).toHaveLength(0)
    expect(result.valid[0]?.values.currency).toBe('USD')
  })

  it('flags missing required fields as errors and drops the row', () => {
    const { rows } = parseCsv('order id,date,product,qty,total\n,2026-01-05,Candle,2,39.98\n')
    const result = validateRows(rows, MAPPING)
    expect(result.valid).toHaveLength(0)
    expect(result.issues.some((i) => i.field === 'externalId' && i.severity === 'error')).toBe(true)
  })

  it('rejects an unreadable date rather than misfiling revenue', () => {
    const { rows } = parseCsv('order id,date,product,qty,total\n1,not-a-date,Candle,1,10\n')
    const result = validateRows(rows, MAPPING)
    expect(result.valid).toHaveLength(0)
    expect(result.issues.some((i) => i.field === 'placedAt')).toBe(true)
  })

  it('normalises dates to ISO', () => {
    const { rows } = parseCsv('order id,date,product,qty,total\n1,2026-01-05,Candle,1,10\n')
    const result = validateRows(rows, MAPPING)
    expect(result.valid[0]?.values.placedAt).toBe('2026-01-05T00:00:00.000Z')
  })

  it('strips currency symbols and thousands separators from amounts', () => {
    const { rows } = parseCsv('order id,date,product,qty,total\n1,2026-01-05,Candle,1,"$1,234.56"\n')
    const result = validateRows(rows, MAPPING)
    expect(result.valid[0]?.values.grossAmount).toBe('1234.56')
  })

  it('rejects a non-numeric quantity', () => {
    const { rows } = parseCsv('order id,date,product,qty,total\n1,2026-01-05,Candle,two,10\n')
    const result = validateRows(rows, MAPPING)
    expect(result.valid).toHaveLength(0)
    expect(result.issues.some((i) => i.field === 'quantity')).toBe(true)
  })

  it('warns but keeps a zero quantity', () => {
    const { rows } = parseCsv('order id,date,product,qty,total\n1,2026-01-05,Candle,0,0\n')
    const result = validateRows(rows, MAPPING)
    expect(result.valid).toHaveLength(1)
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true)
  })

  it('detects duplicates within the same file', () => {
    const { rows } = parseCsv(
      'order id,date,product,qty,total\n1,2026-01-05,Candle,1,10\n1,2026-01-05,Candle,1,10\n',
    )
    const result = validateRows(rows, MAPPING)
    expect(result.valid).toHaveLength(1)
    expect(result.duplicatesInFile).toHaveLength(1)
    expect(result.duplicatesInFile[0]?.firstSeenLine).toBe(2)
  })
})

describe('buildPreview', () => {
  it('reports exactly what will happen before anything is written', () => {
    const parse = parseCsv(
      [
        'order id,date,product,qty,total',
        '1,2026-01-05,Candle,1,10', // already imported
        '2,2026-01-06,Tote,1,20', // new
        '2,2026-01-06,Tote,1,20', // duplicate in file
        ',2026-01-07,Broken,1,30', // error
      ].join('\n'),
    )
    const validation = validateRows(parse.rows, MAPPING)
    const preview = buildPreview(parse, validation, new Set(['1']))

    expect(preview.willImport).toBe(1)
    expect(preview.willSkipExisting).toBe(1)
    expect(preview.willSkipDuplicateInFile).toBe(1)
    expect(preview.errorRows).toBe(1)
  })

  it('makes a full re-import a no-op', () => {
    const parse = parseCsv('order id,date,product,qty,total\n1,2026-01-05,Candle,1,10\n')
    const validation = validateRows(parse.rows, MAPPING)
    const preview = buildPreview(parse, validation, new Set(['1']))
    expect(preview.willImport).toBe(0)
    expect(preview.willSkipExisting).toBe(1)
  })
})

describe('contentHash', () => {
  it('is stable and content-sensitive', async () => {
    const a = await contentHash('order id,total\n1,10\n')
    const b = await contentHash('order id,total\n1,10\n')
    const c = await contentHash('order id,total\n1,11\n')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toHaveLength(64)
  })
})
