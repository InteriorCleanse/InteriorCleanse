import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Stripe access, without the SDK.
 *
 * Two reasons this is hand-rolled rather than `npm install stripe`: the surface
 * we need is three REST calls and one signature check, and the signature check
 * is the single most security-relevant function in the billing path — it
 * decides whether an unauthenticated HTTP request is allowed to change what a
 * workspace is entitled to. Code that important should be readable in one
 * screen and directly unit-tested, not delegated.
 *
 * The verification implements Stripe's documented scheme: sign
 * `timestamp.payload` with the endpoint secret, compare in constant time, and
 * reject anything outside a tolerance window so a captured request cannot be
 * replayed later.
 */

export class StripeError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'bad_signature' | 'replay' | 'api_error',
  ) {
    super(message)
    this.name = 'StripeError'
  }
}

/** Stripe's own default. Wide enough for clock skew, narrow enough to matter. */
export const SIGNATURE_TOLERANCE_SECONDS = 300

export type VerifiedEvent = {
  id: string
  type: string
  data: { object: Record<string, unknown> }
  created: number
}

/**
 * Verifies a webhook signature and parses the event.
 *
 * Takes the **raw body string**, never a re-serialised object: `JSON.parse`
 * followed by `JSON.stringify` changes bytes (key order, unicode escapes,
 * number formatting) and the signature is over bytes. This is the most common
 * way webhook verification is accidentally disabled.
 */
export function verifyWebhook(input: {
  rawBody: string
  signatureHeader: string | null
  secret: string
  now?: Date
}): VerifiedEvent {
  if (!input.secret) {
    throw new StripeError('No webhook secret is configured.', 'not_configured')
  }
  if (!input.signatureHeader) {
    throw new StripeError('Missing signature header.', 'bad_signature')
  }

  // Header form: t=1700000000,v1=abc...,v1=def...
  let timestamp: number | null = null
  const signatures: string[] = []

  for (const part of input.signatureHeader.split(',')) {
    const [key, value] = part.trim().split('=')
    if (key === 't' && value) timestamp = Number(value)
    if (key === 'v1' && value) signatures.push(value)
  }

  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) {
    throw new StripeError('Malformed signature header.', 'bad_signature')
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000)
  const age = Math.abs(nowSeconds - timestamp)
  if (age > SIGNATURE_TOLERANCE_SECONDS) {
    // A valid signature on a request from an hour ago is a replay, not a late
    // delivery — Stripe's own retries re-sign with a fresh timestamp.
    throw new StripeError('Signature timestamp is outside the tolerance window.', 'replay')
  }

  const expected = createHmac('sha256', input.secret)
    .update(`${timestamp}.${input.rawBody}`, 'utf8')
    .digest('hex')

  // Stripe sends several v1 signatures during secret rotation; any match is
  // valid. Compared in constant time so a timing oracle cannot be built.
  const matched = signatures.some((candidate) => {
    if (candidate.length !== expected.length) return false
    return timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(expected, 'utf8'))
  })

  if (!matched) throw new StripeError('Signature does not match.', 'bad_signature')

  let parsed: VerifiedEvent
  try {
    parsed = JSON.parse(input.rawBody) as VerifiedEvent
  } catch {
    throw new StripeError('Body is not valid JSON.', 'bad_signature')
  }

  if (!parsed.id || !parsed.type || !parsed.data?.object) {
    throw new StripeError('Event is missing required fields.', 'bad_signature')
  }

  return parsed
}

/**
 * Maps a Stripe subscription status onto ours.
 *
 * Unknown statuses map to `incomplete`, which grants nothing. Stripe adds
 * statuses over time, and the failure mode of guessing generously is giving
 * away the product.
 */
export function mapStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'unpaid':
    case 'canceled':
      return stripeStatus
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
    default:
      return 'incomplete'
  }
}

// ── Thin REST client ────────────────────────────────────────────────────────

const API = 'https://api.stripe.com/v1'

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new StripeError('STRIPE_SECRET_KEY is not set.', 'not_configured')
  return key
}

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/**
 * Stripe takes form encoding, including for nested fields, which is why this
 * flattener exists rather than a JSON body.
 */
export function encodeForm(payload: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === 'object') {
          parts.push(encodeForm(item as Record<string, unknown>, `${name}[${index}]`))
        } else {
          parts.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`)
        }
      })
    } else if (typeof value === 'object') {
      parts.push(encodeForm(value as Record<string, unknown>, name))
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
    }
  }

  return parts.filter(Boolean).join('&')
}

async function call<T>(
  path: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey()}`,
      'content-type': 'application/x-www-form-urlencoded',
      // Without this, a retried checkout creates a second subscription.
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: encodeForm(payload),
  })

  if (!response.ok) {
    // Stripe's error bodies quote the request, which can include customer
    // email. Log the status, surface nothing else.
    throw new StripeError(`Stripe returned ${response.status}.`, 'api_error')
  }

  return (await response.json()) as T
}

export async function createCheckoutSession(input: {
  customerId: string | null
  customerEmail: string
  priceId: string
  organizationId: string
  successUrl: string
  cancelUrl: string
}): Promise<{ id: string; url: string }> {
  return call(
    '/checkout/sessions',
    {
      mode: 'subscription',
      'line_items[0][price]': input.priceId,
      'line_items[0][quantity]': 1,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      ...(input.customerId
        ? { customer: input.customerId }
        : { customer_email: input.customerEmail }),
      // The workspace id travels on the subscription, not just the session, so
      // a webhook arriving months later can still be attributed.
      'subscription_data[metadata][organization_id]': input.organizationId,
      'metadata[organization_id]': input.organizationId,
      client_reference_id: input.organizationId,
    },
    `checkout:${input.organizationId}:${input.priceId}`,
  )
}

export async function createPortalSession(input: {
  customerId: string
  returnUrl: string
}): Promise<{ url: string }> {
  return call('/billing_portal/sessions', {
    customer: input.customerId,
    return_url: input.returnUrl,
  })
}

/** Price id for a plan, from configuration rather than hardcoded. */
export function priceIdFor(planKey: string): string | null {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
    scale: process.env.STRIPE_PRICE_SCALE,
  }
  return map[planKey] ?? null
}

/** The reverse lookup, for mirroring a webhook back onto a plan. */
export function planKeyForPrice(priceId: string | null | undefined): string {
  if (!priceId) return 'free'
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter'
  if (priceId === process.env.STRIPE_PRICE_GROWTH) return 'growth'
  if (priceId === process.env.STRIPE_PRICE_SCALE) return 'scale'
  // An unrecognised price must not silently grant a tier.
  return 'free'
}
