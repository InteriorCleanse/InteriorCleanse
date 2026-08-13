import { formatMoney } from '@/lib/money'
import { changeSentiment, type Change } from '@/lib/periods'
import { QUADRANT_LABELS, layoutPortfolio } from '@/lib/charts/flow'
import { changeFor, loadWorkspaceAnalytics } from '@/lib/workspace-analytics'

/**
 * Executive briefings.
 *
 * Deliberately computed, not generated. A briefing that fires on a schedule and
 * lands in someone's morning is the last place to want a model paraphrasing
 * numbers: it runs unattended, nobody checks it against the dashboard, and one
 * hallucinated figure is worse than no briefing at all. So the arithmetic and
 * the sentence structure are both fixed here, and the assistant's role is to
 * *discuss* the briefing afterwards, not to author it.
 *
 * It also means briefings work with no model configured at all, which matters
 * for a self-hosted or trial workspace.
 */

export type BriefingKind = 'morning' | 'end_of_day' | 'weekly' | 'monthly'

export const BRIEFING_LABELS: Record<BriefingKind, string> = {
  morning: 'Morning briefing',
  end_of_day: 'End of day',
  weekly: 'Weekly review',
  monthly: 'Monthly review',
}

export type BriefingLine = {
  label: string
  value: string
  /** Movement against the comparison period, when one is meaningful. */
  change: string | null
  sentiment: 'positive' | 'negative' | 'neutral'
}

export type Briefing = {
  kind: BriefingKind
  title: string
  period: string
  comparisonPeriod: string | null
  currency: string
  isDemo: boolean
  /** One sentence with the single most important thing. */
  headline: string
  lines: BriefingLine[]
  /** Observations that need a decision, in priority order. */
  attention: string[]
  /** Data-quality caveats. Present means the numbers below are partial. */
  caveats: string[]
  /** Questions the operator can hand straight back to the assistant. */
  followUps: string[]
}

const PRESET_FOR: Record<BriefingKind, 'today' | 'last_7' | 'month_to_date'> = {
  morning: 'today',
  end_of_day: 'today',
  weekly: 'last_7',
  monthly: 'month_to_date',
}

function describeChange(change: Change | null, asPercent = true): string | null {
  if (!change) return null
  if (change.percent === null) return change.unavailableReason ?? 'no comparable prior period'
  if (change.direction === 'flat') return 'flat'
  const arrow = change.direction === 'up' ? 'up' : 'down'
  return asPercent
    ? `${arrow} ${Math.abs(change.percent * 100).toFixed(1)}%`
    : `${arrow} ${Math.abs(change.absolute).toFixed(1)}`
}

export function buildBriefing(options: {
  kind: BriefingKind
  isDemo: boolean
  currency?: string
}): Briefing {
  const { kind, isDemo } = options
  const analytics = loadWorkspaceAnalytics({
    isDemo,
    currency: options.currency,
    preset: PRESET_FOR[kind],
    comparison: 'previous_period',
  })

  const m = analytics.metrics
  const currency = analytics.currency
  const cash = (minor: number) => formatMoney({ minor, currency })

  const base: Omit<Briefing, 'headline' | 'lines' | 'attention' | 'followUps'> = {
    kind,
    title: BRIEFING_LABELS[kind],
    period: analytics.period.label,
    comparisonPeriod: analytics.comparisonPeriod?.label ?? null,
    currency,
    isDemo,
    caveats: [...m.warnings],
  }

  // An empty workspace gets an honest empty briefing rather than a page of
  // zeroes that look like a catastrophic trading day.
  if (!analytics.hasData) {
    return {
      ...base,
      // Caveats about *how partial* the figures are read as noise when there
      // are no figures. The headline already says the only thing that matters.
      caveats: [],
      headline: 'No data for this period yet — connect a source or import a file to see figures.',
      lines: [],
      attention: [],
      followUps: ['What do I need to connect to get a briefing?'],
    }
  }

  const revenueChange = changeFor(analytics, 'netRevenue')
  const profitChange = changeFor(analytics, 'contributionProfit')
  const spendChange = changeFor(analytics, 'adSpend')
  const ordersChange = changeFor(analytics, 'orderCount')

  const lines: BriefingLine[] = [
    {
      label: 'Net revenue',
      value: cash(m.netRevenue.value.minor),
      change: describeChange(revenueChange),
      sentiment: changeSentiment('net_revenue', revenueChange?.direction ?? 'flat'),
    },
    {
      label: 'Contribution profit',
      value: cash(m.contributionProfit.value.minor),
      change: describeChange(profitChange),
      sentiment: changeSentiment('contribution_profit', profitChange?.direction ?? 'flat'),
    },
    {
      label: 'Ad spend',
      value: cash(m.adSpend.value.minor),
      change: describeChange(spendChange),
      sentiment: changeSentiment('ad_spend', spendChange?.direction ?? 'flat'),
    },
    {
      label: 'Orders',
      value: String(m.orderCount.value),
      change: describeChange(ordersChange),
      sentiment: changeSentiment('order_count', ordersChange?.direction ?? 'flat'),
    },
    {
      label: 'ROAS',
      value: m.roas.value === null ? 'Not available' : `${m.roas.value.toFixed(2)}×`,
      change: null,
      sentiment: 'neutral',
    },
    {
      label: 'Contribution margin',
      value:
        m.contributionMargin.value === null
          ? 'Not available'
          : `${(m.contributionMargin.value * 100).toFixed(1)}%`,
      change: null,
      sentiment: 'neutral',
    },
  ]

  return {
    ...base,
    lines,
    headline: headlineFor(kind, {
      revenue: cash(m.netRevenue.value.minor),
      profit: cash(m.contributionProfit.value.minor),
      revenueChange,
      profitChange,
      period: analytics.period.label,
    }),
    attention: attentionFor(analytics, { revenueChange, profitChange, spendChange }),
    followUps: followUpsFor(kind),
  }
}

function headlineFor(
  kind: BriefingKind,
  ctx: {
    revenue: string
    profit: string
    revenueChange: Change | null
    profitChange: Change | null
    period: string
  },
): string {
  const move = describeChange(ctx.revenueChange)
  const movement = move && move !== 'flat' ? `, ${move} on the period before` : ''

  switch (kind) {
    case 'morning':
      return `So far ${ctx.period.toLowerCase()}: ${ctx.revenue} net revenue${movement}, ${ctx.profit} contribution profit.`
    case 'end_of_day':
      return `${ctx.period}: ${ctx.revenue} net revenue${movement}, ${ctx.profit} kept as contribution profit.`
    case 'weekly':
      return `Over ${ctx.period.toLowerCase()}: ${ctx.revenue} net revenue${movement}, ${ctx.profit} contribution profit.`
    case 'monthly':
      return `${ctx.period} to date: ${ctx.revenue} net revenue${movement}, ${ctx.profit} contribution profit.`
  }
}

/**
 * The part worth reading. Each item is a divergence someone should decide
 * about — not a restatement of a number already in the table above.
 */
function attentionFor(
  analytics: ReturnType<typeof loadWorkspaceAnalytics>,
  changes: {
    revenueChange: Change | null
    profitChange: Change | null
    spendChange: Change | null
  },
): string[] {
  const out: string[] = []
  const m = analytics.metrics
  const cash = (minor: number) => formatMoney({ minor, currency: analytics.currency })

  // Revenue and profit moving in opposite directions is the single most
  // commonly missed signal in ecommerce reporting, so it leads.
  const { revenueChange, profitChange, spendChange } = changes
  if (
    revenueChange &&
    profitChange &&
    revenueChange.direction === 'up' &&
    profitChange.direction === 'down'
  ) {
    out.push(
      'Revenue rose while contribution profit fell — the extra sales cost more than they returned. Ask why to see the breakdown.',
    )
  }

  if (
    spendChange?.percent !== null &&
    spendChange &&
    revenueChange?.percent != null &&
    spendChange.percent > 0.15 &&
    spendChange.percent > revenueChange.percent * 2
  ) {
    out.push(
      `Ad spend is up ${(spendChange.percent * 100).toFixed(0)}% but revenue is up only ${(revenueChange.percent * 100).toFixed(0)}%. Efficiency is falling.`,
    )
  }

  if (m.contributionMargin.value !== null && m.contributionMargin.value < 0.15) {
    out.push(
      `Contribution margin is ${(m.contributionMargin.value * 100).toFixed(1)}% — thin enough that a refund run or a shipping increase would take it negative.`,
    )
  }

  if (m.refundRate.value !== null && m.refundRate.value > 0.08) {
    out.push(
      `Refund rate is ${(m.refundRate.value * 100).toFixed(1)}%, above the point where it usually signals a product or fulfilment problem rather than normal returns.`,
    )
  }

  if (m.allocation.unallocated.minor > 0) {
    out.push(
      `${cash(m.allocation.unallocated.minor)} of ad spend could not be attributed to a product, so per-product profit is understated by that amount somewhere.`,
    )
  }

  const losing = layoutPortfolio(analytics.portfolio).points.filter(
    (p) => p.quadrant === 'cut' || p.quadrant === 'fix',
  )
  if (losing.length > 0) {
    const worst = [...losing].sort((a, b) => a.margin - b.margin)[0]!
    out.push(
      `${worst.label}: ${QUADRANT_LABELS[worst.quadrant].toLowerCase()} — ${cash(worst.revenue)} revenue at ${(worst.margin * 100).toFixed(1)}% margin.`,
    )
  }

  return out
}

function followUpsFor(kind: BriefingKind): string[] {
  const shared = ['Why did profit move differently from revenue?', 'How reliable are these numbers?']
  switch (kind) {
    case 'morning':
      return ['What should I deal with first today?', ...shared]
    case 'end_of_day':
      return ['What was the best and worst product today?', ...shared]
    case 'weekly':
      return ['What can I cut without hurting profitable growth?', ...shared]
    case 'monthly':
      return ['Project this month to the end of the month.', ...shared]
  }
}

/** Flattens a briefing into speakable prose, for the voice surface. */
export function briefingToSpeech(briefing: Briefing): string {
  const parts = [briefing.isDemo ? 'This is demonstration data.' : '', briefing.headline]
  if (briefing.attention.length > 0) parts.push(briefing.attention[0]!)
  if (briefing.caveats.length > 0) parts.push(`One caveat: ${briefing.caveats[0]}`)
  return parts.filter(Boolean).join(' ')
}
