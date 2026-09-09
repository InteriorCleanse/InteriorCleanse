import { can } from '@/lib/authz'
import { applyPlanCopy, planCopySchema } from '@/lib/billing/plan-copy'
import { getSessionContext } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Editing plan copy from the owner console.
 *
 * Platform staff with `platform:manage_flags` only — this is vendor
 * configuration, the same class as a feature flag, and a tenant role can never
 * grant it. The table has no policies, so the write goes through the service
 * role after the check, which is the same shape as every other service-role
 * write in the product: authorize the caller here, explicitly, then act.
 *
 * The schema is the control. It has no field for price or entitlements, so
 * this route cannot be made to change either whatever the body contains, and
 * `applyPlanCopy` ignores anything the schema did not admit.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const actor = {
    userId: session.userId,
    tenantRole: null,
    platformRole: session.platformRole,
  }
  // 404 rather than 403: a tenant user should not learn this route exists.
  if (!can(actor, 'platform:manage_flags')) return new Response('Not found', { status: 404 })

  const parsed = planCopySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'That copy is not valid.' },
      { status: 400 },
    )
  }

  const { planKey, name, audience, highlights, limitations } = parsed.data
  const admin = supabaseAdmin()

  const { error } = await admin.from('plan_copy_overrides').upsert(
    {
      plan_key: planKey,
      // Blank means "use the code default", stored as null so the pricing
      // page's fallback logic has one representation to handle.
      name: name || null,
      audience: audience || null,
      highlights: highlights && highlights.length > 0 ? highlights : null,
      limitations: limitations && limitations.length > 0 ? limitations : null,
      updated_by: session.userId,
    },
    { onConflict: 'plan_key' },
  )

  if (error) return Response.json({ error: 'The copy could not be saved.' }, { status: 500 })

  // Platform-level, so no organization. Pricing copy changing is exactly the
  // kind of thing a later "why did the page say that" needs a record of.
  await admin.from('audit_logs').insert({
    organization_id: null,
    actor_user_id: session.userId,
    action: 'platform.plan_copy_updated',
    target_type: 'plan',
    target_id: planKey,
    metadata: { fields: Object.keys(parsed.data).filter((k) => k !== 'planKey') },
  })

  const { data: rows } = await admin.from('plan_copy_overrides').select('*')
  const plans = applyPlanCopy(rows ?? [])

  return Response.json({ saved: true, plan: plans[planKey] })
}
