import type { SupabaseClient } from '@supabase/supabase-js'
import { agentDisplayName, profileFromRow } from '@/lib/agents/profile'
import { changeFor, loadWorkspaceAnalytics } from '@/lib/workspace-analytics'
import { loadWorkspaceDataset, type Dataset } from '@/lib/workspace/dataset'
import { formatMoney, money } from '@/lib/money'
import { computeSignals } from '@/lib/signals'
import type { WatchedCompany } from './mission'

/**
 * Gathering every company for the owner.
 *
 * **Call this only after the platform-role gate.** It reads with the service
 * role across tenants, which is exactly what no tenant path may do; the page
 * and the assistant route both check `platform:view_console` first and hand
 * the admin client in. Keeping the read in one place means there is one
 * place to audit.
 *
 * A real workspace's figures come from its own records, read here with the
 * service role for that workspace's id alone, up to a bounded number of
 * companies per view. Past the bound, and for a workspace with no records,
 * the figures are null — shown as unknown, never as zero.
 */

/** How many real workspaces get their records read for one mission-control view. */
export const WATCHED_DATASET_LIMIT = 50
export async function loadWatchedCompanies(
  admin: SupabaseClient,
  assistantName: string,
  options: { now?: Date } = {},
): Promise<WatchedCompany[]> {
  const now = options.now ?? new Date()
  const [{ data: orgs }, { data: members }, { data: profiles }] = await Promise.all([
    admin
      .from('organizations')
      .select('id, name, is_demo, base_currency, plan_key, subscription_status, created_at')
      .is('deleted_at', null)
      .limit(2_000),
    admin.from('organization_members').select('organization_id, status').eq('status', 'active'),
    admin
      .from('assistant_profiles')
      .select('organization_id, agent_name, focus, standing_orders, reports_to_owner'),
  ])

  const memberCount = new Map<string, number>()
  for (const m of members ?? []) {
    memberCount.set(m.organization_id, (memberCount.get(m.organization_id) ?? 0) + 1)
  }
  const profileByOrg = new Map((profiles ?? []).map((p) => [p.organization_id, profileFromRow(p)]))

  // Newest companies first, a few at a time: one slow workspace must not hold
  // the whole console, and fifty parallel reads would hold the database.
  const real = (orgs ?? []).filter((org) => !org.is_demo).slice(0, WATCHED_DATASET_LIMIT)
  const datasets = new Map<string, Dataset>()
  for (let i = 0; i < real.length; i += 5) {
    await Promise.all(
      real.slice(i, i + 5).map(async (org) => {
        try {
          datasets.set(org.id, await loadWorkspaceDataset(admin, org.id, org.base_currency, { now }))
        } catch {
          // Unknown, not zero: the card shows "connect a source" for this one.
        }
      }),
    )
  }

  return (orgs ?? []).map((org) => {
    const profile = profileByOrg.get(org.id) ?? null
    let netRevenueMinor: number | null = null
    let contributionProfitMinor: number | null = null
    let signals: WatchedCompany['signals'] = []

    const dataset = datasets.get(org.id) ?? null
    const hasRecords = dataset ? dataset.orders.length > 0 || dataset.spend.length > 0 : false
    if (org.is_demo || hasRecords) {
      const a = loadWorkspaceAnalytics({
        isDemo: org.is_demo,
        currency: org.base_currency,
        preset: 'month_to_date',
        comparison: 'previous_period',
        now,
        dataset,
      })
      netRevenueMinor = a.metrics.netRevenue.value.minor
      contributionProfitMinor = a.metrics.contributionProfit.value.minor
      signals = computeSignals({
        revenue: changeFor(a, 'netRevenue'),
        profit: changeFor(a, 'contributionProfit'),
        spend: changeFor(a, 'adSpend'),
        contributionMargin: a.metrics.contributionMargin.value,
        refundRate: a.metrics.refundRate.value,
        unallocatedMinor: a.metrics.allocation.unallocated.minor,
        formatMoney: (minor) => formatMoney(money(Math.round(minor), org.base_currency)),
      })
    }

    return {
      id: org.id,
      name: org.name,
      isDemo: org.is_demo,
      planKey: org.plan_key,
      subscriptionStatus: org.subscription_status,
      memberCount: memberCount.get(org.id) ?? 0,
      currency: org.base_currency,
      createdAt: org.created_at,
      netRevenueMinor,
      contributionProfitMinor,
      agentName: agentDisplayName(profile, assistantName),
      reportsToOwner: profile?.reportsToOwner ?? true,
      signals,
    }
  })
}
