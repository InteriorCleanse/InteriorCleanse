import { supabaseAdmin } from '@/lib/supabase/server'
import { StripeError, mapStatus, planKeyForPrice, verifyWebhook } from '@/lib/billing/stripe'

/**
 * The Stripe webhook.
 *
 * The only unauthenticated endpoint that can change what a workspace is
 * entitled to, so every line here is about not trusting the caller:
 *
 *   - The raw body is verified before it is parsed. Not after, and not from a
 *     re-serialised object — the signature is over bytes.
 *   - Every event id is recorded before its effect is applied. Stripe delivers
 *     at least once and retries on any non-2xx; without this, a retry after a
 *     partial failure applies the change twice.
 *   - Out-of-order delivery is expected, so state is mirrored from the event's
 *     own object rather than computed from a delta.
 *   - The workspace is resolved from subscription metadata we set at checkout,
 *     never from anything a caller could choose.
 *
 * A verification failure returns 400 — Stripe stops retrying, which is right,
 * because retrying a forged request forever helps nobody. A *processing*
 * failure returns 500 so Stripe retries.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return new Response('Billing is not configured.', { status: 503 })
  }

  const rawBody = await request.text()

  let event
  try {
    event = verifyWebhook({
      rawBody,
      signatureHeader: request.headers.get('stripe-signature'),
      secret,
    })
  } catch (error) {
    const code = error instanceof StripeError ? error.code : 'bad_signature'
    console.warn('stripe webhook rejected', code)
    // Deliberately terse: an attacker probing signatures learns nothing.
    return new Response('Invalid signature.', { status: 400 })
  }

  const admin = supabaseAdmin()

  // Claim the event first. The primary key makes this the deduplication point:
  // a duplicate delivery loses the race and exits without side effects.
  const { error: claimError } = await admin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type })

  if (claimError) {
    // Already processed. 200, or Stripe keeps retrying something that is done.
    return Response.json({ received: true, duplicate: true })
  }

  try {
    await handle(event, admin)
  } catch (error) {
    console.error('stripe webhook processing failed', event.type, error)
    // Release the claim so the retry can actually do the work, rather than
    // being deduplicated against a failed attempt.
    await admin.from('stripe_events').delete().eq('id', event.id)
    return new Response('Processing failed.', { status: 500 })
  }

  return Response.json({ received: true })
}

type Admin = ReturnType<typeof supabaseAdmin>

async function handle(
  event: { type: string; data: { object: Record<string, unknown> } },
  admin: Admin,
): Promise<void> {
  const object = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      const organizationId =
        (object.client_reference_id as string | null) ??
        ((object.metadata as Record<string, string> | null)?.organization_id ?? null)
      if (!organizationId) return

      await admin
        .from('subscriptions')
        .update({
          stripe_customer_id: (object.customer as string) ?? null,
          stripe_subscription_id: (object.subscription as string) ?? null,
        })
        .eq('organization_id', organizationId)
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const organizationId = (object.metadata as Record<string, string> | null)?.organization_id
      if (!organizationId) return

      const status = mapStatus(String(object.status ?? ''))
      const priceId = firstPriceId(object)
      const deleted = event.type === 'customer.subscription.deleted'

      // Mirror the object's own state rather than deriving it. An out-of-order
      // "updated" that arrives after "deleted" would otherwise resurrect a
      // cancelled subscription.
      await admin
        .from('subscriptions')
        .update({
          plan_key: deleted || status === 'canceled' ? 'free' : planKeyForPrice(priceId),
          status: deleted ? 'canceled' : status,
          stripe_subscription_id: (object.id as string) ?? null,
          stripe_price_id: priceId,
          current_period_end: toDate(object.current_period_end),
          cancel_at: toDate(object.cancel_at),
          trial_ends_at: toDate(object.trial_end),
          // The grace clock starts on the first failure and is cleared the
          // moment payment recovers — not on every subsequent past_due event,
          // or the grace period never ends.
          past_due_since:
            status === 'past_due' || status === 'unpaid'
              ? await existingPastDueSince(admin, organizationId)
              : null,
        })
        .eq('organization_id', organizationId)

      // Keep the denormalised copy on the workspace in step, since RLS helpers
      // and the session read it.
      await admin
        .from('organizations')
        .update({
          plan_key: deleted || status === 'canceled' ? 'free' : planKeyForPrice(priceId),
          subscription_status: deleted ? 'canceled' : status,
        })
        .eq('id', organizationId)
      return
    }

    case 'invoice.payment_failed':
    case 'invoice.payment_succeeded': {
      const subscriptionId = object.subscription as string | null
      if (!subscriptionId) return

      const failed = event.type === 'invoice.payment_failed'
      const { data: row } = await admin
        .from('subscriptions')
        .select('organization_id, past_due_since')
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle()
      if (!row) return

      await admin
        .from('subscriptions')
        .update({
          status: failed ? 'past_due' : 'active',
          past_due_since: failed ? (row.past_due_since ?? new Date().toISOString()) : null,
        })
        .eq('organization_id', row.organization_id)

      await admin
        .from('organizations')
        .update({ subscription_status: failed ? 'past_due' : 'active' })
        .eq('id', row.organization_id)
      return
    }

    default:
      // Unhandled event types are recorded and ignored. Returning 200 stops
      // Stripe retrying something we will never act on.
      return
  }
}

async function existingPastDueSince(admin: Admin, organizationId: string): Promise<string> {
  const { data } = await admin
    .from('subscriptions')
    .select('past_due_since')
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data?.past_due_since ?? new Date().toISOString()
}

function firstPriceId(subscription: Record<string, unknown>): string | null {
  const items = subscription.items as { data?: { price?: { id?: string } }[] } | undefined
  return items?.data?.[0]?.price?.id ?? null
}

function toDate(seconds: unknown): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}
