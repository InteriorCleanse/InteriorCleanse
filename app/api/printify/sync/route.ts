import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'
import { fetchPrintifyProducts } from '@/lib/print-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Printify catalogue, mapped to the same Product shape as Printful. */
export async function GET() {
  try {
    const products = await fetchPrintifyProducts()
    return NextResponse.json({ count: products.length, products })
  } catch (e) {
    console.error('[printify/sync]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
