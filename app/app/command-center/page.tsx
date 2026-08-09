import Link from 'next/link'
import { DemoBadge, Eyebrow, Panel } from '@/components/ui'
import { MetricCard } from '@/components/MetricCard'
import { TENANT_ROLE_LABELS } from '@/lib/roles'
import { requireMembership } from '@/lib/session'
import { buildDemoDataset } from '@/lib/demo/seed'
import { computeMetrics, type MetricsResult } from '@/lib/metrics/engine'
import { ALLOCATION_MODEL_LABELS } from '@/lib/metrics/allocation'
import { formatMoney } from '@/lib/money'

export const metadata = { title: 'Command center' }

/**
 * The command center answers four questions immediately: how much did I sell,
 * how much did I spend, how much profit did I keep, and what should I do next.
 *
 * A demo workspace computes those from the deterministic demo dataset and says
 * so on every card. A real workspace with no connected source shows nothing
 * rather than borrowing the demo numbers — the two paths never mix.
 */
export default async function CommandCenterPage() {
  const { session, membership } = await requireMembership()

  const metrics: MetricsResult | null = membership.isDemo ? demoMetrics() : null

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Command center</Eyebrow>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold">
            {membership.name}
            {membership.isDemo ? <DemoBadge /> : null}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {session.email} · {TENANT_ROLE_LABELS[membership.role]} · {membership.planKey}
          </p>
        </div>
        <Link
          href="/app/import"
          className="inline-flex min-h-11 items-center rounded-lg border border-hairline bg-panelRaised px-5 text-sm font-medium transition hover:border-signal"
        >
          Import data
        </Link>
      </header>

      {metrics ? <DemoDashboard metrics={metrics} /> : <EmptyState />}
    </div>
  )
}

function demoMetrics(): MetricsResult {
  // Anchored to a fixed end date so the demo is identical on every load and in
  // every screenshot, rather than drifting with the clock.
  const endDate = new Date('2026-03-01T00:00:00Z')
  const data = buildDemoDataset({ endDate, days: 56 })

  return computeMetrics({
    period: {
      start: data.periodStart,
      end: data.periodEnd,
      label: 'Last 8 weeks',
      timezone: 'UTC',
    },
    currency: data.currency,
    orders: data.orders,
    refunds: data.refunds,
    spend: data.spend,
    allocatedOverhead: null,
    allocationModel: 'blended',
    sources: [{ system: 'demo dataset', lastSyncedAt: endDate, recordCount: data.orders.length }],
  })
}

function DemoDashboard({ metrics }: { metrics: MetricsResult }) {
  const cards = [
    metrics.netRevenue,
    metrics.grossProfit,
    metrics.contributionProfit,
    metrics.adSpend,
    metrics.roas,
    metrics.mer,
    metrics.aov,
    metrics.cac,
    metrics.refundRate,
    metrics.contributionMargin,
    metrics.orderCount,
    metrics.unitsSold,
  ]

  const allocatedShare = metrics.allocation.allocatedShare

  return (
    <>
      <Panel className="border-amber/40">
        <div className="flex flex-wrap items-center gap-3">
          <DemoBadge />
          <p className="text-sm text-muted">
            These figures come from a synthetic dataset. They are deterministic and internally
            consistent, but they are not your business.
          </p>
        </div>
      </Panel>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Performance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((metric) => (
            <MetricCard key={metric.key} metric={metric} now={new Date('2026-03-01T06:00:00Z')} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <Eyebrow>Ad spend allocation</Eyebrow>
          <h2 className="text-lg font-semibold">
            {ALLOCATION_MODEL_LABELS[metrics.allocation.model]}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {metrics.allocation.explanation}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between border-b border-hairline pb-2">
              <dt className="text-muted">Total spend</dt>
              <dd className="tabular">{formatMoney(metrics.allocation.totalSpend)}</dd>
            </div>
            <div className="flex justify-between border-b border-hairline pb-2">
              <dt className="text-muted">Attributed to a product</dt>
              <dd className="tabular">
                {allocatedShare === null ? '—' : `${Math.round(allocatedShare * 100)}%`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Unallocated</dt>
              <dd className="tabular">{formatMoney(metrics.allocation.unallocated)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-muted">
            Confidence: {metrics.allocation.confidence}
          </p>
        </Panel>

        <Panel>
          <Eyebrow>Data quality</Eyebrow>
          <h2 className="text-lg font-semibold">
            {metrics.warnings.length === 0
              ? 'No issues detected'
              : `${metrics.warnings.length} thing${metrics.warnings.length === 1 ? '' : 's'} to know`}
          </h2>
          {metrics.warnings.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
              {metrics.warnings.map((warning) => (
                <li key={warning} className="flex gap-2">
                  <span aria-hidden="true" className="text-amber">
                    ⚠
                  </span>
                  {warning}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Every order line has a recorded cost and every figure is fully attributed.
            </p>
          )}
        </Panel>
      </section>
    </>
  )
}

function EmptyState() {
  return (
    <Panel className="border-amber/40">
      <Eyebrow>No data source</Eyebrow>
      <h2 className="text-lg font-semibold">Nothing to report yet</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        This workspace has no connected source and no imported data, so there are no figures to
        show. This screen will not fill the gap with sample numbers — import a CSV to see real
        metrics, or create a demo workspace to explore the product first.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/app/import"
          className="inline-flex min-h-11 items-center rounded-lg bg-signal px-5 text-sm font-medium text-ground transition hover:brightness-110"
        >
          Import a CSV
        </Link>
        <Link
          href="/app/onboarding"
          className="inline-flex min-h-11 items-center rounded-lg border border-hairline bg-panelRaised px-5 text-sm font-medium transition hover:border-signal"
        >
          Create a demo workspace
        </Link>
      </div>
    </Panel>
  )
}
