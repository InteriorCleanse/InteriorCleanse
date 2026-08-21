import { z } from 'zod'
import { publicEnv } from '@/lib/env'
import { can } from '@/lib/authz'
import { getSessionContext } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { downgradeImpact, isUpgrade, planFor, type PlanKey } from '@/lib/billing/plans'
import {
  createCheckoutSession,
  createPortalSession,
  isBillingConfigured,
  priceIdFor,
} from '@/lib/billing/stripe'

/**
 * Starting a checkout, or opening the billing portal.
 *
 * The workspace id comes from the session's memberships, never the body: a
 * request that could name a workspace could buy a subscription for someone
 * else's, or worse, redirect their portal session to itself.
 *
 * Downgrades and cancellations go through Stripe's portal rather than being
 * reimplemented here. Proration, tax and dunning are genuinely hard and Stripe
 * is authoritative about them; a second implementation would only ever be a
 * source of disagreement about how much someone owes.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  action: z.enum(['checkout', 'portal']),
  plan: z.enum(['starter', 'growth', 'scale']).optional(),
})

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  if (!isBillingConfigured()) {
    return Response.json(
      { error: 'Billing is not configured on this deployment.' },
      { status: 503 },
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Malformed request.' }, { status: 400 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = {
    userId: session.userId,
    tenantRole: membership.role,
    platformRole: session.platformRole,
  }
  if (!can(actor, 'billing:manage')) {
    return Response.json(
      { error: 'Only the workspace owner can change the subscription.' },
      { status: 403 },
    )
  }

  const supabase = await supabaseServer()
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, plan_key')
    .eq('organization_id', membership.organizationId)
    .maybeSingle()

  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL

  if (parsed.data.action === 'portal') {
    if (!subscription?.stripe_customer_id) {
      return Response.json(
        { error: 'There is no billing account yet — subscribe to a paid plan first.' },
        { status: 409 },
      )
    }
    try {
      const portal = await createPortalSession({
        customerId: subscription.stripe_customer_id,
        returnUrl: `${siteUrl}/app/billing`,
      })
      return Response.json({ url: portal.url })
    } catch {
      return Response.json({ error: 'Could not open the billing portal.' }, { status: 502 })
    }
  }

  const plan = parsed.data.plan
  if (!plan) return Response.json({ error: 'No plan chosen.' }, { status: 400 })

  const priceId = priceIdFor(plan)
  if (!priceId) {
    return Response.json(
      { error: `No Stripe price is configured for the ${planFor(plan).name} plan.` },
      { status: 503 },
    )
  }

  // A downgrade is a portal operation, not a fresh checkout: starting a new
  // subscription while one exists is how people end up billed twice.
  const currentPlan = (subscription?.plan_key ?? 'free') as PlanKey
  if (currentPlan !== 'free' && !isUpgrade(currentPlan, plan)) {
    return Response.json(
      {
        error: 'Use the billing portal to change to a smaller plan.',
        impact: downgradeImpact(currentPlan, plan),
      },
      { status: 409 },
    )
  }

  try {
    const checkout = await createCheckoutSession({
      customerId: subscription?.stripe_customer_id ?? null,
      customerEmail: session.email,
      priceId,
      organizationId: membership.organizationId,
      successUrl: `${siteUrl}/app/billing?checkout=complete`,
      cancelUrl: `${siteUrl}/app/billing?checkout=cancelled`,
    })
    return Response.json({ url: checkout.url })
  } catch {
    return Response.json({ error: 'Could not start checkout.' }, { status: 502 })
  }
}
