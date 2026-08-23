import { fromDecimalString } from '@/lib/money'
import { requestJson } from './http'
import {
  SyncError,
  type AdapterContext,
  type NormalisedLineItem,
  type NormalisedOrder,
  type NormalisedRefund,
  type SyncAdapter,
  type SyncPage,
} from './types'

/**
 * The Shopify connector.
 *
 * Where this differs from Stripe, and why it matters:
 *
 * **Money arrives as decimal strings.** `"19.99"`. Every one of them goes
 * through `fromDecimalString`, which converts to integer minor units without
 * touching a float. `parseFloat("19.99") * 100` is `1998.9999999999998`, and
 * rounding that at the wrong moment is how a penny-per-order drift gets into a
 * yearly total.
 *
 * **`updated_at`, not `created_at`.** An order edited after the fact — a
 * partial refund, an address correction, a cancelled line — has to come back
 * through. Syncing on creation time freezes the version of the order we first
 * saw, and refunds would never arrive.
 *
 * **Pagination is a `Link` header, not a page number.** Shopify's cursor
 * pagination invalidates offsets while a sync is running. The header is opaque
 * and is passed straight back.
 *
 * **Refunds ride on the order.** They are nested in the order payload rather
 * than a separate endpoint, which is why one page here yields both.
 */

const API_VERSION = '2024-10'
const PAGE_SIZE = 100

type ShopifyMoney = string

type ShopifyLineItem = {
  id: number
  product_id?: number | null
  variant_id?: number | null
  sku?: string | null
  title: string
  quantity: number
  price: ShopifyMoney
  total_discount?: ShopifyMoney
}

type ShopifyRefund = {
  id: number
  created_at: string
  transactions?: { amount: ShopifyMoney; kind: string; status: string }[]
}

type ShopifyOrder = {
  id: number
  name?: string | null
  created_at: string
  currency: string
  test: boolean
  cancelled_at?: string | null
  total_tax?: ShopifyMoney
  total_shipping_price_set?: { shop_money?: { amount?: ShopifyMoney } }
  customer?: {
    id: number
    email?: string | null
    first_name?: string | null
    last_name?: string | null
  } | null
  line_items?: ShopifyLineItem[]
  refunds?: ShopifyRefund[]
}

export const shopifyAdapter: SyncAdapter = {
  provider: 'shopify',

  async fetchPage(context: AdapterContext, cursor: string | null): Promise<SyncPage> {
    const token = context.credentials.access_token?.trim()
    if (!token) {
      throw new SyncError(
        'No Shopify access token is stored for this connection. Reconnect the integration.',
        'misconfigured',
        false,
      )
    }

    const shopDomain = String(context.settings.shopDomain ?? '').trim()
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)) {
      // Validated at connect time too, but a settings row can be edited later
      // and an unvalidated host here would be a request-forgery hole.
      throw new SyncError(
        'The shop domain on this connection is not a valid myshopify.com address.',
        'misconfigured',
        false,
      )
    }

    const url =
      cursor ??
      `https://${shopDomain}/admin/api/${API_VERSION}/orders.json?` +
        new URLSearchParams({
          status: 'any',
          limit: String(PAGE_SIZE),
          updated_at_min: context.window.start.toISOString(),
          updated_at_max: context.window.end.toISOString(),
        }).toString()

    const { body, headers } = await requestJson<{ orders: ShopifyOrder[] }>(
      url,
      { headers: { 'x-shopify-access-token': token, accept: 'application/json' } },
      { fetch: context.fetch, sleep: context.sleep },
    )

    const orders: NormalisedOrder[] = []
    const refunds: NormalisedRefund[] = []

    for (const order of body.orders ?? []) {
      // A cancelled order is not revenue. It stays out rather than being
      // ingested and subtracted later, which would double-count against a
      // refund if the cancellation was also refunded.
      if (order.cancelled_at) continue
      orders.push(toOrder(order))
      refunds.push(...refundsOf(order))
    }

    return { orders, refunds, cursor: nextLink(headers.get('link')) }
  },
}

function toOrder(order: ShopifyOrder): NormalisedOrder {
  const currency = order.currency.toUpperCase()
  const minor = (value: ShopifyMoney | undefined) =>
    value ? fromDecimalString(value, currency).minor : 0

  return {
    externalId: String(order.id),
    orderNumber: order.name ?? null,
    currency,
    placedAt: new Date(order.created_at),
    shippingRevenueMinor: minor(order.total_shipping_price_set?.shop_money?.amount),
    taxMinor: minor(order.total_tax),
    // Shopify does not report what the payment processor kept unless Shopify
    // Payments is in use, and even then not on the order. Null, not zero.
    paymentFeesMinor: null,
    marketplaceFeesMinor: null,
    isTest: order.test,
    customer: order.customer
      ? {
          externalId: String(order.customer.id),
          email: order.customer.email ?? null,
          firstName: order.customer.first_name ?? null,
          lastName: order.customer.last_name ?? null,
        }
      : null,
    items: (order.line_items ?? []).map((item): NormalisedLineItem => {
      // `price` is per unit; the stored figure is the line total.
      const unit = fromDecimalString(item.price, currency).minor
      return {
        productExternalId: item.product_id != null ? String(item.product_id) : null,
        variantExternalId: item.variant_id != null ? String(item.variant_id) : null,
        sku: item.sku?.trim() || null,
        name: item.title,
        quantity: item.quantity,
        grossMinor: unit * item.quantity,
        discountMinor: minor(item.total_discount),
      }
    }),
  }
}

function refundsOf(order: ShopifyOrder): NormalisedRefund[] {
  const currency = order.currency.toUpperCase()

  return (order.refunds ?? []).flatMap((refund) => {
    // Sum only settled refund transactions. A refund object can exist with a
    // failed transaction attached, and counting it would credit money back to
    // a customer in our figures that never left the account.
    const total = (refund.transactions ?? [])
      .filter((t) => t.kind === 'refund' && t.status === 'success')
      .reduce((sum, t) => sum + fromDecimalString(t.amount, currency).minor, 0)

    if (total <= 0) return []

    return [
      {
        externalId: String(refund.id),
        orderExternalId: String(order.id),
        amountMinor: total,
        currency,
        refundedAt: new Date(refund.created_at),
      },
    ]
  })
}

/**
 * Extracts the `rel="next"` URL from a Link header.
 *
 * Returned verbatim and never rebuilt: the cursor inside it is opaque, and
 * reconstructing the URL is how pagination silently starts repeating page one.
 */
export function nextLink(header: string | null): string | null {
  if (!header) return null

  for (const part of header.split(',')) {
    const match = /^\s*<([^>]+)>\s*;\s*rel="?next"?/i.exec(part)
    if (match?.[1]) return match[1]
  }
  return null
}
