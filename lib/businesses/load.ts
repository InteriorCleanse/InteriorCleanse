import type { SupabaseClient } from '@supabase/supabase-js'
import { agentDisplayName, profileFromRow } from '@/lib/agents/profile'
import { headlineFigures } from '@/lib/owner/figures'
import type { WatchedCompany } from '@/lib/owner/mission'
import type { TenantRole } from '@/lib/roles'
import type { SessionContext } from '@/lib/session'
import { loadWorkspaceAnalytics } from '@/lib/workspace-analytics'
import { loadWorkspaceDataset } from '@/lib/workspace/dataset'
import { summariseByWorkspace, todayIn } from '@/lib/workflow/progress'

/**
 * Every business one person belongs to, side by side.
 *
 * This is the tenant-side twin of the owner's mission control, and the
 * difference is the whole point: it reads through the **person's own
 * client**, for the memberships their session already holds. Row-level
 * security decides every row, so it can never show a business they are not
 * a member of — it is "my businesses", not "the deployment's".
 *
 * It returns the same `WatchedCompany` shape as mission control, so the
 * standing, headline and summary come from the same pure functions and the
 * two views cannot disagree about a company that appears in both.
 */

export type MyBusiness = WatchedCompany & { role: TenantRole }

/** Businesses that get their records read for one view; the rest show "open it to see". */
export const MY_BUSINESSES_FIGURES_LIMIT = 12
/** Businesses listed at all. */
export const MY_BUSINESSES_LIMIT = 50

export async function loadMyBusinesses(
  db: SupabaseClient,
  session: Pick<SessionContext, 'memberships'>,
  assistantName: string,
  options: { now?: Date } = {},
): Promise<MyBusiness[]> {
  const now = options.now ?? new Date()
  const memberships = session.memberships.slice(0, MY_BUSINESSES_LIMIT)
  if (memberships.length === 0) return []
  const ids = memberships.map((m) => m.organizationId)

  const [{ data: members }, { data: profiles }, { data: steps }] = await Promise.all([
    db.from('organization_members').select('organization_id').in('organization_id', ids).eq('status', 'active'),
    db
      .from('assistant_profiles')
      .select('organization_id, agent_name, focus, standing_orders, reports_to_owner')
      .in('organization_id', ids),
    db
      .from('workflow_items')
      .select('organization_id, id, stage, title, status, due_on, position, blocked_reason')
      .in('organization_id', ids)
      .limit(10_000),
  ])

  const memberCount = new Map<string, number>()
  for (const m of members ?? []) {
    memberCount.set(m.organization_id, (memberCount.get(m.organization_id) ?? 0) + 1)
  }
  const profileByOrg = new Map((profiles ?? []).map((p) => [p.organization_id, profileFromRow(p)]))
  const zone = new Map(memberships.map((m) => [m.organizationId, m.timezone]))
  const workflowByOrg = summariseByWorkspace(steps ?? [], (org) => todayIn(zone.get(org) ?? 'UTC', now))

  // Figures: demo workspaces from their fixed dataset; real ones from their
  // own records, a few at a time and up to a bound, so one slow business
  // cannot hold the page.
  const figures = new Map<string, ReturnType<typeof headlineFigures>>()
  const real = memberships.filter((m) => !m.isDemo).slice(0, MY_BUSINESSES_FIGURES_LIMIT)
  for (let i = 0; i < real.length; i += 3) {
    await Promise.all(
      real.slice(i, i + 3).map(async (m) => {
        try {
          const dataset = await loadWorkspaceDataset(db, m.organizationId, m.baseCurrency, { now })
          if (dataset.orders.length === 0 && dataset.spend.length === 0) return
          figures.set(
            m.organizationId,
            headlineFigures(
              loadWorkspaceAnalytics({
                isDemo: false,
                currency: m.baseCurrency,
                preset: 'month_to_date',
                comparison: 'previous_period',
                now,
                dataset,
              }),
              m.baseCurrency,
            ),
          )
        } catch {
          // Unknown, not zero.
        }
      }),
    )
  }
  for (const m of memberships.filter((x) => x.isDemo)) {
    figures.set(
      m.organizationId,
      headlineFigures(
        loadWorkspaceAnalytics({
          isDemo: true,
          currency: m.baseCurrency,
          preset: 'month_to_date',
          comparison: 'previous_period',
        }),
        m.baseCurrency,
      ),
    )
  }

  return memberships.map((m) => {
    const profile = profileByOrg.get(m.organizationId) ?? null
    const f = figures.get(m.organizationId)
    return {
      id: m.organizationId,
      name: m.name,
      isDemo: m.isDemo,
      planKey: m.planKey,
      subscriptionStatus: m.subscriptionStatus,
      memberCount: memberCount.get(m.organizationId) ?? 1,
      currency: m.baseCurrency,
      createdAt: '',
      netRevenueMinor: f?.netRevenueMinor ?? null,
      contributionProfitMinor: f?.contributionProfitMinor ?? null,
      agentName: agentDisplayName(profile, assistantName),
      reportsToOwner: profile?.reportsToOwner ?? true,
      signals: f?.signals ?? [],
      workflow: workflowByOrg.get(m.organizationId) ?? null,
      role: m.role,
    }
  })
}
