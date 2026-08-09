import { money, type Money } from '@/lib/money'
import type {
  NormalisedOrder,
  NormalisedRefund,
  NormalisedSpend,
} from '@/lib/metrics/engine'

/**
 * Deterministic demo dataset.
 *
 * Two requirements shape this:
 *
 *   1. **Deterministic.** A seeded PRNG, not `Math.random()`, so the demo
 *      workspace shows the same figures on every machine and every reset. A
 *      demo whose numbers drift is impossible to write documentation or
 *      screenshots against, and impossible to test.
 *
 *   2. **Internally consistent.** Refunds reference real orders, ad spend
 *      references real products, and costs are below prices. A demo that shows
 *      negative margin because the fake COGS exceeded the fake price teaches
 *      the operator to distrust the product.
 *
 * This data is only ever attached to an organization with `is_demo = true`, and
 * every surface that renders it shows the demo badge.
 */

/** mulberry32 — small, fast, and stable across engines. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const DEMO_SEED = 20260101

export type DemoProduct = {
  id: string
  name: string
  sku: string
  category: string
  priceMinor: number
  costMinor: number
  fulfillmentMinor: number
  /** Relative popularity, drives how often it appears in orders. */
  weight: number
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  { id: 'demo-candle', name: 'Amber Hearth Candle', sku: 'CND-001', category: 'Home', priceMinor: 3400, costMinor: 1150, fulfillmentMinor: 320, weight: 34 },
  { id: 'demo-tote', name: 'Everyday Canvas Tote', sku: 'TOT-002', category: 'Accessories', priceMinor: 2800, costMinor: 980, fulfillmentMinor: 410, weight: 22 },
  { id: 'demo-book', name: 'The Considered Home', sku: 'BOK-003', category: 'Books', priceMinor: 1900, costMinor: 640, fulfillmentMinor: 280, weight: 18 },
  { id: 'demo-diffuser', name: 'Cedar Reed Diffuser', sku: 'DIF-004', category: 'Home', priceMinor: 4200, costMinor: 1890, fulfillmentMinor: 350, weight: 14 },
  // Deliberately unprofitable after ad spend, so the demo has something to find.
  { id: 'demo-mug', name: 'Stoneware Mug', sku: 'MUG-005', category: 'Kitchen', priceMinor: 2200, costMinor: 1480, fulfillmentMinor: 520, weight: 12 },
]

export type DemoDataset = {
  currency: string
  products: DemoProduct[]
  orders: NormalisedOrder[]
  refunds: NormalisedRefund[]
  spend: NormalisedSpend[]
  periodStart: Date
  periodEnd: Date
}

/**
 * Builds the dataset. `endDate` is injected rather than read from the clock so
 * tests and snapshots are reproducible.
 */
export function buildDemoDataset(options: {
  endDate: Date
  days?: number
  currency?: string
  seed?: number
}): DemoDataset {
  const { endDate } = options
  const days = options.days ?? 56
  const currency = options.currency ?? 'USD'
  const random = makeRandom(options.seed ?? DEMO_SEED)

  const m = (minor: number): Money => money(Math.round(minor), currency)

  const orders: NormalisedOrder[] = []
  const refunds: NormalisedRefund[] = []
  const spend: NormalisedSpend[] = []

  const totalWeight = DEMO_PRODUCTS.reduce((sum, p) => sum + p.weight, 0)
  const pickProduct = (): DemoProduct => {
    let roll = random() * totalWeight
    for (const product of DEMO_PRODUCTS) {
      roll -= product.weight
      if (roll <= 0) return product
    }
    return DEMO_PRODUCTS[0]!
  }

  const seenCustomers = new Set<string>()
  const startMs = endDate.getTime() - days * 86_400_000

  for (let day = 0; day < days; day += 1) {
    const dayStart = new Date(startMs + day * 86_400_000)
    const dayOfWeek = dayStart.getUTCDay()

    // A gentle weekly rhythm plus slow growth — recognisable as a real business
    // without being suspiciously smooth.
    const weekendLift = dayOfWeek === 0 || dayOfWeek === 6 ? 1.35 : 1
    const growth = 1 + day / (days * 2)
    const ordersToday = Math.max(0, Math.round((2 + random() * 5) * weekendLift * growth))

    for (let n = 0; n < ordersToday; n += 1) {
      const placedAt = new Date(dayStart.getTime() + Math.floor(random() * 86_400_000))
      const orderId = `demo-order-${day}-${n}`
      const customerId = `demo-customer-${Math.floor(random() * 140)}`
      const isNewCustomer = !seenCustomers.has(customerId)
      seenCustomers.add(customerId)

      const lineCount = random() < 0.28 ? 2 : 1
      const lines = Array.from({ length: lineCount }, () => {
        const product = pickProduct()
        const quantity = random() < 0.18 ? 2 : 1
        const gross = product.priceMinor * quantity
        // Roughly one order in six carries a 10% promotion.
        const discount = random() < 0.17 ? Math.round(gross * 0.1) : 0

        return {
          productId: product.id,
          productName: product.name,
          quantity,
          grossAmount: m(gross),
          discountAmount: m(discount),
          cogsAmount: m(product.costMinor * quantity),
          fulfillmentCost: m(product.fulfillmentMinor * quantity),
        }
      })

      const subtotal = lines.reduce((sum, l) => sum + l.grossAmount.minor - l.discountAmount.minor, 0)

      orders.push({
        id: orderId,
        createdAt: placedAt,
        currency,
        lines,
        shippingRevenue: m(subtotal > 5000 ? 0 : 495),
        taxAmount: m(Math.round(subtotal * 0.08)),
        // Stripe-like: 2.9% + 30c.
        paymentFees: m(Math.round(subtotal * 0.029) + 30),
        marketplaceFees: m(0),
        isTest: false,
        customerId,
        isNewCustomer,
      })

      // ~4% refund rate, always tied to a real order.
      if (random() < 0.04) {
        refunds.push({
          id: `demo-refund-${orderId}`,
          orderId,
          createdAt: new Date(placedAt.getTime() + 3 * 86_400_000),
          amount: m(subtotal),
          returnCost: m(650),
        })
      }
    }

    // Two campaigns: one product-mapped, one brand campaign that must land in
    // the unallocated bucket so the allocation UI has something real to show.
    const dailyBudget = 4500 + Math.round(random() * 3000)
    const mapped = Math.round(dailyBudget * 0.62)

    spend.push({
      id: `demo-spend-mapped-${day}`,
      campaignId: 'demo-campaign-candle',
      productId: 'demo-candle',
      createdAt: dayStart,
      amount: m(mapped),
      attributedRevenue: m(Math.round(mapped * (1.6 + random() * 1.5))),
      newCustomers: Math.round(random() * 3),
    })

    spend.push({
      id: `demo-spend-brand-${day}`,
      campaignId: 'demo-campaign-brand',
      productId: null,
      createdAt: dayStart,
      amount: m(dailyBudget - mapped),
      attributedRevenue: m(Math.round((dailyBudget - mapped) * (0.8 + random() * 1.2))),
      newCustomers: Math.round(random() * 2),
    })
  }

  return {
    currency,
    products: DEMO_PRODUCTS,
    orders,
    refunds,
    spend,
    periodStart: new Date(startMs),
    periodEnd: endDate,
  }
}
