import { requestJson } from './http'
import {
  SyncError,
  type AdapterContext,
  type NormalisedOrder,
  type NormalisedRefund,
  type SyncAdapter,
  type SyncPage,
} from './types'

/**
 * The Stripe connector.
 *
 * What this reads and what it deliberately does not:
 *
 * **Charges, not payment intents.** A charge is money that actually moved. A
 * payment intent includes attempts that never settled, and counting those as
 * revenue is the single most common way a payments dashboard overstates a
 * business.
 *
 * **Fees come from the balance transaction, expanded inline.** `charge.amount`
 * is what the customer paid; the processing fee is on the balance transaction.
 * Without expanding it we would either make a second request per charge, or
 * report gross as though it were net. Reporting gross as net understates cost
 * on every single order, which compounds into a margin figure that is wrong all
 * the way down.
 *
 * **A charge is one line item, and it is honest about that.** Stripe does not
 * know what was sold — there is no product breakdown to be had here. The line
 * item is named for the charge, and `docs/INTEGRATIONS.md` says plainly that
 * per-product revenue needs a storefront connector. Inventing a product split
 * from a payment record would be fabrication.
 *
 * **Test-mode charges are ingested and flagged, not dropped.** Dropping them
 * makes a test order vanish with no explanation; `is_test` keeps the record
 * faithful and lets every query exclude it.
 */

const API = 'https://api.stripe.com/v1'
/** Stripe's maximum. Fewer pages means fewer round trips inside the budget. */
const PAGE_SIZE = 100

type StripeList<T> = { object: 'list'; data: T[]; has_more: boolean }

type StripeBalanceTransaction = {
  fee?: number
  currency?: string
}

type StripeCharge = {
  id: string
  amount: number
  amount_refunded?: number
  created: number
  currency: string
  livemode: boolean
  paid: boolean
  status: string
  description?: string | null
  receipt_number?: string | null
  balance_transaction?: string | StripeBalanceTransaction | null
  billing_details?: { email?: string | null; name?: string | null } | null
  customer?: string | { id: string; email?: string | null } | null
  metadata?: Record<string, string>
}

type StripeRefund = {
  id: string
  amount: number
  currency: string
  created: number
  charge: string | { id: string }
  status: string
}

export const stripeAdapter: SyncAdapter = {
  provider: 'stripe',

  async fetchPage(context: AdapterContext, cursor: string | null): Promise<SyncPage> {
    const key = context.credentials.api_key?.trim()
    if (!key) {
      throw new SyncError(
        'No Stripe secret key is stored for this connection. Reconnect the integration.',
        'misconfigured',
        false,
      )
    }

    // One cursor covers both lists: charges first, then refunds. Encoded rather
    // than run in parallel so a page is a bounded amount of work and the
    // runner's budget means something.
    const state = decodeCursor(cursor)

    if (state.phase === 'charges') {
      const list = await get<StripeList<StripeCharge>>(
        `${API}/charges?${params({
          limit: PAGE_SIZE,
          'created[gte]': unix(context.window.start),
          'created[lt]': unix(context.window.end),
          'expand[]': 'data.balance_transaction',
          ...(state.startingAfter ? { starting_after: state.startingAfter } : {}),
        })}`,
        key,
        context,
      )

      const orders = list.data.filter(isSettled).map(toOrder)
      const last = list.data[list.data.length - 1]

      return {
        orders,
        refunds: [],
        cursor:
          list.has_more && last
            ? encodeCursor({ phase: 'charges', startingAfter: last.id })
            : encodeCursor({ phase: 'refunds', startingAfter: null }),
      }
    }

    const list = await get<StripeList<StripeRefund>>(
      `${API}/refunds?${params({
        limit: PAGE_SIZE,
        'created[gte]': unix(context.window.start),
        'created[lt]': unix(context.window.end),
        ...(state.startingAfter ? { starting_after: state.startingAfter } : {}),
      })}`,
      key,
      context,
    )

    const refunds = list.data.filter((r) => r.status === 'succeeded').map(toRefund)
    const last = list.data[list.data.length - 1]

    return {
      orders: [],
      refunds,
      cursor:
        list.has_more && last ? encodeCursor({ phase: 'refunds', startingAfter: last.id }) : null,
    }
  },
}

async function get<T>(url: string, key: string, context: AdapterContext): Promise<T> {
  const { body } = await requestJson<T>(
    url,
    {
      headers: {
        // Basic auth with the key as the username is Stripe's documented form.
        authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
        'stripe-version': '2024-06-20',
      },
    },
    { fetch: context.fetch, sleep: context.sleep },
  )
  return body
}

/**
 * Money that actually moved.
 *
 * `paid` alone is not enough: a charge can be `paid` and then `failed` on a
 * later async confirmation for some payment methods.
 */
function isSettled(charge: StripeCharge): boolean {
  return charge.paid && charge.status === 'succeeded'
}

function toOrder(charge: StripeCharge): NormalisedOrder {
  const currency = charge.currency.toUpperCase()
  const fee = feeMinor(charge)
  const customer = customerOf(charge)

  return {
    externalId: charge.id,
    orderNumber: charge.receipt_number ?? null,
    currency,
    placedAt: new Date(charge.created * 1_000),
    // Stripe has no concept of either. Zero would be a claim we cannot support;
    // these two are genuinely zero *as far as Stripe is concerned*, and the
    // connector's `doesNotProvide` says so on the integrations page.
    shippingRevenueMinor: 0,
    taxMinor: 0,
    paymentFeesMinor: fee,
    marketplaceFeesMinor: null,
    isTest: !charge.livemode,
    customer,
    items: [
      {
        productExternalId: null,
        variantExternalId: null,
        sku: null,
        // Named for what it is. Stripe cannot tell us what was sold, and a
        // fabricated product name would end up on a per-product margin report.
        name: charge.description?.trim() || 'Stripe payment',
        quantity: 1,
        grossMinor: charge.amount,
        discountMinor: 0,
      },
    ],
  }
}

/**
 * The processing fee, or null when it is genuinely unknown.
 *
 * Null rather than zero: a missing balance transaction means we do not know the
 * fee, and recording zero would quietly inflate margin on that order.
 */
function feeMinor(charge: StripeCharge): number | null {
  const bt = charge.balance_transaction
  if (!bt || typeof bt === 'string') return null
  return typeof bt.fee === 'number' ? bt.fee : null
}

function customerOf(charge: StripeCharge): NormalisedOrder['customer'] {
  const email = charge.billing_details?.email ?? null
  const id =
    typeof charge.customer === 'string' ? charge.customer : (charge.customer?.id ?? null)
  if (!id && !email) return null

  const name = charge.billing_details?.name?.trim() ?? ''
  const [first = null, ...rest] = name ? name.split(/\s+/) : []

  return {
    // Falling back to the email keeps guest checkouts from collapsing into one
    // anonymous customer, which would wreck any repeat-purchase figure.
    externalId: id ?? `email:${email}`,
    email:
      email ?? (typeof charge.customer === 'object' ? (charge.customer?.email ?? null) : null),
    firstName: first,
    lastName: rest.length > 0 ? rest.join(' ') : null,
  }
}

function toRefund(refund: StripeRefund): NormalisedRefund {
  return {
    externalId: refund.id,
    orderExternalId: typeof refund.charge === 'string' ? refund.charge : refund.charge.id,
    amountMinor: refund.amount,
    currency: refund.currency.toUpperCase(),
    refundedAt: new Date(refund.created * 1_000),
  }
}

type Cursor = { phase: 'charges' | 'refunds'; startingAfter: string | null }

function encodeCursor(cursor: Cursor): string {
  return `${cursor.phase}:${cursor.startingAfter ?? ''}`
}

function decodeCursor(raw: string | null): Cursor {
  if (!raw) return { phase: 'charges', startingAfter: null }
  const [phase, id] = raw.split(':')
  return {
    phase: phase === 'refunds' ? 'refunds' : 'charges',
    startingAfter: id ? id : null,
  }
}

function params(values: Record<string, string | number>): string {
  return Object.entries(values)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

function unix(date: Date): number {
  return Math.floor(date.getTime() / 1_000)
}
