/**
 * The few Stripe calls AVANT makes, over plain fetch (no SDK). Every write
 * carries an idempotency key, so a retry after a timeout can never refund
 * or pay out twice.
 */

export class StripeError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const paymentsLive = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY)

export async function stripe<T>(
  path: string,
  opts: { method?: 'GET' | 'POST'; form?: Record<string, string>; idempotencyKey?: string } = {},
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new StripeError(503, 'Payments are not configured.')
  const headers: Record<string, string> = { authorization: `Bearer ${key}` }
  if (opts.form) headers['content-type'] = 'application/x-www-form-urlencoded'
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: opts.method ?? (opts.form ? 'POST' : 'GET'),
    headers,
    body: opts.form ? new URLSearchParams(opts.form).toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: string } }
  // Stripe's own message stays in our logs; callers show their own words.
  if (!res.ok) throw new StripeError(res.status, json.error?.code ?? `stripe ${res.status}`)
  return json
}

export const siteUrl = (): string => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
