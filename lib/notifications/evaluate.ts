import { formatMoney, money } from '@/lib/money'
import type { PresetKey } from '@/lib/periods'
import { loadWorkspaceAnalytics } from '@/lib/workspace-analytics'

/**
 * Notification rule evaluation.
 *
 * This is where the alert the assistant proposed, and a human approved, finally
 * does something. Three properties matter more than the arithmetic:
 *
 *   1. **It does not fire on absent data.** A rule watching "ROAS below 2"
 *      must not fire when there is no ad spend at all — that is not a bad ROAS,
 *      it is no ROAS, and waking someone at 7am about it destroys their trust
 *      in every later alert.
 *   2. **It fires once per period.** The dedupe key is derived from the rule
 *      and the period, so re-running the evaluator is idempotent. An alerting
 *      system that repeats itself gets muted, and a muted alert is worse than
 *      none because it looks like coverage.
 *   3. **It carries its evidence.** Every notification records the value, the
 *      threshold and the period it was judged over, so "why did this fire?" has
 *      an answer that does not require reading code.
 */

export type NotificationRule = {
  id: string
  organizationId: string
  name: string
  metricKey: string
  comparator: 'above' | 'below'
  /** Whole currency units for money metrics; a ratio or percentage otherwise. */
  threshold: number
  channel: 'in_app' | 'email'
  enabled: boolean
}

export type RaisedNotification = {
  ruleId: string
  organizationId: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string
  link: string
  dedupeKey: string
  evidence: {
    metric: string
    observed: number
    observedDisplay: string
    threshold: number
    thresholdDisplay: string
    comparator: 'above' | 'below'
    period: string
    currency: string
  }
}

export type Skipped = {
  ruleId: string
  /** Why nothing was raised. Surfaced in the rule list, not swallowed. */
  reason: string
}

const MONEY_METRICS = new Set(['netRevenue', 'adSpend', 'contributionProfit', 'grossProfit'])
const RATIO_METRICS = new Set(['roas', 'mer'])
const PERCENT_METRICS = new Set(['refundRate', 'contributionMargin'])

const METRIC_LABELS: Record<string, string> = {
  netRevenue: 'Net revenue',
  adSpend: 'Ad spend',
  contributionProfit: 'Contribution profit',
  contributionMargin: 'Contribution margin',
  refundRate: 'Refund rate',
  roas: 'ROAS',
}

export type Evaluation = { raised: RaisedNotification[]; skipped: Skipped[] }

export function evaluateRules(input: {
  rules: readonly NotificationRule[]
  isDemo: boolean
  currency: string
  /** Which window to judge over. Daily jobs use the default. */
  preset?: PresetKey
  /** Period key that both scopes the figures and dedupes the alert. */
  periodKey?: string
}): Evaluation {
  const analytics = loadWorkspaceAnalytics({
    isDemo: input.isDemo,
    currency: input.currency,
    preset: input.preset ?? 'today',
    comparison: 'previous_period',
  })

  const raised: RaisedNotification[] = []
  const skipped: Skipped[] = []

  /**
   * Whether *this period* saw activity — not whether the workspace has ever
   * had any. The distinction matters: a period that has not happened yet (a
   * rule evaluated at 00:05) would otherwise make every "below" rule fire.
   *
   * A refunds-only day counts as activity. It has no orders and no spend, but
   * money moved, and refunds outrunning sales is precisely what someone wants
   * an alert for — so the check is "was anything recorded", not "did we trade".
   */
  const periodHasActivity =
    analytics.hasData &&
    (analytics.metrics.orderCount.value > 0 ||
      analytics.metrics.adSpend.value.minor > 0 ||
      analytics.metrics.netRevenue.value.minor !== 0)
  const periodKey = input.periodKey ?? analytics.period.start.toISOString().slice(0, 10)

  for (const rule of input.rules) {
    if (!rule.enabled) {
      skipped.push({ ruleId: rule.id, reason: 'Rule is switched off.' })
      continue
    }

    if (!periodHasActivity) {
      skipped.push({
        ruleId: rule.id,
        reason: `No activity in ${analytics.period.label.toLowerCase()}, so there is nothing to judge.`,
      })
      continue
    }

    const metric = analytics.metrics[rule.metricKey as keyof typeof analytics.metrics] as
      | { value: unknown; unavailableReason?: string }
      | undefined

    if (!metric) {
      skipped.push({ ruleId: rule.id, reason: `Unknown metric "${rule.metricKey}".` })
      continue
    }

    const observed = numericValue(metric.value)
    if (observed === null) {
      // The load-bearing case. "Not available" is not "zero", and an alert that
      // treats them alike fires on absence.
      skipped.push({
        ruleId: rule.id,
        reason:
          metric.unavailableReason ??
          `${label(rule.metricKey)} is not available for this period, so the rule cannot be judged.`,
      })
      continue
    }

    const comparable = toComparable(rule.metricKey, observed)
    const breached =
      rule.comparator === 'above' ? comparable > rule.threshold : comparable < rule.threshold

    if (!breached) continue

    const observedDisplay = display(rule.metricKey, comparable, input.currency)
    const thresholdDisplay = display(rule.metricKey, rule.threshold, input.currency)

    raised.push({
      ruleId: rule.id,
      organizationId: rule.organizationId,
      severity: severityFor(rule, comparable),
      title: rule.name,
      body: `${label(rule.metricKey)} is ${observedDisplay} over ${analytics.period.label.toLowerCase()}, ${rule.comparator} your ${thresholdDisplay} threshold.`,
      link: '/app/command-center',
      // Rule plus period: re-running the evaluator on the same day is a no-op.
      dedupeKey: `rule:${rule.id}:${periodKey}`,
      evidence: {
        metric: rule.metricKey,
        observed: comparable,
        observedDisplay,
        threshold: rule.threshold,
        thresholdDisplay,
        comparator: rule.comparator,
        period: analytics.period.label,
        currency: input.currency,
      },
    })
  }

  return { raised, skipped }
}

/**
 * How loudly to shout. A threshold crossed by a hair is information; one
 * crossed by half again is a problem, and flattening the two teaches people to
 * ignore the channel.
 */
function severityFor(rule: NotificationRule, observed: number): 'info' | 'warning' | 'critical' {
  if (rule.threshold === 0) return 'warning'
  const overshoot =
    rule.comparator === 'above'
      ? (observed - rule.threshold) / Math.abs(rule.threshold)
      : (rule.threshold - observed) / Math.abs(rule.threshold)

  if (overshoot >= 0.5) return 'critical'
  if (overshoot >= 0.1) return 'warning'
  return 'info'
}

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'object' && 'minor' in (value as { minor: unknown })) {
    const minor = (value as { minor: number }).minor
    return Number.isFinite(minor) ? minor : null
  }
  return null
}

/** Converts the engine's internal units into the units the rule was written in. */
function toComparable(metricKey: string, raw: number): number {
  if (MONEY_METRICS.has(metricKey)) return raw / 100
  if (PERCENT_METRICS.has(metricKey)) return raw * 100
  return raw
}

function display(metricKey: string, value: number, currency: string): string {
  if (MONEY_METRICS.has(metricKey)) return formatMoney(money(Math.round(value * 100), currency))
  if (PERCENT_METRICS.has(metricKey)) return `${value.toFixed(1)}%`
  if (RATIO_METRICS.has(metricKey)) return `${value.toFixed(2)}×`
  return String(value)
}

function label(metricKey: string): string {
  return METRIC_LABELS[metricKey] ?? metricKey
}
