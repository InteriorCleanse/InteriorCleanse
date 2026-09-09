import { NextResponse } from 'next/server'
import { CSV_COLUMNS, blankProduct, coerceProduct } from '@/lib/catalog-schema'
import { readCatalog, writeCatalog } from '@/lib/catalog-store'
import { parseCsv } from '@/lib/csv'
import { errorBody } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The template a spreadsheet can start from: one header row, no data. */
export async function GET() {
  return new NextResponse(CSV_COLUMNS.join(',') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="catalog-template.csv"',
    },
  })
}

/**
 * Imports a CSV as drafts.
 *
 * Every row is validated against the schema first; if any row is bad the
 * whole import is refused with every problem listed, so a spreadsheet is fixed
 * once rather than row by row. Rows whose slug already exists are skipped, not
 * overwritten — an import never silently edits a product someone has finished.
 * Everything that lands is `draft`, whatever the sheet said.
 */
export async function POST(req: Request) {
  try {
    const text = await req.text()
    const rows = parseCsv(text)
    if (rows.length < 2) return NextResponse.json({ error: 'The CSV has a header but no rows.' }, { status: 400 })

    const header = rows[0].map((h) => h.trim())
    const unknown = header.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h) && h !== '')
    if (unknown.length) {
      return NextResponse.json(
        { error: `Unknown column(s): ${unknown.join(', ')}. Download the template for the accepted set.` },
        { status: 400 }
      )
    }

    const all = await readCatalog()
    const existing = new Set(all.map((p) => p.slug))
    const problems: string[] = []
    const created: string[] = []
    const skipped: string[] = []
    const seen = new Set<string>()

    for (let r = 1; r < rows.length; r++) {
      const record: Record<string, unknown> = {}
      header.forEach((h, i) => {
        if (h) record[h] = rows[r][i] ?? ''
      })
      const { product, problems: rowProblems } = coerceProduct(record, blankProduct())
      if (!product.name && !product.slug) rowProblems.push('name or slug is required')
      if (rowProblems.length) {
        problems.push(`Row ${r + 1}: ${rowProblems.join('; ')}`)
        continue
      }
      if (existing.has(product.slug) || seen.has(product.slug)) {
        skipped.push(product.slug)
        continue
      }
      seen.add(product.slug)
      product.status = 'draft'
      all.push(product)
      created.push(product.slug)
    }

    if (problems.length) {
      return NextResponse.json({ error: 'Fix these rows and re-upload.', problems }, { status: 422 })
    }

    const commit = created.length
      ? await writeCatalog(all, `catalog: import ${created.length} draft(s) from CSV`)
      : null
    return NextResponse.json({ created, skipped, commit })
  } catch (e) {
    console.error('[admin/products/import]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
