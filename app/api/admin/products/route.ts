import { NextResponse } from 'next/server'
import {
  CATALOG_STATUSES,
  blankProduct,
  coerceProduct,
  validateForPublish,
  type CatalogProduct,
  type CatalogStatus,
  type ValidationIssue,
} from '@/lib/catalog-schema'
import { readCatalog, storeInfo, writeCatalog } from '@/lib/catalog-store'
import { errorBody } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type AdminProductRow = CatalogProduct & { issues: ValidationIssue[] }

export type AdminProductsResponse = {
  products: AdminProductRow[]
  counts: Record<CatalogStatus, number>
  store: ReturnType<typeof storeInfo>
}

const withIssues = (p: CatalogProduct): AdminProductRow => ({ ...p, issues: validateForPublish(p) })

const counts = (all: CatalogProduct[]) => {
  const c = Object.fromEntries(CATALOG_STATUSES.map((s) => [s, 0])) as Record<CatalogStatus, number>
  for (const p of all) c[p.status]++
  return c
}

/** The whole catalog, every record annotated with what still blocks publishing. */
export async function GET() {
  try {
    const all = await readCatalog()
    const body: AdminProductsResponse = {
      products: all.map(withIssues),
      counts: counts(all),
      store: storeInfo(),
    }
    return NextResponse.json(body)
  } catch (e) {
    console.error('[admin/products GET]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

/**
 * Creates a product. Body: any subset of CatalogProduct fields; `name` or
 * `slug` required. Always created as `draft` regardless of what was sent —
 * publishing goes through PUT so the gate applies.
 */
export async function POST(req: Request) {
  try {
    const input = (await req.json()) as Record<string, unknown>
    const { product, problems } = coerceProduct(input, blankProduct())
    if (!product.name && !product.slug) problems.push('name or slug is required')
    if (problems.length) return NextResponse.json({ error: problems.join('; ') }, { status: 400 })

    const all = await readCatalog()
    if (all.some((p) => p.slug === product.slug)) {
      return NextResponse.json({ error: `A product with slug "${product.slug}" already exists.` }, { status: 409 })
    }
    product.status = 'draft'
    all.push(product)
    const commit = await writeCatalog(all, `catalog: add ${product.slug}`)
    return NextResponse.json({ product: withIssues(product), commit })
  } catch (e) {
    console.error('[admin/products POST]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

/**
 * Updates one product. Body: `{ id, ...fields }`. A change to `published`
 * is refused with the blocking issues unless every rule passes — the admin
 * shows the same list, but this is the gate.
 */
export async function PUT(req: Request) {
  try {
    const input = (await req.json()) as Record<string, unknown>
    const id = String(input.id ?? '')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const all = await readCatalog()
    const idx = all.findIndex((p) => p.id === id)
    if (idx < 0) return NextResponse.json({ error: `No product with id "${id}".` }, { status: 404 })

    const { product, problems } = coerceProduct(input, all[idx])
    if (problems.length) return NextResponse.json({ error: problems.join('; ') }, { status: 400 })

    if (product.slug !== all[idx].slug && all.some((p, i) => i !== idx && p.slug === product.slug)) {
      return NextResponse.json({ error: `Slug "${product.slug}" is already in use.` }, { status: 409 })
    }

    const issues = validateForPublish(product)
    if (product.status === 'published' && issues.length) {
      return NextResponse.json(
        { error: 'Cannot publish yet.', issues },
        { status: 422 }
      )
    }

    all[idx] = product
    const commit = await writeCatalog(all, `catalog: update ${product.slug}`)
    return NextResponse.json({ product: withIssues(product), commit })
  } catch (e) {
    console.error('[admin/products PUT]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

/**
 * Bulk status change. Body: `{ ids: string[], status }`. Products that fail
 * the publish gate are skipped and reported, never half-published.
 */
export async function PATCH(req: Request) {
  try {
    const { ids, status } = (await req.json()) as { ids: string[]; status: CatalogStatus }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids is required' }, { status: 400 })
    }
    if (!CATALOG_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${CATALOG_STATUSES.join(', ')}` }, { status: 400 })
    }

    const all = await readCatalog()
    const changed: string[] = []
    const skipped: { id: string; issues: ValidationIssue[] }[] = []
    const now = new Date().toISOString()
    for (const p of all) {
      if (!ids.includes(p.id)) continue
      if (status === 'published') {
        const issues = validateForPublish(p)
        if (issues.length) {
          skipped.push({ id: p.id, issues })
          continue
        }
      }
      p.status = status
      p.updatedAt = now
      changed.push(p.id)
    }
    const commit = changed.length
      ? await writeCatalog(all, `catalog: set ${changed.length} product(s) to ${status}`)
      : null
    return NextResponse.json({ changed, skipped, commit })
  } catch (e) {
    console.error('[admin/products PATCH]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

/** Deletes a product. Body: `{ id }`. Published products must be unpublished first. */
export async function DELETE(req: Request) {
  try {
    const { id } = (await req.json()) as { id: string }
    const all = await readCatalog()
    const target = all.find((p) => p.id === id)
    if (!target) return NextResponse.json({ error: `No product with id "${id}".` }, { status: 404 })
    if (target.status === 'published') {
      return NextResponse.json({ error: 'Unpublish before deleting.' }, { status: 409 })
    }
    const commit = await writeCatalog(
      all.filter((p) => p.id !== id),
      `catalog: remove ${target.slug}`
    )
    return NextResponse.json({ removed: id, commit })
  } catch (e) {
    console.error('[admin/products DELETE]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
