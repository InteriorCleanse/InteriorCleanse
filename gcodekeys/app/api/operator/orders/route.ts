import { NextResponse } from 'next/server'
import { getOrder, listOrders } from '@/lib/orders'

export const runtime = 'nodejs'

// Operator-only (gated by middleware on /api/operator/*).
// GET /api/operator/orders           -> recent orders
// GET /api/operator/orders?ref=GCK-… -> one order
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get('ref')
  if (ref) {
    const order = await getOrder(ref.trim())
    if (!order) return NextResponse.json({ error: 'No order with that reference.' }, { status: 404 })
    return NextResponse.json({ order })
  }
  const orders = await listOrders(25)
  return NextResponse.json({ orders })
}
