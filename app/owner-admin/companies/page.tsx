import Link from 'next/link'
import { Eyebrow, Panel } from '@/components/ui'
import { branding } from '@/lib/env'
import { formatMoney, money } from '@/lib/money'
import { loadWatchedCompanies } from '@/lib/owner/load'
import { watch, type CompanyWatch, type Standing } from '@/lib/owner/mission'
import { requireOwnerConsole } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Mission control',
  robots: { index: false, follow: false },
}

/**
 * Mission control — every company, watched by one assistant, for the owner
 * of the deployment alone.
 *
 * The one screen that crosses tenants, built the way the rest of the owner
 * console is: the platform-role gate first, then a second factor, and only
 * then a service-role read of tables no tenant path can reach. A tenant user
 * who guesses the URL is sent to their own command center and never learns
 * the route exists. The aggregation is pure and tested; this file renders.
 */
export default async function MissionControlPage() {
  await requireOwnerConsole()

  const assistant = branding.assistantName()
  const mission = watch(await loadWatchedCompanies(supabaseAdmin(), assistant), assistant)
  const cash = (minor: number, currency: string) => formatMoney(money(minor, currency))
  const ask = encodeURIComponent('What is happening across all my companies today, and who needs me?')

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Eyebrow>Platform · owner only</Eyebrow>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="assistant-reactor scale-125">
              <span className="assistant-reactor-ring" />
              <span className="assistant-reactor-core" />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">Mission control</h1>
          </div>
          <p className="mt-3 max-w-2xl text-lg text-ink">{mission.summary}</p>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Each company has an analyst of its own; this is where they report in. Figures stay in
            each company’s currency and are never summed across. Nothing here is visible to any
            customer.
          </p>
        </div>
        <Link
          href={`/app/command-center?ask=${ask}`}
          className="assistant-orb inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline bg-panelRaised px-5 text-sm font-medium text-ink shadow-panel transition hover:border-signal"
        >
          <span aria-hidden="true" className="assistant-reactor">
            <span className="assistant-reactor-ring" />
            <span className="assistant-reactor-core" />
          </span>
          Ask {assistant} for the brief
        </Link>
      </header>

      <section aria-label="Standing" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(['critical', 'watch', 'healthy', 'unknown'] as Standing[]).map((standing) => (
          <Panel key={standing} className="flex items-center gap-4">
            <HealthRing standing={standing} size={56} />
            <div>
              <p className="text-2xl font-semibold tabular-nums text-ink">{mission.counts[standing]}</p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{STANDING_LABEL[standing]}</p>
            </div>
          </Panel>
        ))}
      </section>

      {mission.needsYou.length > 0 ? (
        <Panel className="mt-6 border-negative/40">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-negative">Needs you</h2>
          <ul className="mt-3 divide-y divide-hairline/60">
            {mission.needsYou.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="flex items-center gap-3">
                  <HealthRing standing={c.standing} size={22} />
                  <span className="text-ink">{c.name}</span>
                  <span className="text-xs text-muted">· {c.agentName}</span>
                </span>
                <span className={c.standing === 'critical' ? 'text-negative' : 'text-amber'}>{c.headline}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <section aria-label="Companies" className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted">Every company</h2>
        {mission.companies.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted">No workspaces yet. The first one to sign up appears here.</p>
          </Panel>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mission.companies.map((c) => (
              <li key={c.id}>
                <CompanyCard company={c} cash={cash} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-xs text-muted">
        Real workspaces show figures and signals once a data source is connected and synced; until
        then their standing is unknown, never “healthy”. Demo workspaces carry demonstration data
        and are marked.
      </p>

      <Link href="/owner-admin" className="mt-8 inline-block text-sm text-signal hover:underline">
        Back to owner console
      </Link>
    </main>
  )
}

const STANDING_LABEL: Record<Standing, string> = {
  critical: 'Critical',
  watch: 'Watch',
  healthy: 'Healthy',
  unknown: 'No data yet',
}

const STANDING_TONE: Record<Standing, { ring: string; text: string; border: string; fill: number }> = {
  critical: { ring: 'tone-negative', text: 'text-negative', border: 'border-negative/50', fill: 100 },
  watch: { ring: 'tone-amber', text: 'text-amber', border: 'border-amber/40', fill: 66 },
  healthy: { ring: 'tone-positive', text: 'text-positive', border: 'border-hairline', fill: 100 },
  unknown: { ring: 'tone-muted', text: 'text-muted', border: 'border-hairline', fill: 25 },
}

function HealthRing({ standing, size }: { standing: Standing; size: number }) {
  const tone = STANDING_TONE[standing]
  return (
    <span
      aria-hidden="true"
      className={`health-ring ${tone.ring}`}
      style={{ width: size, height: size, ['--pct' as string]: tone.fill }}
    />
  )
}

function CompanyCard({ company: c, cash }: { company: CompanyWatch; cash: (minor: number, currency: string) => string }) {
  const tone = STANDING_TONE[c.standing]
  return (
    <Panel className={`h-full ${tone.border}`}>
      <div className="flex items-start gap-3">
        <HealthRing standing={c.standing} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
            <span className="truncate">{c.name}</span>
            {c.isDemo ? (
              <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                demo
              </span>
            ) : null}
          </h3>
          <p className={`mt-0.5 text-sm ${tone.text}`}>{c.headline}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted">
        <span aria-hidden="true" className="assistant-reactor" style={{ width: 14, height: 14 }}>
          <span className="assistant-reactor-ring" />
          <span className="assistant-reactor-core" style={{ width: 5, height: 5 }} />
        </span>
        <span className="text-ink">{c.agentName}</span>
        <span>· {c.reportsToOwner ? 'reporting in' : 'running quietly'}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">Net revenue · MTD</dt>
          <dd className="tabular text-ink">{c.netRevenueMinor === null ? <span className="text-muted">connect a source</span> : cash(c.netRevenueMinor, c.currency)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">Contribution</dt>
          <dd className="tabular text-ink">{c.contributionProfitMinor === null ? <span className="text-muted">—</span> : cash(c.contributionProfitMinor, c.currency)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">Subscription</dt>
          <dd className="text-ink">{c.subscriptionStatus || 'none'} · {c.planKey}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">Members</dt>
          <dd className="tabular text-ink">{c.memberCount}</dd>
        </div>
      </dl>

      {c.signals.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-hairline pt-3">
          {c.signals.slice(0, 2).map((s) => (
            <li key={s.id} className="flex items-baseline gap-2 text-xs">
              <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${s.severity === 'critical' ? 'bg-negative' : s.severity === 'warning' ? 'bg-amber' : 'bg-signal'}`} />
              <span className="text-muted"><span className="text-ink">{s.title}.</span> {s.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  )
}
