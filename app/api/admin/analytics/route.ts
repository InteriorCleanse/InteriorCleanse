import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { env, configured, errorBody } from '@/lib/env'
import { listContacts } from '@/lib/brevo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type Analytics = {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  listSize: number
  revenueByWeek: { week: string; revenue: number }[]
  topProducts: { name: string; units: number }[]
  trafficSources: { source: string; count: number }[]
}

const WEEKS = 8

export async function GET() {
  try {
    const empty: Analytics = {
      totalRevenue: 0,
      totalOrders: 0,
      avgOrderValue: 0,
      listSize: 0,
      revenueByWeek: [],
      topProducts: [],
      trafficSources: [],
    }

    // ── Stripe: revenue, orders, product units ──────────────────────────
    let totalRevenue = 0
    let totalOrders = 0
    const weekBuckets = new Map<string, number>()
    const productUnits = new Map<string, number>()

    if (configured.stripe()) {
      const stripe = new Stripe(env.stripeSecret())
      const since = Math.floor(Date.now() / 1000) - WEEKS * 7 * 24 * 60 * 60

      const sessions = await stripe.checkout.sessions.list({
        limit: 100,
        created: { gte: since },
        expand: ['data.line_items'],
      })

      for (const s of sessions.data) {
        if (s.payment_status !== 'paid') continue
        const amount = (s.amount_total ?? 0) / 100
        totalRevenue += amount
        totalOrders += 1

        // Bucket by ISO week start (Monday) so the chart reads chronologically.
        const d = new Date(s.created * 1000)
        const day = (d.getUTCDay() + 6) % 7
        d.setUTCDate(d.getUTCDate() - day)
        const key = d.toISOString().slice(0, 10)
        weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + amount)

        for (const li of s.line_items?.data ?? []) {
          const name = li.description ?? 'Unknown'
          productUnits.set(name, (productUnits.get(name) ?? 0) + (li.quantity ?? 1))
        }
      }
    }

    // ── Brevo: list size and acquisition source ─────────────────────────
    let listSize = 0
    const sources = new Map<string, number>()

    if (configured.brevo()) {
      const data = await listContacts(500, 0)
      listSize = data?.count ?? (data?.contacts?.length ?? 0)
      for (const c of data?.contacts ?? []) {
        const src = c.attributes?.SOURCE ?? 'direct'
        sources.set(src, (sources.get(src) ?? 0) + 1)
      }
    }

    const revenueByWeek = Array.from(weekBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, revenue]) => ({ week, revenue: Math.round(revenue * 100) / 100 }))

    const topProducts = Array.from(productUnits.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, units]) => ({ name, units }))

    const trafficSources = Array.from(sources.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([source, count]) => ({ source, count }))

    const analytics: Analytics = {
      ...empty,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      avgOrderValue: totalOrders ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
      listSize,
      revenueByWeek,
      topProducts,
      trafficSources,
    }

    return NextResponse.json(analytics)
  } catch (e) {
    console.error('[admin/analytics]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
