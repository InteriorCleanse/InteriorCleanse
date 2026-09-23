/**
 * The cross-company portfolio, for the platform owner only.
 *
 * This is the one place a person sees more than one tenant at once, and it
 * exists solely for the operator who owns the deployment. Two rules keep it
 * safe:
 *
 *   1. **It is pure.** This module takes rows and returns a summary. It reaches
 *      no database and holds no authority. The owner page reads the rows with
 *      the service role *after* the platform-role gate, exactly as the rest of
 *      the owner console does, and hands them here. Nothing tenant-facing can
 *      import a cross-tenant read by importing this.
 *   2. **It never invents figures.** Real workspaces do not yet compute metrics
 *      from the database — only the demo dataset does — so a real company's
 *      revenue is `null` here, shown as "connect a source", not as zero. A zero
 *      that means "no data" is the lie this product is built to refuse.
 *
 * Money is never summed across currencies, and demo figures are kept apart from
 * real ones so a demonstration workspace can never inflate a portfolio total.
 */

/** Subscription states that a portfolio owner should look at. */
export const ATTENTION_STATUSES = new Set([
  'past_due',
  'unpaid',
  'canceled',
  'incomplete_expired',
])

const HEALTHY_STATUSES = new Set(['active', 'trialing'])

export type CompanySummary = {
  id: string
  name: string
  isDemo: boolean
  planKey: string
  subscriptionStatus: string
  memberCount: number
  currency: string
  createdAt: string
  /** Demo headline figures; null for a real workspace with no computed metrics. */
  netRevenueMinor: number | null
  contributionProfitMinor: number | null
}

export type CountBucket = { key: string; count: number }
export type CurrencyTotal = { currency: string; minor: number }

export type PortfolioSummary = {
  total: number
  demo: number
  real: number
  /** Real companies whose subscription needs attention, most-urgent first. */
  attention: CompanySummary[]
  byStatus: CountBucket[]
  byPlan: CountBucket[]
  /** Demo revenue per currency — never summed across, never mixed with real. */
  demoRevenueByCurrency: CurrencyTotal[]
  /** Every company, attention first, then real before demo, then by name. */
  companies: CompanySummary[]
}

export function needsAttention(company: CompanySummary): boolean {
  // Only real companies raise a billing concern; a demo has no subscription
  // worth chasing.
  return !company.isDemo && ATTENTION_STATUSES.has(company.subscriptionStatus)
}

function tally(values: string[]): CountBucket[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  // Largest first, ties by key so the order is stable between renders.
  return [...counts].map(([key, count]) => ({ key, count })).sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key),
  )
}

export function summarizePortfolio(companies: readonly CompanySummary[]): PortfolioSummary {
  const demo = companies.filter((c) => c.isDemo)
  const real = companies.filter((c) => !c.isDemo)

  const attention = real
    .filter(needsAttention)
    .sort((a, b) => a.name.localeCompare(b.name))

  const byCurrency = new Map<string, number>()
  for (const company of demo) {
    if (company.netRevenueMinor === null) continue
    byCurrency.set(company.currency, (byCurrency.get(company.currency) ?? 0) + company.netRevenueMinor)
  }
  const demoRevenueByCurrency = [...byCurrency]
    .map(([currency, minor]) => ({ currency, minor }))
    .sort((a, b) => b.minor - a.minor || a.currency.localeCompare(b.currency))

  const rank = (c: CompanySummary) => (needsAttention(c) ? 0 : c.isDemo ? 2 : 1)
  const companiesSorted = [...companies].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  )

  return {
    total: companies.length,
    demo: demo.length,
    real: real.length,
    attention,
    byStatus: tally(companies.map((c) => c.subscriptionStatus || 'none')),
    byPlan: tally(companies.map((c) => c.planKey || 'none')),
    demoRevenueByCurrency,
    companies: companiesSorted,
  }
}

/** A short health word for a subscription status, for the roster badges. */
export function statusHealth(status: string): 'healthy' | 'attention' | 'idle' {
  if (ATTENTION_STATUSES.has(status)) return 'attention'
  if (HEALTHY_STATUSES.has(status)) return 'healthy'
  return 'idle'
}
