import { NextResponse } from 'next/server'
import { validateForPublish, type ValidationIssue } from '@/lib/catalog-schema'
import { readCatalog } from '@/lib/catalog-store'
import { errorBody } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type ValidationReport = {
  id: string
  slug: string
  name: string
  status: string
  ready: boolean
  issues: ValidationIssue[]
}

const report = (p: Awaited<ReturnType<typeof readCatalog>>[number]): ValidationReport => {
  const issues = validateForPublish(p)
  return { id: p.id, slug: p.slug, name: p.name, status: p.status, ready: issues.length === 0, issues }
}

/** Every product's publish readiness. `?id=` narrows to one. */
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id')
    const all = await readCatalog()
    const rows = (id ? all.filter((p) => p.id === id) : all).map(report)
    if (id && rows.length === 0) {
      return NextResponse.json({ error: `No product with id "${id}".` }, { status: 404 })
    }
    return NextResponse.json({ products: rows, ready: rows.filter((r) => r.ready).length, total: rows.length })
  } catch (e) {
    console.error('[admin/validate]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

/** Validates a product body without saving it — for the editor's live checks. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Parameters<typeof validateForPublish>[0]
    const issues = validateForPublish(body)
    return NextResponse.json({ ready: issues.length === 0, issues })
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: 400 })
  }
}
