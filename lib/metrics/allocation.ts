import { allocate, type Money, money, sum, zero } from '@/lib/money'

/**
 * Ad-spend allocation.
 *
 * Profit per product is not allowed to be a black box. Shared spend — a brand
 * campaign, a category ad — has to land on products somehow, and the choice of
 * rule changes which products look profitable. So the rule is explicit, the
 * confidence is reported, and whatever could not be attributed stays visible in
 * an unallocated bucket rather than being quietly smeared across everything.
 *
 * The invariant that makes this trustworthy: allocated + unallocated always
 * equals total spend, exactly, to the minor unit. Spend is never double counted
 * and never invented.
 */

export type AllocationModel =
  /** Campaign explicitly mapped to a product by the operator. Highest confidence. */
  | 'direct_campaign'
  /** Campaign's landing page or SKU parameter identifies the product. */
  | 'sku_landing_page'
  /** Platform-attributed conversions name the product. */
  | 'attributed_conversion'
  /** Split by each product's share of revenue in the period. */
  | 'proportional_revenue'
  /** Direct mappings first; whatever remains goes proportional. */
  | 'blended'

export const ALLOCATION_MODEL_LABELS: Record<AllocationModel, string> = {
  direct_campaign: 'Direct campaign mapping',
  sku_landing_page: 'SKU / landing page mapping',
  attributed_conversion: 'Attributed conversions',
  proportional_revenue: 'Proportional to revenue',
  blended: 'Blended (direct, then proportional)',
}

/** How much to trust the result, surfaced next to any profit figure that uses it. */
export type AllocationConfidence = 'high' | 'medium' | 'low' | 'none'

const BASE_CONFIDENCE: Record<AllocationModel, AllocationConfidence> = {
  direct_campaign: 'high',
  sku_landing_page: 'high',
  attributed_conversion: 'medium',
  proportional_revenue: 'low',
  blended: 'medium',
}

export type SpendRecord = {
  id: string
  campaignId: string
  amount: Money
  /** Product this spend is explicitly tied to, when the model can determine one. */
  productId?: string | null
}

export type ProductRevenue = {
  productId: string
  netRevenue: Money
}

export type AllocationResult = {
  model: AllocationModel
  confidence: AllocationConfidence
  currency: string
  /** Allocated spend per product id. */
  byProduct: Map<string, Money>
  /** Spend that could not be attributed under this model. Always shown. */
  unallocated: Money
  totalSpend: Money
  /** Share of total spend that landed on a product, 0-1. Null when spend is zero. */
  allocatedShare: number | null
  /** Human-readable note explaining what the model did, for the UI tooltip. */
  explanation: string
}

function emptyResult(model: AllocationModel, currency: string): AllocationResult {
  return {
    model,
    confidence: 'none',
    currency,
    byProduct: new Map(),
    unallocated: zero(currency),
    totalSpend: zero(currency),
    allocatedShare: null,
    explanation: 'No advertising spend in this period.',
  }
}

/**
 * Allocates spend to products under the chosen model.
 *
 * `products` bounds the output: spend mapped to a product outside this set is
 * treated as unallocated rather than silently creating a phantom product row.
 */
export function allocateAdSpend(input: {
  model: AllocationModel
  spend: readonly SpendRecord[]
  products: readonly ProductRevenue[]
  currency: string
}): AllocationResult {
  const { model, spend, products, currency } = input

  if (spend.length === 0) return emptyResult(model, currency)

  const totalSpend = sum(
    spend.map((s) => s.amount),
    currency,
  )
  const known = new Set(products.map((p) => p.productId))
  const byProduct = new Map<string, Money>()

  const addTo = (productId: string, amount: Money) => {
    const current = byProduct.get(productId) ?? zero(currency)
    byProduct.set(productId, money(current.minor + amount.minor, currency))
  }

  const directModels: AllocationModel[] = [
    'direct_campaign',
    'sku_landing_page',
    'attributed_conversion',
  ]

  let unallocatedMinor = 0

  if (directModels.includes(model) || model === 'blended') {
    for (const record of spend) {
      if (record.productId && known.has(record.productId)) {
        addTo(record.productId, record.amount)
      } else {
        unallocatedMinor += record.amount.minor
      }
    }
  } else {
    unallocatedMinor = totalSpend.minor
  }

  // Proportional and blended push the remainder out by revenue share.
  const spreadsRemainder = model === 'proportional_revenue' || model === 'blended'

  if (spreadsRemainder && unallocatedMinor !== 0 && products.length > 0) {
    const weights = products.map((p) => Math.max(p.netRevenue.minor, 0))
    const hasSignal = weights.some((w) => w > 0)

    if (hasSignal) {
      const parts = allocate(money(unallocatedMinor, currency), weights)
      products.forEach((product, index) => {
        const part = parts[index]
        if (part && part.minor !== 0) addTo(product.productId, part)
      })
      unallocatedMinor = 0
    }
    // No revenue anywhere: leave it unallocated rather than spreading spend
    // evenly across products that sold nothing, which would invent a loss.
  }

  const allocatedMinor = totalSpend.minor - unallocatedMinor
  const allocatedShare = totalSpend.minor === 0 ? null : allocatedMinor / totalSpend.minor

  return {
    model,
    confidence: confidenceFor(model, allocatedShare),
    currency,
    byProduct,
    unallocated: money(unallocatedMinor, currency),
    totalSpend,
    allocatedShare,
    explanation: explain(model, allocatedShare, unallocatedMinor !== 0),
  }
}

function confidenceFor(
  model: AllocationModel,
  allocatedShare: number | null,
): AllocationConfidence {
  if (allocatedShare === null || allocatedShare === 0) return 'none'
  const base = BASE_CONFIDENCE[model]
  // A high-confidence model that only placed a third of spend is not, in
  // practice, a high-confidence answer for this period.
  if (allocatedShare < 0.5 && base === 'high') return 'medium'
  if (allocatedShare < 0.5 && base === 'medium') return 'low'
  return base
}

function explain(
  model: AllocationModel,
  allocatedShare: number | null,
  hasUnallocated: boolean,
): string {
  const label = ALLOCATION_MODEL_LABELS[model]
  if (allocatedShare === null) return 'No advertising spend in this period.'

  const percent = Math.round(allocatedShare * 100)
  const placed = `${label}: ${percent}% of spend attributed to a product`

  if (!hasUnallocated) return `${placed}.`
  return `${placed}. The remainder is shown separately as unallocated rather than spread across products.`
}

/** Total actually placed on products — for asserting conservation in the UI and tests. */
export function allocatedTotal(result: AllocationResult): Money {
  return sum(Array.from(result.byProduct.values()), result.currency)
}
