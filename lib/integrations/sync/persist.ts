import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalisedOrder, SyncPage, SyncSink } from './types'

/**
 * Writing a synced page into the commerce tables.
 *
 * The rules that make a re-run safe, which matters because windows overlap by
 * design and a partial run is retried from where it stopped:
 *
 * **Every write is an upsert on `(organization_id, source, external_id)`.** The
 * vendor's own id is the identity. Nothing here generates a key that would
 * differ between runs.
 *
 * **`organization_id` comes from the connection, never from the payload.** It
 * is bound once when the sink is constructed. A vendor response cannot steer
 * where its data lands, which is the only thing standing between a compromised
 * or confused connector and a cross-tenant write.
 *
 * **Line items are replaced, not appended.** An order that was edited upstream
 * comes back with different lines; appending would double its revenue on every
 * sync. Deleting and reinserting the lines for that order is the only version
 * that converges.
 *
 * **A refund whose order we have not seen is skipped, not orphaned.** It is
 * counted as read but not written, and the next run picks it up once the order
 * arrives — refunds and orders can land in either order across a window edge.
 */

export type PersistCounts = { written: number; skippedRefunds: number }

export function supabaseSink(
  db: SupabaseClient,
  organizationId: string,
  source: string,
): SyncSink & { counts: PersistCounts } {
  const counts: PersistCounts = { written: 0, skippedRefunds: 0 }

  return {
    counts,
    async write(page: SyncPage) {
      let written = 0

      for (const order of page.orders) {
        await upsertOrder(db, organizationId, source, order)
        written += 1
      }

      for (const refund of page.refunds) {
        const orderId = await findOrderId(db, organizationId, source, refund.orderExternalId)
        if (!orderId) {
          counts.skippedRefunds += 1
          continue
        }

        const { error } = await db.from('refunds').upsert(
          {
            organization_id: organizationId,
            order_id: orderId,
            source,
            external_id: refund.externalId,
            amount_minor: refund.amountMinor,
            currency: refund.currency,
            refunded_at: refund.refundedAt.toISOString(),
          },
          { onConflict: 'organization_id,source,external_id' },
        )
        if (error) throw new Error(error.message)
        written += 1
      }

      counts.written += written
      return { written }
    },
  }
}

async function upsertOrder(
  db: SupabaseClient,
  organizationId: string,
  source: string,
  order: NormalisedOrder,
): Promise<void> {
  const customerId = order.customer
    ? await upsertCustomer(db, organizationId, source, order)
    : null

  const { data, error } = await db
    .from('orders')
    .upsert(
      {
        organization_id: organizationId,
        source,
        external_id: order.externalId,
        order_number: order.orderNumber,
        currency: order.currency,
        placed_at: order.placedAt.toISOString(),
        shipping_revenue_minor: order.shippingRevenueMinor,
        tax_minor: order.taxMinor,
        // A null fee means "not known", and the column cannot hold that.
        // Zero is the schema's default and is what an unknown fee becomes;
        // the metrics layer reads fees as a cost, so this understates cost
        // rather than inventing one. Stated in docs/INTEGRATIONS.md.
        payment_fees_minor: order.paymentFeesMinor ?? 0,
        marketplace_fees_minor: order.marketplaceFeesMinor ?? 0,
        is_test: order.isTest,
        customer_id: customerId,
      },
      { onConflict: 'organization_id,source,external_id' },
    )
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'The order could not be saved.')

  // Replace the lines wholesale: an upstream edit changes which lines exist,
  // and there is no stable per-line identity across every vendor.
  const { error: clearError } = await db.from('order_items').delete().eq('order_id', data.id)
  if (clearError) throw new Error(clearError.message)

  if (order.items.length === 0) return

  const { error: itemsError } = await db.from('order_items').insert(
    order.items.map((item) => ({
      organization_id: organizationId,
      order_id: data.id,
      product_name: item.name,
      quantity: item.quantity,
      gross_minor: item.grossMinor,
      discount_minor: item.discountMinor,
      currency: order.currency,
    })),
  )
  if (itemsError) throw new Error(itemsError.message)
}

async function upsertCustomer(
  db: SupabaseClient,
  organizationId: string,
  source: string,
  order: NormalisedOrder,
): Promise<string | null> {
  const customer = order.customer
  if (!customer) return null

  const { data, error } = await db
    .from('customers')
    .upsert(
      {
        organization_id: organizationId,
        source,
        external_id: customer.externalId,
        email: customer.email,
        first_name: customer.firstName,
        last_name: customer.lastName,
      },
      { onConflict: 'organization_id,source,external_id' },
    )
    .select('id')
    .single()

  // A customer we cannot save must not fail the order. Attribution is worth
  // less than the money.
  if (error || !data) return null
  return data.id
}

async function findOrderId(
  db: SupabaseClient,
  organizationId: string,
  source: string,
  externalId: string,
): Promise<string | null> {
  const { data } = await db
    .from('orders')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('source', source)
    .eq('external_id', externalId)
    .maybeSingle()

  return data?.id ?? null
}
