import { changeFor, type WorkspaceAnalytics } from '@/lib/workspace-analytics'
import { formatMoney, money } from '@/lib/money'
import { computeSignals, type Signal } from '@/lib/signals'

/**
 * A business's headline figures and signals, from its analytics.
 *
 * Shared by the owner's mission control and a person's own Businesses hub,
 * so the two screens cannot describe the same company differently.
 */
export function headlineFigures(
  analytics: WorkspaceAnalytics,
  currency: string,
): { netRevenueMinor: number; contributionProfitMinor: number; signals: Signal[] } {
  return {
    netRevenueMinor: analytics.metrics.netRevenue.value.minor,
    contributionProfitMinor: analytics.metrics.contributionProfit.value.minor,
    signals: computeSignals({
      revenue: changeFor(analytics, 'netRevenue'),
      profit: changeFor(analytics, 'contributionProfit'),
      spend: changeFor(analytics, 'adSpend'),
      contributionMargin: analytics.metrics.contributionMargin.value,
      refundRate: analytics.metrics.refundRate.value,
      unallocatedMinor: analytics.metrics.allocation.unallocated.minor,
      formatMoney: (minor) => formatMoney(money(Math.round(minor), currency)),
    }),
  }
}
