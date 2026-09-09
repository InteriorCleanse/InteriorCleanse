import { NextResponse } from 'next/server'
import { syncIntoCatalog } from '@/lib/catalog-sync'
import { errorBody } from '@/lib/env'
import { fetchPrintfulProducts } from '@/lib/print-providers'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Read-only preview: the Printful catalogue mapped to the site's Product shape. */
export async function GET() {
  try {
    const products = await fetchPrintfulProducts()
    return NextResponse.json({ count: products.length, products })
  } catch (e) {
    console.error('[printful/sync]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

/**
 * Writes the Printful catalogue into content/catalog.json as `needs-pricing`
 * records (see lib/catalog-sync for what a re-sync may and may not touch).
 *
 * This path is outside /api/admin, so the middleware does not guard it; the
 * session is verified here directly. A write to the catalog is an admin act.
 */
export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? ''
    const token = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`))?.[1]
    if (!(await verifySessionToken(token))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const products = await fetchPrintfulProducts()
    const summary = await syncIntoCatalog('printful', products)
    return NextResponse.json({ fetched: products.length, ...summary })
  } catch (e) {
    console.error('[printful/sync POST]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
