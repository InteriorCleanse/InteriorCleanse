import { z } from 'zod'
import type { Capability } from '@/lib/authz'
import { formatMoney, money } from '@/lib/money'
import { PRESET_LABELS, type PresetKey } from '@/lib/periods'
import { QUADRANT_LABELS, layoutPortfolio } from '@/lib/charts/flow'
import { ALLOCATION_MODEL_LABELS } from '@/lib/metrics/allocation'
import { loadWorkspaceAnalytics, type WorkspaceAnalytics } from '@/lib/workspace-analytics'
import { forecast } from './forecast'

/**
 * The analyst's tool surface.
 *
 * Every tool is typed with Zod and validated before execution, so a malformed
 * or hallucinated argument is rejected at the boundary rather than reaching a
 * query. Two properties are structural:
 *
 *   1. **Reads and writes are separate kinds.** A `write` tool never executes
 *      on the model's say-so — it returns a preview and the caller raises an
 *      approval bound to the exact arguments.
 *
 *   2. **There is no general-purpose tool.** No bash, no SQL, no filesystem, no
 *      HTTP fetch, no secret reader. The surface is a fixed list of business
 *      questions, so the worst case of a successful prompt injection is a
 *      question being asked, not a capability being borrowed.
 *
 * Tenant scope is not a parameter. Every executor receives the resolved
 * organization from the session; the model cannot name a workspace.
 */

export type ToolKind = 'read' | 'write'

export type ToolContext = {
  organizationId: string
  isDemo: boolean
  currency: string
  /** Capability the caller holds, checked before the tool runs. */
  can: (capability: Capability) => boolean
}

export type ToolResult = {
  /** Structured payload returned to the model. */
  data: unknown
  /** Metric keys or record ids this answer rests on, surfaced as source chips. */
  citations?: string[]
  /** Present on write tools: what the operator is being asked to agree to.
   *  `fields` is display-ready — formatted money, labelled metrics — because a
   *  card showing "Threshold 100000" is asking someone to approve a number
   *  they have to decode first, which is not informed consent. `details` stays
   *  raw: it is what gets hashed into the approval and executed. */
  preview?: {
    summary: string
    targetIntegration: string | null
    fields: { label: string; value: string }[]
    details: unknown
  }
}

export type ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string
  kind: ToolKind
  description: string
  schema: S
  /** Capability required to run it at all. */
  capability: Capability
  execute: (args: z.infer<S>, ctx: ToolContext) => Promise<ToolResult> | ToolResult
}

// ── Shared argument fragments ───────────────────────────────────────────────

const PeriodArg = z
  .enum(['today', 'yesterday', 'last_7', 'last_30', 'month_to_date', 'quarter_to_date', 'year_to_date'])
  .describe('Which time range to report on.')

function analyticsFor(ctx: ToolContext, preset: PresetKey): WorkspaceAnalytics {
  return loadWorkspaceAnalytics({
    isDemo: ctx.isDemo,
    currency: ctx.currency,
    preset,
    comparison: 'previous_period',
  })
}

const fmt = (currency: string) => (minor: number) =>
  formatMoney(money(Math.round(minor), currency))

/**
 * Shapes a metric for the model with its provenance attached, so the assistant
 * can cite a formula and a freshness rather than asserting a bare number.
 */
function describeMetric(metric: {
  key: string
  label: string
  value: unknown
  formula: string
  exclusions: string[]
  unavailableReason?: string
  freshestAt: Date | null
  period: { label: string }
}, currency: string) {
  const raw = metric.value
  const value =
    raw === null || raw === undefined
      ? null
      : typeof raw === 'object' && 'minor' in (raw as { minor: number })
        ? fmt(currency)((raw as { minor: number }).minor)
        : raw

  return {
    key: metric.key,
    label: metric.label,
    value,
    unavailable: value === null ? (metric.unavailableReason ?? 'Not available') : undefined,
    formula: metric.formula,
    excludes: metric.exclusions,
    period: metric.period.label,
    currency,
    dataFreshAsOf: metric.freshestAt?.toISOString() ?? 'never synced',
  }
}

// ── Read tools ──────────────────────────────────────────────────────────────

const queryKpis: ToolDefinition = {
  name: 'query_kpis',
  kind: 'read',
  capability: 'data:view',
  description:
    'Headline metrics for a period — revenue, profit, ad spend, ROAS, AOV, CAC, refund rate, orders. Each value comes back with its formula, currency, period and freshness. Use this for "how are we doing" questions.',
  schema: z.object({ period: PeriodArg.default('last_30') }),
  execute: (args, ctx) => {
    const a = analyticsFor(ctx, args.period)
    const m = a.metrics
    const keys = [
      'netRevenue', 'grossProfit', 'contributionProfit', 'adSpend',
      'roas', 'mer', 'aov', 'cac', 'refundRate', 'contributionMargin',
      'orderCount', 'unitsSold',
    ] as const

    return {
      data: {
        period: a.period.label,
        currency: a.currency,
        isDemoWorkspace: ctx.isDemo,
        metrics: keys.map((k) => describeMetric(m[k], a.currency)),
        dataQualityWarnings: m.warnings,
      },
      citations: keys.map((k) => m[k].key),
    }
  },
}

const comparePeriods: ToolDefinition = {
  name: 'compare_periods',
  kind: 'read',
  capability: 'data:view',
  description:
    'Compare a metric between a period and the one before it. Returns both values and the change. Use this for "is it up or down" questions.',
  schema: z.object({
    period: PeriodArg.default('last_30'),
    metric: z
      .enum(['netRevenue', 'grossProfit', 'contributionProfit', 'adSpend', 'orderCount', 'aov'])
      .describe('Which metric to compare.'),
  }),
  // The enum above is a subset of MetricsResult's keys, but Zod hands the
  // executor a widened `any` for the parsed args, so the indexes below are
  // narrowed explicitly rather than left implicit.
  execute: (args, ctx) => {
    const a = analyticsFor(ctx, args.period)
    const key = args.metric as 'netRevenue' | 'grossProfit' | 'contributionProfit' | 'adSpend' | 'orderCount' | 'aov'
    const current = a.metrics[key]
    const previous = a.comparisonMetrics?.[key]

    return {
      data: {
        metric: current.label,
        period: a.period.label,
        comparisonPeriod: a.comparisonPeriod?.label ?? null,
        current: describeMetric(current, a.currency),
        previous: previous ? describeMetric(previous, a.currency) : null,
        note:
          'A change is only meaningful if both periods had activity. Growth from a zero baseline is reported as unavailable, not as a percentage.',
      },
      citations: [current.key],
    }
  },
}

const rankProducts: ToolDefinition = {
  name: 'rank_products',
  kind: 'read',
  capability: 'data:view',
  description:
    'Rank products by revenue, margin or growth, with each one placed in a portfolio quadrant. Use this for "what is selling" and "what should I cut" questions.',
  schema: z.object({
    period: PeriodArg.default('last_30'),
    by: z.enum(['revenue', 'margin', 'growth']).default('revenue'),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  execute: (args, ctx) => {
    const a = analyticsFor(ctx, args.period)
    const placed = layoutPortfolio(a.portfolio).points
    const sorted = [...placed].sort((x, y) =>
      args.by === 'revenue' ? y.revenue - x.revenue
        : args.by === 'margin' ? y.margin - x.margin
          : y.growth - x.growth,
    )

    return {
      data: {
        period: a.period.label,
        currency: a.currency,
        rankedBy: args.by,
        products: sorted.slice(0, args.limit).map((p) => ({
          product: p.label,
          revenue: fmt(a.currency)(p.revenue),
          marginPercent: Number((p.margin * 100).toFixed(1)),
          growthPercent: Number((p.growth * 100).toFixed(1)),
          allocatedAdSpend: fmt(a.currency)(
            a.metrics.allocation.byProduct.get(p.productId)?.minor ?? 0,
          ),
          assessment: QUADRANT_LABELS[p.quadrant],
        })),
        allocationCaveat: a.metrics.allocation.explanation,
        allocationConfidence: a.metrics.allocation.confidence,
      },
      citations: ['top_products', 'contribution_margin'],
    }
  },
}

const analyzeProfitBridge: ToolDefinition = {
  name: 'analyze_profit_bridge',
  kind: 'read',
  capability: 'data:view',
  description:
    'Break revenue down into every cost and what remains as profit. Use this to explain why profit moved differently from revenue.',
  schema: z.object({ period: PeriodArg.default('last_30') }),
  execute: (args, ctx) => {
    const a = analyticsFor(ctx, args.period)
    const f = fmt(a.currency)
    return {
      data: {
        period: a.period.label,
        currency: a.currency,
        inflow: { label: 'Net revenue', amount: f(a.sankey.inflow) },
        outflows: a.sankey.outflows.map((o) => ({
          label: o.label,
          amount: f(o.amount),
          shareOfRevenuePercent:
            a.sankey.inflow === 0 ? null : Number(((o.amount / a.sankey.inflow) * 100).toFixed(1)),
        })),
        note: 'Every unit of revenue is assigned to a cost or to retained profit; the components sum exactly to net revenue.',
      },
      citations: ['net_revenue', 'contribution_profit'],
    }
  },
}

const inspectDataQuality: ToolDefinition = {
  name: 'inspect_data_quality',
  kind: 'read',
  capability: 'data:view',
  description:
    'Report anything that makes the numbers partial or estimated — missing costs, unallocated ad spend, stale sources, test orders. Call this before making a confident claim.',
  schema: z.object({ period: PeriodArg.default('last_30') }),
  execute: (args, ctx) => {
    const a = analyticsFor(ctx, args.period)
    return {
      data: {
        period: a.period.label,
        isDemoWorkspace: ctx.isDemo,
        hasAnyData: a.hasData,
        warnings: a.metrics.warnings,
        adSpendAllocation: {
          model: ALLOCATION_MODEL_LABELS[a.metrics.allocation.model],
          confidence: a.metrics.allocation.confidence,
          unallocated: fmt(a.currency)(a.metrics.allocation.unallocated.minor),
          explanation: a.metrics.allocation.explanation,
        },
        freshness: a.metrics.netRevenue.freshestAt?.toISOString() ?? 'never synced',
      },
      citations: ['data_quality'],
    }
  },
}

const getMetricDefinition: ToolDefinition = {
  name: 'get_metric_definition',
  kind: 'read',
  capability: 'data:view',
  description:
    'The exact formula and exclusions for a named metric. Use this whenever explaining how a number was calculated.',
  schema: z.object({
    metric: z.enum([
      'grossSales', 'netRevenue', 'grossProfit', 'contributionProfit',
      'adSpend', 'roas', 'mer', 'cac', 'aov', 'refundRate', 'contributionMargin',
    ]),
  }),
  execute: (args, ctx) => {
    const a = analyticsFor(ctx, 'last_30')
    const m = a.metrics[args.metric as keyof typeof a.metrics] as Parameters<typeof describeMetric>[0]
    return {
      data: { key: m.key, label: m.label, formula: m.formula, excludes: m.exclusions },
      citations: [m.key],
    }
  },
}

const forecastRevenue: ToolDefinition = {
  name: 'forecast_revenue',
  kind: 'read',
  capability: 'data:view',
  description:
    'Project revenue forward from recent history, with an uncertainty range. Always presented as an estimate with stated assumptions, never as a promise.',
  schema: z.object({
    period: PeriodArg.default('last_30'),
    daysAhead: z.number().int().min(1).max(90).default(30),
  }),
  execute: (args, ctx) => {
    const a = analyticsFor(ctx, args.period)
    // A workspace with no trading history has a series of zeroes, which fits a
    // flat line perfectly and would come back as "£0.00, 80% confidence". That
    // is arithmetic, not a forecast, so refuse before fitting anything.
    const result = a.hasData ? forecast(a.series.netRevenue, args.daysAhead) : null
    const f = fmt(a.currency)

    if (!result) {
      return {
        data: {
          available: false,
          reason:
            'Not enough history to project from. A forecast needs several periods of data; making one up would be a guess dressed as an estimate.',
        },
        citations: ['net_revenue'],
      }
    }

    return {
      data: {
        available: true,
        basis: `${a.series.netRevenue.length} ${a.granularity} buckets from ${a.period.label}`,
        currency: a.currency,
        pointEstimate: f(result.point),
        range: { low: f(result.low), high: f(result.high) },
        confidence: `${Math.round(result.confidence * 100)}%`,
        trendPerBucket: f(result.slope),
        assumptions: result.assumptions,
        caveat:
          'This is an estimate from past data, not a prediction of what will happen. It assumes conditions continue unchanged.',
      },
      citations: ['net_revenue'],
    }
  },
}

// ── Metric vocabulary for proposals ─────────────────────────────────────────

/** Human labels, and whether a value in this metric is money. */
const GOAL_METRICS = {
  netRevenue: { label: 'Net revenue', money: true },
  contributionProfit: { label: 'Contribution profit', money: true },
  adSpend: { label: 'Ad spend', money: true },
  roas: { label: 'ROAS', money: false },
  orderCount: { label: 'Orders', money: false },
  refundRate: { label: 'Refund rate', money: false },
  contributionMargin: { label: 'Contribution margin', money: false },
} as const

type GoalMetric = keyof typeof GOAL_METRICS

/**
 * Renders a proposed threshold the way the operator will read it back.
 *
 * Money arrives in whole currency units — see the schema descriptions. Asking
 * a model for minor units invites an order-of-magnitude error on exactly the
 * field where one matters most, and "250000" meaning £2,500 is the kind of
 * mistake nobody catches until the alert never fires.
 */
function describeTarget(metric: GoalMetric, value: number, currency: string): string {
  const spec = GOAL_METRICS[metric]
  if (spec.money) return formatMoney(money(Math.round(value * 100), currency))
  if (metric === 'roas') return `${value.toFixed(2)}×`
  if (metric === 'refundRate' || metric === 'contributionMargin') return `${value}%`
  return String(value)
}

// ── Write tools ─────────────────────────────────────────────────────────────
// These never act here. They return a preview; the route raises an approval
// bound to these exact arguments, and execution happens only after a human
// approves that specific request.

const createGoal: ToolDefinition = {
  name: 'create_goal',
  kind: 'write',
  capability: 'assistant:approve_action',
  description:
    'Propose a business goal with a target and deadline. Returns a preview for approval; it does not create anything by itself.',
  schema: z.object({
    title: z.string().min(1).max(120),
    metric: z.enum(['netRevenue', 'contributionProfit', 'roas', 'orderCount']),
    targetValue: z
      .number()
      .positive()
      .describe(
        'For money metrics, the target in whole currency units — 250000 means two hundred and fifty thousand, not 2,500. For ROAS, the multiple. For orders, the count.',
      ),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  }),
  execute: (args, ctx) => {
    const metric = args.metric as GoalMetric
    const target = describeTarget(metric, args.targetValue, ctx.currency)
    return {
      data: { staged: true },
      preview: {
        summary: `Create the goal “${args.title}”: reach ${target} of ${GOAL_METRICS[metric].label.toLowerCase()} by ${args.deadline}.`,
        targetIntegration: null,
        fields: [
          { label: 'Goal', value: args.title },
          { label: 'Measure', value: GOAL_METRICS[metric].label },
          { label: 'Target', value: target },
          { label: 'Deadline', value: args.deadline },
        ],
        details: args,
      },
    }
  },
}

const createNotificationRule: ToolDefinition = {
  name: 'create_notification_rule',
  kind: 'write',
  capability: 'assistant:approve_action',
  description:
    'Propose an alert rule, for example daily spend above a threshold with ROAS below a floor. Returns a preview for approval.',
  schema: z.object({
    name: z.string().min(1).max(120),
    metric: z.enum(['adSpend', 'roas', 'refundRate', 'contributionMargin', 'netRevenue']),
    comparator: z.enum(['above', 'below']),
    threshold: z
      .number()
      .describe(
        'For money metrics, whole currency units. For ROAS, the multiple. For refund rate and margin, a percentage such as 8 for 8%.',
      ),
    channel: z.enum(['in_app', 'email']).default('in_app'),
  }),
  execute: (args, ctx) => {
    const metric = args.metric as GoalMetric
    const threshold = describeTarget(metric, args.threshold, ctx.currency)
    const delivery = args.channel === 'in_app' ? 'in the app' : 'by email'
    return {
      data: { staged: true },
      preview: {
        summary: `Alert “${args.name}” when ${GOAL_METRICS[metric].label.toLowerCase()} goes ${args.comparator} ${threshold}, delivered ${delivery}.`,
        targetIntegration: args.channel === 'email' ? 'email' : null,
        fields: [
          { label: 'Alert', value: args.name },
          { label: 'Watches', value: GOAL_METRICS[metric].label },
          { label: 'Fires when', value: `${args.comparator} ${threshold}` },
          { label: 'Delivered', value: delivery },
        ],
        details: args,
      },
    }
  },
}

// ── Registry ────────────────────────────────────────────────────────────────

export const TOOLS: ToolDefinition[] = [
  queryKpis,
  comparePeriods,
  rankProducts,
  analyzeProfitBridge,
  inspectDataQuality,
  getMetricDefinition,
  forecastRevenue,
  createGoal,
  createNotificationRule,
]

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

export function readTools(): ToolDefinition[] {
  return TOOLS.filter((t) => t.kind === 'read')
}

export function writeTools(): ToolDefinition[] {
  return TOOLS.filter((t) => t.kind === 'write')
}

/** Suggested commands for the dock, derived from what the tools can answer. */
export const SUGGESTED_COMMANDS = [
  'Give me today’s business briefing.',
  'What product made the most profit this month?',
  'Why did profit fall even though revenue increased?',
  'What can I cut without hurting profitable growth?',
  'How reliable are these numbers right now?',
] as const

export { PRESET_LABELS }
