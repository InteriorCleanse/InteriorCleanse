import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { env, configured, errorBody } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type AdminOrder = {
  id: string
  date: string
  customer: string
  email: string
  products: string[]
  amount: number
  status: string
  fulfillment: string
  tracking: string | null
}

/** Printful orders keyed by recipient email, for fulfilment status lookup. */
async function printfulOrdersByEmail(): Promise<Map<string, any>> {
  const map = new Map<string, any>()
  if (!configured.printful()) return map

  try {
    const res = await fetch('https://api.printful.com/orders?limit=100', {
      headers: { Authorization: `Bearer ${env.printfulKey()}` },
    })
    if (!res.ok) return map

    const data = await res.json()
    for (const order of data?.result ?? []) {
      const email = order?.recipient?.email
      if (email) map.set(email.toLowerCase(), order)
    }
  } catch (e) {
    // Fulfilment status is supplementary — orders still render without it.
    console.error('[admin/orders] printful lookup', e)
  }
  return map
}

export async function GET() {
  try {
    if (!configured.stripe()) {
      return NextResponse.json({ orders: [], revenue: 0, configured: false })
    }

    const stripe = new Stripe(env.stripeSecret())
    const [sessions, printful] = await Promise.all([
      stripe.checkout.sessions.list({ limit: 100, expand: ['data.line_items'] }),
      printfulOrdersByEmail(),
    ])

    const paid = sessions.data.filter((s) => s.payment_status === 'paid')

    const orders: AdminOrder[] = paid.map((s) => {
      const email = s.customer_details?.email ?? ''
      const pf = printful.get(email.toLowerCase())
      return {
        id: s.id,
        date: new Date(s.created * 1000).toISOString(),
        customer: s.customer_details?.name ?? '—',
        email,
        products: (s.line_items?.data ?? []).map((li) => li.description ?? ''),
        amount: (s.amount_total ?? 0) / 100,
        status: s.payment_status,
        fulfillment: pf?.status ?? (configured.printful() ? 'not found' : 'n/a'),
        tracking: pf?.shipments?.[0]?.tracking_url ?? null,
      }
    })

    const revenue = orders.reduce((sum, o) => sum + o.amount, 0)

    return NextResponse.json({ orders, revenue, configured: true })
  } catch (e) {
    console.error('[admin/orders]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
