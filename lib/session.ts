import { cache } from 'react'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { isPlatformRole, isTenantRole, type PlatformRole, type TenantRole } from '@/lib/roles'
import { type Actor, assertCan, can, type Capability, ForbiddenError } from '@/lib/authz'
import { hasSecondFactor, needsStepUp, type Assurance } from '@/lib/security/mfa'

/**
 * Session and tenant resolution.
 *
 * The load-bearing rule: an organization id is only ever derived from the
 * authenticated session's memberships. Nothing here accepts an organization id
 * from a request body, query string, or header — a client-supplied id is only
 * ever *validated against* what the session already grants.
 *
 * `cache()` dedupes these lookups within a single render pass, so a layout and
 * three components asking "who is this?" cost one round trip.
 */

export type Membership = {
  organizationId: string
  name: string
  slug: string
  role: TenantRole
  isDemo: boolean
  /** The workspace's reporting currency. Every surface must read it from here:
      a dashboard and an assistant disagreeing about the currency symbol is a
      worse bug than either of them being slow. */
  baseCurrency: string
  /** IANA zone the workspace reports in; "today" and "tomorrow" are decided here. */
  timezone: string
  planKey: string
  subscriptionStatus: string
}

export type SessionContext = {
  userId: string
  email: string
  fullName: string | null
  platformRole: PlatformRole | null
  memberships: Membership[]
  /** True when this person has a verified second factor and this session presented it. */
  secondFactor: boolean
}

/**
 * How far this session got through signing in.
 *
 * A person with a second factor enrolled who has only typed a password has
 * not finished: the session could be stronger and is not. Every surface reads
 * that through this one call, so "signed in" means one thing everywhere.
 */
export const sessionAssurance = cache(async (): Promise<Assurance> => {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return {
    current: (data?.currentLevel ?? null) as Assurance['current'],
    next: (data?.nextLevel ?? null) as Assurance['next'],
  }
})

export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await supabaseServer()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Half a sign-in is no sign-in. An API route sees no session at all; a page
  // is sent to finish the step-up by `requireSession`.
  const assurance = await sessionAssurance()
  if (needsStepUp(assurance)) return null

  const [{ data: profile }, { data: staff }, { data: memberRows }] = await Promise.all([
    supabase.from('profiles').select('email, full_name').eq('id', user.id).maybeSingle(),
    supabase.from('platform_staff').select('role').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('organization_members')
      .select(
        'role, organizations!inner(id, name, slug, is_demo, base_currency, timezone, plan_key, subscription_status, deleted_at)',
      )
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ])

  type MemberRow = {
    role: string
    organizations: {
      id: string
      name: string
      slug: string
      is_demo: boolean
      base_currency: string
      timezone: string | null
      plan_key: string
      subscription_status: string
      deleted_at: string | null
    } | null
  }

  const memberships: Membership[] = ((memberRows ?? []) as unknown as MemberRow[])
    .filter((row) => row.organizations !== null && row.organizations.deleted_at === null)
    .filter((row) => isTenantRole(row.role))
    .map((row) => ({
      organizationId: row.organizations!.id,
      name: row.organizations!.name,
      slug: row.organizations!.slug,
      role: row.role as TenantRole,
      isDemo: row.organizations!.is_demo,
      baseCurrency: row.organizations!.base_currency ?? 'USD',
      timezone: row.organizations!.timezone ?? 'UTC',
      planKey: row.organizations!.plan_key,
      subscriptionStatus: row.organizations!.subscription_status,
    }))

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? '',
    fullName: profile?.full_name ?? null,
    platformRole: isPlatformRole(staff?.role) ? staff.role : null,
    memberships,
    secondFactor: hasSecondFactor(assurance) && assurance.current === 'aal2',
  }
})

/** Session or redirect to login. Use in any protected Server Component. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext()
  if (!session) {
    // Signed in with a password but a second factor is enrolled: finish it.
    redirect(needsStepUp(await sessionAssurance()) ? '/login/verify' : '/login')
  }
  return session
}

/**
 * The owner console: platform staff only, and only with a second factor.
 *
 * The console sees every company, so the bar for reaching it is the highest
 * in the product. A tenant user who guesses the URL is sent to their own
 * command center and never learns the route exists; an owner without a
 * second factor is sent to enrol one, with the reason, and comes back when
 * they have.
 */
export async function requireOwnerConsole(): Promise<{ session: SessionContext; actor: Actor }> {
  const session = await requireSession()
  const actor: Actor = { userId: session.userId, tenantRole: null, platformRole: session.platformRole }
  if (!can(actor, 'platform:view_console')) redirect('/app/command-center')
  if (!session.secondFactor) {
    redirect(
      `/app/security?notice=${encodeURIComponent(
        'The owner console sees every company, so it needs a second factor. Enrol an authenticator app here and come back.',
      )}`,
    )
  }
  return { session, actor }
}

/**
 * Resolves the organization the request should act on.
 *
 * `requested` may come from a URL segment, but it is treated as untrusted: it
 * is matched against the session's memberships and discarded if it does not
 * appear there. An unknown or unauthorized id is indistinguishable from
 * "not a member" by design — it must not confirm that an org exists.
 */
export async function requireMembership(requested?: string): Promise<{
  session: SessionContext
  membership: Membership
  actor: Actor
}> {
  const session = await requireSession()

  if (session.memberships.length === 0) redirect('/app/onboarding')

  const membership = requested
    ? session.memberships.find(
        (m) => m.organizationId === requested || m.slug === requested,
      )
    : session.memberships[0]

  if (!membership) redirect('/app/onboarding')

  return {
    session,
    membership,
    actor: {
      userId: session.userId,
      tenantRole: membership.role,
      platformRole: session.platformRole,
    },
  }
}

/** Membership plus a capability check, for pages that gate on permission. */
export async function requireCapability(capability: Capability, requested?: string) {
  const ctx = await requireMembership(requested)
  assertCan(ctx.actor, capability)
  return ctx
}

/** Route-handler variant: returns a 403 body instead of throwing to a boundary. */
export function forbiddenResponse(error: unknown) {
  if (error instanceof ForbiddenError) {
    return Response.json({ error: error.message, capability: error.capability }, { status: 403 })
  }
  return null
}
