import type { Change } from '@/lib/periods'

/**
 * Signals: the "what needs a decision" layer, computed from figures already on
 * the page.
 *
 * This is the same discipline the briefing's attention list uses, in a form a
 * dashboard can show at a glance. It is deliberately per-workspace and pure —
 * it takes numbers, returns observations, reaches no database and crosses no
 * tenant. A roll-up across companies is a different, owner-scoped feature with
 * its own isolation tests; this never pretends to be that.
 *
 * Each signal states the mechanism, not just the number, because a dashboard
 * that says "margin is 12%" is a fact and a dashboard that says "margin is thin
 * enough that a refund run turns it negative" is a decision.
 */

export type SignalSeverity = 'critical' | 'warning' | 'info'

export type Signal = {
  id: string
  severity: SignalSeverity
  title: string
  detail: string
}

export type SignalInput = {
  revenue: Change | null
  profit: Change | null
  spend: Change | null
  /** 0–1, or null when it cannot be computed. */
  contributionMargin: number | null
  /** 0–1, or null. */
  refundRate: number | null
  /** Ad spend that could not be attributed to a product, in minor units. */
  unallocatedMinor: number
  formatMoney: (minor: number) => string
  /** Open CRM deals past their expected close, when a pipeline is connected. */
  pipelineOverdue?: number
}

const RANK: Record<SignalSeverity, number> = { critical: 0, warning: 1, info: 2 }

const pct = (value: number) => `${Math.abs(value * 100).toFixed(0)}%`

export function computeSignals(input: SignalInput): Signal[] {
  const out: Signal[] = []
  const { revenue, profit, spend } = input

  // The most-missed signal in ecommerce reporting: the two lines diverging.
  if (revenue?.direction === 'up' && profit?.direction === 'down') {
    out.push({
      id: 'revenue-up-profit-down',
      severity: 'critical',
      title: 'Revenue up, profit down',
      detail:
        'Sales rose while contribution profit fell — the extra orders cost more than they returned. Ask why to see the breakdown.',
    })
  }

  // Spend outrunning the revenue it buys.
  if (
    spend?.percent != null &&
    revenue?.percent != null &&
    spend.percent > 0.15 &&
    spend.percent > revenue.percent * 2
  ) {
    out.push({
      id: 'ad-efficiency-falling',
      severity: 'warning',
      title: 'Ad efficiency is falling',
      detail: `Ad spend is up ${pct(spend.percent)} but revenue is up only ${pct(revenue.percent)}. Each new order is getting more expensive.`,
    })
  }

  if (input.contributionMargin !== null && input.contributionMargin < 0.15) {
    out.push({
      id: 'thin-margin',
      severity: 'warning',
      title: 'Contribution margin is thin',
      detail: `Margin is ${(input.contributionMargin * 100).toFixed(1)}% — low enough that a refund run or a shipping increase would take it negative.`,
    })
  }

  if (input.refundRate !== null && input.refundRate > 0.08) {
    out.push({
      id: 'high-refunds',
      severity: 'warning',
      title: 'Refund rate is high',
      detail: `Refunds are ${(input.refundRate * 100).toFixed(1)}% of orders, past the point where it usually means a product or fulfilment problem rather than normal returns.`,
    })
  }

  if ((input.pipelineOverdue ?? 0) > 0) {
    const n = input.pipelineOverdue!
    out.push({
      id: 'pipeline-overdue',
      severity: 'warning',
      title: `${n} deal${n === 1 ? '' : 's'} past expected close`,
      detail: `${n} open deal${n === 1 ? ' is' : 's are'} past ${n === 1 ? 'its' : 'their'} expected close in the CRM. Pipeline, not revenue — but a date somebody set has slipped.`,
    })
  }

  if (input.unallocatedMinor > 0) {
    out.push({
      id: 'unallocated-spend',
      severity: 'info',
      title: 'Some ad spend is unattributed',
      detail: `${input.formatMoney(input.unallocatedMinor)} of ad spend could not be tied to a product, so per-product profit is understated by that amount somewhere.`,
    })
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity])
}
