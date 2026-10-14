import { NextResponse } from 'next/server'
import { getOrder, listOrders, updateOrder, OPERATOR_STATUSES, type OrderStatus } from '@/lib/orders'

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

// PATCH /api/operator/orders  { ref, status } -> move an order through its
// lifecycle. Only the operator-driven statuses are accepted; 'quoted' and
// 'paid' follow money events, not a button, so they are rejected here.
export async function PATCH(req: Request) {
  let body: { ref?: string; status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
  const ref = (body.ref ?? '').trim()
  const status = body.status as OrderStatus
  if (!ref) return NextResponse.json({ error: 'Order reference is required.' }, { status: 400 })
  if (!OPERATOR_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Status must be one of: ${OPERATOR_STATUSES.join(', ')}.` },
      { status: 400 },
    )
  }
  const updated = await updateOrder(ref, { status, statusUpdatedAt: new Date().toISOString() })
  if (!updated) return NextResponse.json({ error: 'No order with that reference.' }, { status: 404 })
  return NextResponse.json({ order: updated })
}
