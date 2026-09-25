import Link from 'next/link'
import { Eyebrow, Panel } from '@/components/ui'
import { GlobalFilters, readFilters } from '@/components/GlobalFilters'
import { ProductPortfolioMatrix } from '@/components/charts/ProductPortfolioMatrix'
import { requireMembership } from '@/lib/session'
import { loadWorkspaceAnalytics } from '@/lib/workspace-analytics'
import { formatMoney, money } from '@/lib/money'
import { QUADRANT_LABELS, layoutPortfolio } from '@/lib/charts/flow'

export const metadata = { title: 'Products' }

/**
 * Drill-down target for the product-related metric tiles. Reads through the
 * same analytics module as the command center, so the totals here reconcile
 * with the tiles that linked in.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; comparison?: string }>
}) {
  const [{ membership }, params] = await Promise.all([requireMembership(), searchParams])
  const { preset, comparison } = readFilters(params)

  const analytics = loadWorkspaceAnalytics({
    isDemo: membership.isDemo,
    currency: membership.baseCurrency,
    preset,
    comparison,
  })
  const fmt = (minor: number) => formatMoney(money(Math.round(minor), analytics.currency))
  const placed = layoutPortfolio(analytics.portfolio).points
  const ranked = [...placed].sort((a, b) => b.revenue - a.revenue)

  const allocation = analytics.metrics.allocation

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>
          <Link href="/app/command-center" className="hover:underline">
            Command center
          </Link>{' '}
          / Products
        </Eyebrow>
        <h1 className="text-3xl font-semibold">Product performance</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Revenue, margin and growth per product for {analytics.period.label.toLowerCase()}.
          Allocated advertising uses the {allocation.model.replace(/_/g, ' ')} model.
        </p>
      </header>

      <GlobalFilters basePath="/app/products" preset={preset} comparison={comparison} />

      {ranked.length === 0 ? (
        <Panel className="border-amber/40">
          <Eyebrow>No products</Eyebrow>
          <p className="text-sm text-muted">
            No product-level data in this period. Import orders to populate this view.
          </p>
        </Panel>
      ) : (
        <>
          <ProductPortfolioMatrix points={analytics.portfolio} format={fmt} />

          <Panel>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
              By revenue
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs uppercase tracking-[0.1em] text-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">Product</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Revenue</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Margin</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Growth</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Allocated ads</th>
                    <th scope="col" className="py-2 font-medium">Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((p) => (
                    <tr key={p.productId} className="border-b border-hairline/50">
                      <td className="py-2 pr-3">{p.label}</td>
                      <td className="tabular py-2 pr-3 text-right">{fmt(p.revenue)}</td>
                      <td className="tabular py-2 pr-3 text-right">
                        {(p.margin * 100).toFixed(1)}%
                      </td>
                      <td className="tabular py-2 pr-3 text-right">
                        {(p.growth * 100).toFixed(1)}%
                      </td>
                      <td className="tabular py-2 pr-3 text-right">
                        {fmt(allocation.byProduct.get(p.productId)?.minor ?? 0)}
                      </td>
                      <td className="py-2 text-muted">{QUADRANT_LABELS[p.quadrant]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {allocation.explanation} Unallocated advertising of{' '}
              {formatMoney(allocation.unallocated)} is not attributed to any product above, so the
              allocated column does not sum to total spend.
            </p>
          </Panel>
        </>
      )}
    </div>
  )
}
