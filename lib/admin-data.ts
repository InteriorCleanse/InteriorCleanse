import Stripe from 'stripe'
import { env, configured } from './env'
import { listContacts } from './brevo'

/**
 * Shared admin data access.
 *
 * The /api/admin/{analytics,orders,contacts} routes and the JARVIS tools both
 * read business data. Keeping the queries here means one implementation and one
 * set of shapes — a fix to how revenue is counted lands in the dashboard and in
 * what JARVIS says out loud at the same time.
 *
 * Revenue is counted from paid Checkout Sessions rather than raw charges, so a
 * multi-line order counts once and line items are available for product totals.
 */

export type Analytics = {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  listSize: number
  revenueByWeek: { week: string; revenue: number }[]
  topProducts: { name: string; units: number }[]
  trafficSources: { source: string; count: number }[]
}

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

export type AdminContact = {
  email: string
  firstName: string
  lastName: string
  source: string
  signupDate: string | null
  lastOrderDate: string | null
  totalSpent: number
  listIds: number[]
}

const WEEKS = 8
const round2 = (n: number) => Math.round(n * 100) / 100

export function stripeClient(): Stripe {
  return new Stripe(env.stripeSecret())
}

export async function getAnalytics(): Promise<Analytics> {
  let totalRevenue = 0
  let totalOrders = 0
  const weekBuckets = new Map<string, number>()
  const productUnits = new Map<string, number>()

  if (configured.stripe()) {
    const stripe = stripeClient()
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

  let listSize = 0
  const sources = new Map<string, number>()

  if (configured.brevo()) {
    const data = await listContacts(500, 0)
    listSize = data?.count ?? data?.contacts?.length ?? 0
    for (const c of data?.contacts ?? []) {
      const src = c.attributes?.SOURCE ?? 'direct'
      sources.set(src, (sources.get(src) ?? 0) + 1)
    }
  }

  return {
    totalRevenue: round2(totalRevenue),
    totalOrders,
    avgOrderValue: totalOrders ? round2(totalRevenue / totalOrders) : 0,
    listSize,
    revenueByWeek: Array.from(weekBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, revenue]) => ({ week, revenue: round2(revenue) })),
    topProducts: Array.from(productUnits.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, units]) => ({ name, units })),
    trafficSources: Array.from(sources.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([source, count]) => ({ source, count })),
  }
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
    console.error('[admin-data] printful lookup', e)
  }
  return map
}

export async function getOrders(): Promise<{
  orders: AdminOrder[]
  revenue: number
  configured: boolean
}> {
  if (!configured.stripe()) return { orders: [], revenue: 0, configured: false }

  const stripe = stripeClient()
  const [sessions, printful] = await Promise.all([
    stripe.checkout.sessions.list({ limit: 100, expand: ['data.line_items'] }),
    printfulOrdersByEmail(),
  ])

  const orders: AdminOrder[] = sessions.data
    .filter((s) => s.payment_status === 'paid')
    .map((s) => {
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

  return {
    orders,
    revenue: round2(orders.reduce((sum, o) => sum + o.amount, 0)),
    configured: true,
  }
}

export async function getContacts(
  limit = 100,
  offset = 0,
): Promise<{ contacts: AdminContact[]; total: number; configured: boolean }> {
  if (!configured.brevo()) return { contacts: [], total: 0, configured: false }

  const data = await listContacts(limit, offset)
  const contacts: AdminContact[] = (data?.contacts ?? []).map((c: any) => {
    const a = c.attributes ?? {}
    return {
      email: c.email,
      firstName: a.FIRSTNAME ?? '',
      lastName: a.LASTNAME ?? '',
      source: a.SOURCE ?? '—',
      signupDate: a.SIGNUP_DATE ?? c.createdAt ?? null,
      lastOrderDate: a.LAST_ORDER_DATE ?? null,
      totalSpent: Number(a.TOTAL_SPENT ?? a.LAST_ORDER_AMOUNT ?? 0),
      listIds: c.listIds ?? [],
    }
  })

  return { contacts, total: data?.count ?? contacts.length, configured: true }
}

/**
 * Revenue over a named window, for the JARVIS get_revenue tool. Distinct from
 * getAnalytics, which is fixed to the last 8 weeks for the dashboard chart.
 */
export type RevenuePeriod = 'today' | 'week' | 'month' | 'all'

const PERIOD_SECONDS: Record<Exclude<RevenuePeriod, 'all'>, number> = {
  today: 86_400,
  week: 604_800,
  month: 2_592_000,
}

export async function getRevenueForPeriod(period: RevenuePeriod) {
  if (!configured.stripe()) {
    return { period, revenue: 0, orders: 0, averageOrder: 0, configured: false as const }
  }

  const window = period === 'all' ? undefined : PERIOD_SECONDS[period]
  const sessions = await stripeClient().checkout.sessions.list({
    limit: 100,
    ...(window ? { created: { gte: Math.floor(Date.now() / 1000) - window } } : {}),
  })

  const paid = sessions.data.filter((s) => s.payment_status === 'paid')
  const revenue = paid.reduce((sum, s) => sum + (s.amount_total ?? 0) / 100, 0)

  return {
    period,
    revenue: round2(revenue),
    orders: paid.length,
    averageOrder: paid.length ? round2(revenue / paid.length) : 0,
    configured: true as const,
    ...(sessions.has_more ? { note: 'Only the most recent 100 orders were counted.' } : {}),
  }
}
