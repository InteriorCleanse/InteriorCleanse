// Order store. Durable on Vercel KV (Upstash Redis REST) when its env vars are
// present; an in-memory Map otherwise so preview and dev work with no setup.
//
// Set in the Vercel project (from a Vercel KV / Upstash integration):
//   KV_REST_API_URL, KV_REST_API_TOKEN
// Without them the store is in-memory and NOT durable across serverless
// instances — fine for preview, not for production.

export type OrderStatus = 'requested' | 'quoted' | 'paid' | 'canceled'

export type Order = {
  ref: string
  status: OrderStatus
  createdAt: string
  // What the customer asked for.
  items: Array<{ name: string; qty: number; price: number; meta?: string }>
  contact: { name: string; email: string; phone?: string; city?: string }
  service: 'come' | 'mail'
  vehicle: string
  docs: { id: boolean; registration: boolean }
  ownershipConfirmed: boolean
  // Set by the operator when the flat price is confirmed.
  quotedAmount?: number | null
  // Set by the Stripe webhook on payment.
  paidAt?: string | null
  paymentAmount?: number | null
  stripeSessionId?: string | null
}

const KV_URL = process.env.KV_REST_API_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN

export function ordersDurable(): boolean {
  return !!(KV_URL && KV_TOKEN)
}

// ---- Vercel KV (Upstash REST) single-command helper -------------------------
async function kv<T = unknown>(command: unknown[]): Promise<T> {
  const r = await fetch(KV_URL as string, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`KV ${command[0]} failed: ${r.status}`)
  const data = (await r.json()) as { result: T }
  return data.result
}

const key = (ref: string) => `order:${ref}`
const INDEX = 'orders:index'

// ---- In-memory fallback -----------------------------------------------------
// Held on globalThis so it is shared across separately-bundled route modules
// and survives dev HMR. This spans one warm instance only — serverless scales
// to many isolated instances, so it is NOT durable. Use KV for production.
const g = globalThis as unknown as { __gckOrders?: Map<string, Order> }
const mem: Map<string, Order> = g.__gckOrders ?? (g.__gckOrders = new Map<string, Order>())

// ---- Public API -------------------------------------------------------------
export async function saveOrder(order: Order): Promise<void> {
  if (ordersDurable()) {
    await kv(['SET', key(order.ref), JSON.stringify(order)])
    await kv(['LPUSH', INDEX, order.ref])
    await kv(['LTRIM', INDEX, 0, 499]) // keep the index bounded
    return
  }
  mem.set(order.ref, order)
}

export async function getOrder(ref: string): Promise<Order | null> {
  if (ordersDurable()) {
    const raw = await kv<string | null>(['GET', key(ref)])
    return raw ? (JSON.parse(raw) as Order) : null
  }
  return mem.get(ref) ?? null
}

export async function updateOrder(ref: string, patch: Partial<Order>): Promise<Order | null> {
  const current = await getOrder(ref)
  if (!current) return null
  const next = { ...current, ...patch }
  if (ordersDurable()) {
    await kv(['SET', key(ref), JSON.stringify(next)])
  } else {
    mem.set(ref, next)
  }
  return next
}

export async function listOrders(limit = 25): Promise<Order[]> {
  if (ordersDurable()) {
    const refs = await kv<string[]>(['LRANGE', INDEX, 0, Math.max(0, limit - 1)])
    if (!refs?.length) return []
    const results = await Promise.all(refs.map((r) => getOrder(r)))
    return results.filter((o): o is Order => !!o)
  }
  return [...mem.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit)
}

// Shared reference generator so intake and lookups agree on the format.
export function newRef(): string {
  return (
    'GCK-' +
    Math.random().toString(36).slice(2, 7).toUpperCase() +
    '-' +
    Date.now().toString(36).slice(-4).toUpperCase()
  )
}
