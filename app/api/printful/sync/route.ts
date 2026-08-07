import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'
import { fetchPrintfulProducts } from '@/lib/print-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Returns the Printful catalogue mapped to the site's Product shape.
 *
 * This route only *reads*. Writing content/products.json happens in
 * `npm run sync`, because a serverless filesystem is read-only and ephemeral —
 * a route that wrote the file would appear to work and lose the change on the
 * next deploy.
 */
export async function GET() {
  try {
    const products = await fetchPrintfulProducts()
    return NextResponse.json({ count: products.length, products })
  } catch (e) {
    console.error('[printful/sync]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
