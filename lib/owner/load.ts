import type { SupabaseClient } from '@supabase/supabase-js'
import { agentDisplayName, profileFromRow } from '@/lib/agents/profile'
import { changeFor, loadWorkspaceAnalytics } from '@/lib/workspace-analytics'
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
 * Real workspaces do not yet compute metrics from the database, so their
 * figures and signals are empty here — shown as unknown, never as zero.
 */
export async function loadWatchedCompanies(
  admin: SupabaseClient,
  assistantName: string,
): Promise<WatchedCompany[]> {
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

  return (orgs ?? []).map((org) => {
    const profile = profileByOrg.get(org.id) ?? null
    let netRevenueMinor: number | null = null
    let contributionProfitMinor: number | null = null
    let signals: WatchedCompany['signals'] = []

    if (org.is_demo) {
      const a = loadWorkspaceAnalytics({
        isDemo: true,
        currency: org.base_currency,
        preset: 'month_to_date',
        comparison: 'previous_period',
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
