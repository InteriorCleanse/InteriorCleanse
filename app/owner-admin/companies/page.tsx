import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Eyebrow, Panel } from '@/components/ui'
import { can } from '@/lib/authz'
import { formatMoney, money } from '@/lib/money'
import { requireSession } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/server'
import { loadWorkspaceAnalytics } from '@/lib/workspace-analytics'
import {
  statusHealth,
  summarizePortfolio,
  type CompanySummary,
} from '@/lib/owner/portfolio'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Companies',
  robots: { index: false, follow: false },
}

/**
 * The cross-company portfolio — every workspace on the deployment, for the
 * platform owner only.
 *
 * This is the one screen that crosses tenants, so it is built the way the rest
 * of the owner console is: the platform-role gate first, and only then a
 * service-role read of tables no tenant path can reach. A tenant user who
 * guesses this URL is redirected to their own command center and never learns
 * the route exists. The aggregation is a pure, tested module; this file only
 * gathers rows and renders.
 *
 * Real workspaces have no computed metrics yet (only the demo dataset does), so
 * their revenue shows as "connect a source", never as a zero that would read as
 * a dead business.
 */
export default async function OwnerCompaniesPage() {
  const session = await requireSession()
  const actor = { userId: session.userId, tenantRole: null, platformRole: session.platformRole }

  // Not 403: a non-staff user should not learn this route exists.
  if (!can(actor, 'platform:view_console')) redirect('/app/command-center')

  const admin = supabaseAdmin()
  const [{ data: orgs }, { data: members }] = await Promise.all([
    admin
      .from('organizations')
      .select('id, name, is_demo, base_currency, plan_key, subscription_status, created_at')
      .is('deleted_at', null)
      .limit(2_000),
    admin.from('organization_members').select('organization_id, status').eq('status', 'active'),
  ])

  const memberCount = new Map<string, number>()
  for (const m of members ?? []) {
    memberCount.set(m.organization_id, (memberCount.get(m.organization_id) ?? 0) + 1)
  }

  const companies: CompanySummary[] = (orgs ?? []).map((org) => {
    // Demo workspaces have real, deterministic figures; real ones do not yet
    // compute metrics from the database, so their headline stays null.
    let netRevenueMinor: number | null = null
    let contributionProfitMinor: number | null = null
    if (org.is_demo) {
      const a = loadWorkspaceAnalytics({
        isDemo: true,
        currency: org.base_currency,
        preset: 'month_to_date',
        comparison: 'none',
      })
      netRevenueMinor = a.metrics.netRevenue.value.minor
      contributionProfitMinor = a.metrics.contributionProfit.value.minor
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
    }
  })

  const portfolio = summarizePortfolio(companies)
  const cash = (minor: number, currency: string) => formatMoney(money(minor, currency))

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Eyebrow>Platform</Eyebrow>
      <h1 className="text-3xl font-semibold">Companies</h1>
      <p className="mt-2 text-sm text-muted">
        Every workspace on this deployment. Visible only to platform staff, read across tenants
        with the service role after the staff check — no customer can see another customer here.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Companies" value={String(portfolio.total)} note={`${portfolio.real} real · ${portfolio.demo} demo`} />
        <Stat
          label="Needs attention"
          value={String(portfolio.attention.length)}
          note={portfolio.attention.length > 0 ? 'past due or canceled' : 'all subscriptions healthy'}
          tone={portfolio.attention.length > 0 ? 'amber' : undefined}
        />
        <Stat
          label="Subscriptions"
          value={portfolio.byStatus.map((b) => `${b.count} ${b.key}`).join(' · ') || '—'}
        />
        <Stat
          label="Demo revenue"
          value={
            portfolio.demoRevenueByCurrency.length > 0
              ? portfolio.demoRevenueByCurrency.map((t) => cash(t.minor, t.currency)).join(' + ')
              : '—'
          }
          note="demonstration data, month to date"
        />
      </div>

      {portfolio.attention.length > 0 ? (
        <Panel className="mt-6 border-amber/40">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber">
            Subscriptions needing attention
          </h2>
          <ul className="mt-3 space-y-2">
            {portfolio.attention.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-ink">{c.name}</span>
                <span className="font-mono text-xs text-amber">{c.subscriptionStatus}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Roster</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.14em] text-muted">
                <th className="py-2 pr-4 font-medium">Company</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Subscription</th>
                <th className="py-2 pr-4 font-medium">Members</th>
                <th className="py-2 pr-4 font-medium">Net revenue</th>
                <th className="py-2 font-medium">Since</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.companies.map((c) => {
                const health = statusHealth(c.subscriptionStatus)
                const dot =
                  health === 'attention' ? 'bg-amber' : health === 'healthy' ? 'bg-positive' : 'bg-muted'
                return (
                  <tr key={c.id} className="border-b border-hairline/60">
                    <td className="py-2 pr-4 text-ink">
                      {c.name}
                      {c.isDemo ? (
                        <span className="ml-2 rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                          demo
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 text-muted">{c.planKey}</td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                        <span className="text-muted">{c.subscriptionStatus || 'none'}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-muted">{c.memberCount}</td>
                    <td className="py-2 pr-4 tabular-nums text-ink">
                      {c.netRevenueMinor === null ? (
                        <span className="text-muted">connect a source</span>
                      ) : (
                        cash(c.netRevenueMinor, c.currency)
                      )}
                    </td>
                    <td className="py-2 tabular-nums text-muted">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted">
          Real workspaces show revenue once a data source is connected and synced; a demo shows its
          deterministic figures. Currencies are never summed across, and demo figures are kept apart
          from real ones.
        </p>
      </Panel>

      <Link href="/owner-admin" className="mt-8 inline-block text-sm text-signal hover:underline">
        Back to owner console
      </Link>
    </main>
  )
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'amber'
}) {
  return (
    <Panel className="space-y-1">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="text-lg font-semibold text-ink">{value}</p>
      {note ? <p className={`text-xs ${tone === 'amber' ? 'text-amber' : 'text-muted'}`}>{note}</p> : null}
    </Panel>
  )
}
