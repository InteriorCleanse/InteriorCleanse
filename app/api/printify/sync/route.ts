import { NextResponse } from 'next/server'
import { syncIntoCatalog } from '@/lib/catalog-sync'
import { errorBody } from '@/lib/env'
import { fetchPrintifyProducts } from '@/lib/print-providers'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Read-only preview: the Printify catalogue mapped to the same Product shape as Printful. */
export async function GET() {
  try {
    const products = await fetchPrintifyProducts()
    return NextResponse.json({ count: products.length, products })
  } catch (e) {
    console.error('[printify/sync]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

/** Writes the Printify catalogue into the catalog as `needs-pricing`. Admin session required. */
export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? ''
    const token = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`))?.[1]
    if (!(await verifySessionToken(token))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const products = await fetchPrintifyProducts()
    const summary = await syncIntoCatalog('printify', products)
    return NextResponse.json({ fetched: products.length, ...summary })
  } catch (e) {
    console.error('[printify/sync POST]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
