import { redirect } from 'next/navigation'
import { DemoBadge, Eyebrow, Panel } from '@/components/ui'
import { TENANT_ROLE_DESCRIPTIONS, TENANT_ROLE_LABELS } from '@/lib/roles'
import { can } from '@/lib/authz'
import { requireMembership } from '@/lib/session'

export const metadata = { title: 'Command center' }

export default async function CommandCenterPage() {
  const { session, membership, actor } = await requireMembership()
  if (!membership) redirect('/app/onboarding')

  // Checkpoint 3 fills these with real, traceable figures. Until a data source
  // exists there is nothing honest to display, so the card says so rather than
  // showing a plausible number.
  const PENDING_KPIS = [
    ['Net revenue', 'Gross sales minus discounts and refunds, plus recognised shipping.'],
    ['Gross profit', 'Net revenue minus COGS and direct fulfilment cost.'],
    ['Contribution profit', 'Gross profit minus fees, return costs, and allocated ad spend.'],
    ['Ad spend', 'Total spend across connected advertising sources.'],
    ['ROAS', 'Attributed revenue divided by ad spend.'],
    ['AOV', 'Net revenue divided by completed non-test orders.'],
  ] as const

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Command center</Eyebrow>
          <h1 className="flex items-center gap-3 text-3xl font-semibold">
            {membership.name}
            {membership.isDemo ? <DemoBadge /> : null}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Signed in as {session.email} · {TENANT_ROLE_LABELS[membership.role]}
          </p>
        </div>
      </header>

      <Panel className="border-signal/30">
        <Eyebrow>Checkpoint 1 complete</Eyebrow>
        <h2 className="text-lg font-semibold">Identity and tenancy are in place</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Accounts, workspaces, roles, and database-enforced isolation are working. The metrics
          below are intentionally empty: there is no connected data source yet, and this screen
          will not substitute sample numbers for real ones.
        </p>
      </Panel>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Metrics awaiting a data source
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PENDING_KPIS.map(([label, formula]) => (
            <Panel key={label}>
              <p className="text-sm font-medium text-ink">{label}</p>
              <p className="tabular mt-3 text-metric font-semibold text-muted">—</p>
              <p className="mt-3 text-xs leading-relaxed text-muted">{formula}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-amber">
                No source connected
              </p>
            </Panel>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <Eyebrow>Your access</Eyebrow>
          <h2 className="text-lg font-semibold">{TENANT_ROLE_LABELS[membership.role]}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {TENANT_ROLE_DESCRIPTIONS[membership.role]}
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            {(
              [
                ['Invite teammates', 'members:invite'],
                ['Connect integrations', 'integrations:connect'],
                ['Approve assistant actions', 'assistant:approve_action'],
                ['Manage billing', 'billing:manage'],
              ] as const
            ).map(([label, capability]) => (
              <li key={capability} className="flex items-center gap-2 text-muted">
                <span aria-hidden="true" className={can(actor, capability) ? 'text-positive' : 'text-muted'}>
                  {can(actor, capability) ? '✓' : '·'}
                </span>
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            This list is cosmetic. Every action re-checks permission on the server, and database
            policies refuse the write regardless of what the interface shows.
          </p>
        </Panel>

        <Panel>
          <Eyebrow>Your workspaces</Eyebrow>
          <ul className="space-y-2 text-sm">
            {session.memberships.map((m) => (
              <li
                key={m.organizationId}
                className="flex items-center justify-between gap-3 border-b border-hairline pb-2 last:border-0"
              >
                <span className="flex items-center gap-2">
                  {m.name}
                  {m.isDemo ? <DemoBadge /> : null}
                </span>
                <span className="text-muted">{TENANT_ROLE_LABELS[m.role]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </div>
  )
}
