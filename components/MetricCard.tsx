import type { Metric } from '@/lib/metrics/engine'
import { formatMoney, type Money } from '@/lib/money'
import { changeSentiment, type Change } from '@/lib/periods'

/**
 * Renders one KPI with its provenance attached.
 *
 * The component takes a whole `Metric`, never a bare number, which is what
 * makes "every metric shows its formula, source, range, currency, and
 * freshness" structurally true rather than a convention someone has to
 * remember. A value that could not be computed renders its reason, not a dash.
 */

function relativeAge(date: Date | null, now: Date): string {
  if (!date) return 'never synced'
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function isMoney(value: unknown): value is Money {
  return typeof value === 'object' && value !== null && 'minor' in value && 'currency' in value
}

function renderValue(metric: Metric<unknown>): string {
  const { value, kind } = metric
  if (value === null || value === undefined) return '—'
  if (kind === 'money' && isMoney(value)) return formatMoney(value)
  if (kind === 'percent' && typeof value === 'number') return `${(value * 100).toFixed(1)}%`
  if (kind === 'ratio' && typeof value === 'number') return `${value.toFixed(2)}×`
  if (kind === 'count' && typeof value === 'number') return value.toLocaleString()
  return String(value)
}

export function MetricCard({
  metric,
  change,
  comparisonLabel,
  now = new Date(),
}: {
  metric: Metric<unknown>
  /** Movement against the comparison period, when one is selected. */
  change?: Change | null
  comparisonLabel?: string
  now?: Date
}) {
  const unavailable = metric.value === null || metric.value === undefined
  // Freshness is bounded by the *oldest* contributing source, so a stale
  // warning here means at least one input is stale, not all of them.
  const stale =
    metric.freshestAt !== null && now.getTime() - metric.freshestAt.getTime() > 24 * 3_600_000

  return (
    <article className="rounded-panel border border-hairline bg-panel p-5 shadow-panel">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">{metric.label}</h3>
        {stale ? (
          <span className="rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber">
            Stale
          </span>
        ) : null}
      </div>

      <p
        className={`tabular mt-3 text-metric font-semibold ${unavailable ? 'text-muted' : 'text-ink'}`}
      >
        {renderValue(metric)}
      </p>

      {unavailable && metric.unavailableReason ? (
        <p className="mt-1.5 text-xs text-amber">{metric.unavailableReason}</p>
      ) : null}

      {change && !unavailable ? (
        <ChangeBadge metricKey={metric.key} change={change} comparisonLabel={comparisonLabel} />
      ) : null}

      {/* The formula is the difference between a dashboard and a number someone
          has to take on faith. It is always visible, not hidden behind a hover. */}
      <p className="mt-3 text-xs leading-relaxed text-muted">{metric.formula}</p>

      {metric.exclusions.length > 0 ? (
        <p className="mt-1 text-[11px] text-muted">Excludes: {metric.exclusions.join(', ')}</p>
      ) : null}

      <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-hairline pt-3 text-[11px] text-muted">
        <div className="flex gap-1">
          <dt className="sr-only">Period</dt>
          <dd>{metric.period.label}</dd>
        </div>
        {metric.currency ? (
          <div className="flex gap-1">
            <dt className="sr-only">Currency</dt>
            <dd>{metric.currency}</dd>
          </div>
        ) : null}
        <div className="flex gap-1">
          <dt className="sr-only">Sources</dt>
          <dd>{metric.sources.map((s) => s.system).join(', ') || 'no source'}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="sr-only">Freshness</dt>
          <dd>{relativeAge(metric.freshestAt, now)}</dd>
        </div>
      </dl>
    </article>
  )
}


/**
 * Movement against the comparison period.
 *
 * Direction is stated with an arrow and a word, never colour alone, and the
 * sentiment is metric-aware: refund rate rising is not a win, so it is not
 * painted like one.
 */
function ChangeBadge({
  metricKey,
  change,
  comparisonLabel,
}: {
  metricKey: string
  change: Change
  comparisonLabel?: string
}) {
  const sentiment = changeSentiment(metricKey, change.direction)
  const tone =
    sentiment === 'positive'
      ? 'text-positive'
      : sentiment === 'negative'
        ? 'text-negative'
        : 'text-muted'
  const arrow = change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : '→'

  return (
    <p className={`mt-1.5 flex flex-wrap items-baseline gap-1.5 text-xs ${tone}`}>
      <span aria-hidden="true">{arrow}</span>
      <span className="tabular font-medium">
        {change.percent === null
          ? change.unavailableReason
          : `${Math.abs(change.percent * 100).toFixed(1)}%`}
      </span>
      <span className="text-muted">
        {change.direction === 'flat' ? 'no change' : change.direction}
        {comparisonLabel ? ` vs ${comparisonLabel.toLowerCase()}` : ''}
      </span>
    </p>
  )
}
