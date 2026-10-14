import Link from 'next/link'
import { Eyebrow, Panel } from '@/components/ui'
import { loadMyBusinesses, MY_BUSINESSES_FIGURES_LIMIT, type MyBusiness } from '@/lib/businesses/load'
import { agentDisplayName, profileFromRow } from '@/lib/agents/profile'
import { branding } from '@/lib/env'
import { formatMoney, money } from '@/lib/money'
import { watch, type Standing } from '@/lib/owner/mission'
import { TENANT_ROLE_LABELS } from '@/lib/roles'
import { activeMembership, requireSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { switchWorkspace } from '../workspace-actions'

export const metadata = { title: 'Businesses' }

/**
 * Every business this person runs, side by side.
 *
 * Their own memberships only, read through their own client: the tenant
 * twin of the owner's mission control, built from the same pure standing and
 * headline rules so a company reads the same in both. Each card says where
 * the business stands, what its agent sees, how far along its playbook it
 * is and what is next — and opens it, or its workflow, in one click.
 */
export default async function BusinessesPage() {
  const session = await requireSession()
  const supabase = await supabaseServer()
  const active = await activeMembership(session)

  // The person's own assistant name, from the business they are in.
  let assistant = branding.assistantName()
  if (active) {
    const { data } = await supabase
      .from('assistant_profiles')
      .select('agent_name, focus, standing_orders, reports_to_owner')
      .eq('organization_id', active.organizationId)
      .maybeSingle()
    assistant = agentDisplayName(profileFromRow(data), assistant)
  }

  const businesses = await loadMyBusinesses(supabase, session, branding.assistantName())
  const mission = watch(businesses, assistant)
  const byId = new Map(businesses.map((b) => [b.id, b]))
  const ask = encodeURIComponent(
    'Go through each of my businesses: what is happening, what is blocked, and what needs me today?',
  )

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <Eyebrow>Your businesses</Eyebrow>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-glow">{mission.summary}</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Each business keeps its own figures, its own agent and its own playbook. Figures stay in each
            business’s currency and are never added across them. Switch into one to work in it; everything
            in the app follows the switch.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/app/command-center?ask=${ask}`}
            className="assistant-orb inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline bg-panelRaised px-5 text-sm font-medium text-ink shadow-panel transition hover:border-signal"
          >
            <span aria-hidden="true" className="assistant-reactor">
              <span className="assistant-reactor-ring" />
              <span className="assistant-reactor-core" />
            </span>
            Ask {assistant} for the rundown
          </Link>
          <Link
            href="/app/onboarding"
            className="inline-flex min-h-11 items-center rounded-full border border-hairline px-5 text-sm text-muted transition hover:border-signal hover:text-ink"
          >
            Add a business
          </Link>
        </div>
      </header>

      {mission.needsYou.length > 0 ? (
        <Panel className="border-amber/40">
          <Eyebrow>Needs you</Eyebrow>
          <ul className="space-y-2">
            {mission.needsYou.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className={`font-medium ${c.standing === 'critical' ? 'text-negative' : 'text-amber'}`}>
                  {c.name}
                </span>
                <span className="text-muted">{c.headline}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {businesses.length === 0 ? (
        <Panel>
          <h2 className="text-lg font-semibold">No businesses yet</h2>
          <p className="mt-2 text-sm text-muted">Create the first one and its playbook starts with it.</p>
          <Link href="/app/onboarding" className="mt-4 inline-block text-sm text-signal hover:underline">
            Create a business
          </Link>
        </Panel>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {mission.companies.map((c) => {
            const business = byId.get(c.id) as MyBusiness
            return (
              <li key={c.id}>
                <BusinessCard
                  business={{ ...business, standing: c.standing, headline: c.headline }}
                  isActive={active?.organizationId === c.id}
                />
              </li>
            )
          })}
        </ul>
      )}

      {businesses.filter((b) => !b.isDemo).length > MY_BUSINESSES_FIGURES_LIMIT ? (
        <p className="text-xs text-muted">
          Figures are read for the first {MY_BUSINESSES_FIGURES_LIMIT} businesses on this page; open any other
          to see its own.
        </p>
      ) : null}
    </div>
  )
}

const TONE: Record<Standing, { ring: string; text: string; border: string; fill: number; label: string }> = {
  critical: { ring: 'tone-negative', text: 'text-negative', border: 'border-negative/50', fill: 100, label: 'Critical' },
  watch: { ring: 'tone-amber', text: 'text-amber', border: 'border-amber/40', fill: 66, label: 'Watch' },
  healthy: { ring: 'tone-positive', text: 'text-positive', border: 'border-hairline', fill: 100, label: 'Healthy' },
  unknown: { ring: 'tone-muted', text: 'text-muted', border: 'border-hairline', fill: 25, label: 'No figures yet' },
}

function BusinessCard({
  business: b,
  isActive,
}: {
  business: MyBusiness & { standing: Standing; headline: string }
  isActive: boolean
}) {
  const tone = TONE[b.standing]
  const cash = (minor: number) => formatMoney(money(Math.round(minor), b.currency))
  const wf = b.workflow

  return (
    <Panel className={`flex h-full flex-col ${tone.border} ${isActive ? 'ring-1 ring-signal/40' : ''}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`health-ring ${tone.ring}`}
          style={{ width: 40, height: 40, ['--pct' as string]: tone.fill }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
            <span className="truncate">{b.name}</span>
            {b.isDemo ? (
              <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                demo
              </span>
            ) : null}
            {isActive ? (
              <span className="rounded-full bg-signal/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-signal">
                open now
              </span>
            ) : null}
          </h2>
          <p className={`mt-0.5 text-sm ${tone.text}`}>{b.headline}</p>
        </div>
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span aria-hidden="true" className="assistant-reactor" style={{ width: 14, height: 14 }}>
          <span className="assistant-reactor-ring" />
          <span className="assistant-reactor-core" style={{ width: 5, height: 5 }} />
        </span>
        <span className="text-ink">{b.agentName}</span>
        <span>· you are {TENANT_ROLE_LABELS[b.role].toLowerCase()}</span>
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">Net revenue · MTD</dt>
          <dd className="tabular text-ink">
            {b.netRevenueMinor === null ? <span className="text-muted">connect a source</span> : cash(b.netRevenueMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">Contribution</dt>
          <dd className="tabular text-ink">
            {b.contributionProfitMinor === null ? <span className="text-muted">—</span> : cash(b.contributionProfitMinor)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-hairline/60 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Playbook</p>
          <p className="tabular text-xs text-muted">{wf?.started ? `${wf.percent}% · ${wf.stage}` : 'not started'}</p>
        </div>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-hairline">
          <span
            className={`block h-full rounded-full ${wf && (wf.blocked > 0 || wf.overdue > 0) ? 'bg-amber' : 'bg-signal'}`}
            style={{ width: `${wf?.started ? Math.max(wf.percent, 2) : 0}%` }}
          />
        </span>
        {wf?.started && wf.nextUp[0] ? (
          <p className="mt-2 text-xs text-muted">
            Next: <span className="text-ink">{wf.nextUp[0]}</span>
            {wf.blocked > 0 ? <span className="text-amber"> · {wf.blocked} blocked</span> : null}
            {wf.overdue > 0 ? <span className="text-amber"> · {wf.overdue} overdue</span> : null}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <SwitchButton id={b.id} to="/app/command-center" label="Open" primary />
        <SwitchButton id={b.id} to="/app/workflow" label={wf?.started ? 'Workflow' : 'Start playbook'} />
        <SwitchButton id={b.id} to="/app/agent" label="Agent" />
      </div>
    </Panel>
  )
}

function SwitchButton({ id, to, label, primary }: { id: string; to: string; label: string; primary?: boolean }) {
  return (
    <form action={switchWorkspace}>
      <input type="hidden" name="organizationId" value={id} />
      <input type="hidden" name="returnTo" value={to} />
      <button
        type="submit"
        className={`inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium transition ${
          primary
            ? 'bg-signal text-ground hover:brightness-110'
            : 'border border-hairline bg-panelRaised text-ink hover:border-signal'
        }`}
      >
        {label}
      </button>
    </form>
  )
}
