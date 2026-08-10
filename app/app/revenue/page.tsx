import Link from 'next/link'
import { Eyebrow, Panel } from '@/components/ui'
import { GlobalFilters, readFilters } from '@/components/GlobalFilters'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { CashFlowWaterfall } from '@/components/charts/CashFlowWaterfall'
import { MetricCard } from '@/components/MetricCard'
import { requireMembership } from '@/lib/session'
import { changeFor, loadWorkspaceAnalytics } from '@/lib/workspace-analytics'
import { formatMoney, money } from '@/lib/money'
import { COMPARISON_LABELS } from '@/lib/periods'

export const metadata = { title: 'Revenue' }

/** Drill-down target for the revenue and order metric tiles. */
export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; comparison?: string }>
}) {
  const [{ membership }, params] = await Promise.all([requireMembership(), searchParams])
  const { preset, comparison } = readFilters(params)

  const analytics = loadWorkspaceAnalytics({ isDemo: membership.isDemo, preset, comparison })
  const fmt = (minor: number) => formatMoney(money(Math.round(minor), analytics.currency))
  const { metrics } = analytics
  const comparisonLabel =
    comparison === 'none' ? undefined : COMPARISON_LABELS[comparison].toLowerCase()

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>
          <Link href="/app/command-center" className="hover:underline">
            Command center
          </Link>{' '}
          / Revenue
        </Eyebrow>
        <h1 className="text-3xl font-semibold">Revenue</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          How revenue arrived and what it became, for {analytics.period.label.toLowerCase()}.
        </p>
      </header>

      <GlobalFilters basePath="/app/revenue" preset={preset} comparison={comparison} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['grossSales', metrics.grossSales],
            ['netRevenue', metrics.netRevenue],
            ['orderCount', metrics.orderCount],
            ['aov', metrics.aov],
          ] as const
        ).map(([key, metric]) => (
          <MetricCard
            key={metric.key}
            metric={metric}
            change={changeFor(analytics, key)}
            comparisonLabel={comparisonLabel}
            now={analytics.period.end}
          />
        ))}
      </div>

      <TimeSeriesChart
        title="Net revenue over time"
        purpose="Whether revenue is trending up, and how steadily."
        labels={analytics.series.labels}
        series={[
          { key: 'net_revenue', label: 'Net revenue', points: analytics.series.netRevenue },
          { key: 'gross_profit', label: 'Gross profit', points: analytics.series.grossProfit },
        ]}
        format={fmt}
        mode="area"
        footnote={`Bucketed by ${analytics.granularity}.`}
      />

      <CashFlowWaterfall
        opening={0}
        steps={analytics.cashSteps}
        format={fmt}
        title="Revenue to profit"
        purpose="Each cost taken out of revenue in turn, and what remains."
      />

      {metrics.warnings.length > 0 ? (
        <Panel className="border-amber/40">
          <Eyebrow>Data quality</Eyebrow>
          <ul className="space-y-2 text-sm leading-relaxed text-muted">
            {metrics.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
