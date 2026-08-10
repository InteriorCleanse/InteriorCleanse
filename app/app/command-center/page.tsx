import Link from 'next/link'
import { DemoBadge, Eyebrow, Panel } from '@/components/ui'
import { MetricCard } from '@/components/MetricCard'
import { GlobalFilters, readFilters } from '@/components/GlobalFilters'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { ProfitEngineSankey } from '@/components/charts/ProfitEngineSankey'
import { CashFlowWaterfall } from '@/components/charts/CashFlowWaterfall'
import { ProductPortfolioMatrix } from '@/components/charts/ProductPortfolioMatrix'
import { TENANT_ROLE_LABELS } from '@/lib/roles'
import { requireMembership } from '@/lib/session'
import { changeFor, loadWorkspaceAnalytics } from '@/lib/workspace-analytics'
import { ALLOCATION_MODEL_LABELS } from '@/lib/metrics/allocation'
import { formatMoney, money } from '@/lib/money'
import { COMPARISON_LABELS } from '@/lib/periods'

export const metadata = { title: 'Command center' }

/**
 * The command center answers four questions immediately: how much did I sell,
 * how much did I spend, how much profit did I keep, and what should I do next.
 */
export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; comparison?: string }>
}) {
  const [{ session, membership }, params] = await Promise.all([
    requireMembership(),
    searchParams,
  ])
  const { preset, comparison } = readFilters(params)

  const analytics = loadWorkspaceAnalytics({
    isDemo: membership.isDemo,
    preset,
    comparison,
  })

  const fmt = (minor: number) => formatMoney(money(Math.round(minor), analytics.currency))
  const { metrics } = analytics
  const comparisonLabel =
    comparison === 'none' ? undefined : COMPARISON_LABELS[comparison].toLowerCase()

  const cards = [
    ['netRevenue', metrics.netRevenue],
    ['grossProfit', metrics.grossProfit],
    ['contributionProfit', metrics.contributionProfit],
    ['adSpend', metrics.adSpend],
    ['roas', metrics.roas],
    ['mer', metrics.mer],
    ['aov', metrics.aov],
    ['cac', metrics.cac],
    ['refundRate', metrics.refundRate],
    ['contributionMargin', metrics.contributionMargin],
    ['orderCount', metrics.orderCount],
    ['unitsSold', metrics.unitsSold],
  ] as const

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Command center</Eyebrow>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold">
            {membership.name}
            {membership.isDemo ? <DemoBadge /> : null}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {session.email} · {TENANT_ROLE_LABELS[membership.role]} · {analytics.period.label}
          </p>
        </div>
        <Link
          href="/app/import"
          className="inline-flex min-h-11 items-center rounded-lg border border-hairline bg-panelRaised px-5 text-sm font-medium transition hover:border-signal"
        >
          Import data
        </Link>
      </header>

      <GlobalFilters basePath="/app/command-center" preset={preset} comparison={comparison} />

      {!analytics.hasData ? (
        <EmptyState />
      ) : (
        <>
          {membership.isDemo ? (
            <Panel className="border-amber/40">
              <div className="flex flex-wrap items-center gap-3">
                <DemoBadge />
                <p className="text-sm text-muted">
                  Deterministic synthetic data. Internally consistent, but not your business.
                </p>
              </div>
            </Panel>
          ) : null}

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
              Performance
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map(([key, metric]) => (
                <MetricCard
                  key={metric.key}
                  metric={metric}
                  change={changeFor(analytics, key)}
                  comparisonLabel={comparisonLabel}
                  now={analytics.period.end}
                />
              ))}
            </div>
          </section>

          <section className="grid gap-4">
            <TimeSeriesChart
              title="Revenue and advertising"
              purpose="Whether spend is tracking revenue, or pulling away from it."
              labels={analytics.series.labels}
              series={[
                { key: 'net_revenue', label: 'Net revenue', points: analytics.series.netRevenue },
                { key: 'ad_spend', label: 'Ad spend', points: analytics.series.adSpend },
              ]}
              format={fmt}
              mode="area"
              footnote={`Bucketed by ${analytics.granularity}. Both series are in ${analytics.currency}, so they share one axis.`}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <ProfitEngineSankey input={analytics.sankey} format={fmt} />
              <CashFlowWaterfall
                opening={0}
                steps={analytics.cashSteps}
                format={fmt}
                title="Revenue to profit"
                purpose="Each cost taken out of revenue in turn, and what remains."
              />
            </div>

            <ProductPortfolioMatrix points={analytics.portfolio} format={fmt} />
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
                    {metrics.allocation.allocatedShare === null
                      ? '—'
                      : `${Math.round(metrics.allocation.allocatedShare * 100)}%`}
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
              <Link
                href={`/app/products?preset=${preset}&comparison=${comparison}`}
                className="mt-4 inline-block text-sm text-signal hover:underline"
              >
                Inspect products →
              </Link>
            </Panel>
          </section>
        </>
      )}
    </div>
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
