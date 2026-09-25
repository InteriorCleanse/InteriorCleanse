/**
 * Recorded vendor responses.
 *
 * Trimmed from the shapes Stripe and Shopify actually return — the fields the
 * adapters read, plus a few they must ignore. Hand-written fixtures that match
 * what the adapter expects prove nothing; these keep the vendor's own
 * conventions, including the ones that cause bugs: Stripe's integer minor units
 * and epoch seconds, Shopify's decimal strings and ISO timestamps, per-unit
 * line prices, and refunds nested inside the order.
 *
 * No real ids, no real keys, no real customers.
 */

export const stripeChargesPage1 = {
  object: 'list' as const,
  has_more: true,
  data: [
    {
      id: 'ch_3AAAAAAAAAAAAAAA',
      object: 'charge',
      amount: 4999,
      amount_refunded: 0,
      created: 1_735_689_600, // 2025-01-01T00:00:00Z
      currency: 'usd',
      livemode: true,
      paid: true,
      status: 'succeeded',
      description: 'Order #1042',
      receipt_number: '1042',
      balance_transaction: { object: 'balance_transaction', fee: 175, currency: 'usd' },
      billing_details: { email: 'buyer@example.com', name: 'Ada Lovelace' },
      customer: 'cus_AAAAAAAAAAAA',
    },
    {
      // Failed: must not be counted as revenue.
      id: 'ch_3BBBBBBBBBBBBBBB',
      object: 'charge',
      amount: 2500,
      created: 1_735_693_200,
      currency: 'usd',
      livemode: true,
      paid: false,
      status: 'failed',
      balance_transaction: null,
      billing_details: { email: 'nope@example.com', name: null },
      customer: null,
    },
    {
      // Test mode: ingested and flagged, not dropped.
      id: 'ch_3CCCCCCCCCCCCCCC',
      object: 'charge',
      amount: 100,
      created: 1_735_696_800,
      currency: 'usd',
      livemode: false,
      paid: true,
      status: 'succeeded',
      description: null,
      balance_transaction: { object: 'balance_transaction', fee: 33 },
      billing_details: { email: null, name: null },
      customer: null,
    },
    {
      // Unexpanded balance transaction: the fee is genuinely unknown.
      id: 'ch_3DDDDDDDDDDDDDDD',
      object: 'charge',
      amount: 12_000,
      created: 1_735_700_400,
      currency: 'eur',
      livemode: true,
      paid: true,
      status: 'succeeded',
      description: 'Wholesale',
      balance_transaction: 'txn_AAAAAAAAAAAA',
      billing_details: { email: 'guest@example.com', name: 'Grace Hopper' },
      customer: null,
    },
  ],
}

export const stripeChargesPage2 = {
  object: 'list' as const,
  has_more: false,
  data: [
    {
      id: 'ch_3EEEEEEEEEEEEEEE',
      object: 'charge',
      amount: 899,
      created: 1_735_704_000,
      currency: 'usd',
      livemode: true,
      paid: true,
      status: 'succeeded',
      description: 'Order #1043',
      balance_transaction: { object: 'balance_transaction', fee: 56 },
      billing_details: { email: 'buyer@example.com', name: 'Ada Lovelace' },
      customer: 'cus_AAAAAAAAAAAA',
    },
  ],
}

export const stripeRefunds = {
  object: 'list' as const,
  has_more: false,
  data: [
    {
      id: 're_3AAAAAAAAAAAAAAA',
      object: 'refund',
      amount: 1000,
      currency: 'usd',
      created: 1_735_776_000,
      charge: 'ch_3AAAAAAAAAAAAAAA',
      status: 'succeeded',
    },
    {
      // Pending: not money that has moved.
      id: 're_3BBBBBBBBBBBBBBB',
      object: 'refund',
      amount: 500,
      currency: 'usd',
      created: 1_735_779_600,
      charge: 'ch_3EEEEEEEEEEEEEEE',
      status: 'pending',
    },
  ],
}

export const shopifyOrders = {
  orders: [
    {
      id: 5_001,
      name: '#1001',
      created_at: '2025-01-04T10:15:00-05:00',
      updated_at: '2025-01-06T09:00:00-05:00',
      currency: 'USD',
      test: false,
      cancelled_at: null,
      total_tax: '3.20',
      total_shipping_price_set: { shop_money: { amount: '4.95', currency_code: 'USD' } },
      customer: {
        id: 9_001,
        email: 'shopper@example.com',
        first_name: 'Katherine',
        last_name: 'Johnson',
      },
      line_items: [
        {
          id: 7_001,
          product_id: 3_001,
          variant_id: 4_001,
          sku: 'MUG-BLUE',
          title: 'Enamel mug — blue',
          quantity: 2,
          price: '19.99',
          total_discount: '2.00',
        },
        {
          id: 7_002,
          product_id: 3_002,
          variant_id: 4_002,
          sku: null,
          title: 'Gift wrap',
          quantity: 1,
          price: '0.99',
          total_discount: '0.00',
        },
      ],
      refunds: [
        {
          id: 8_001,
          created_at: '2025-01-07T11:00:00-05:00',
          transactions: [
            { id: 1, amount: '19.99', kind: 'refund', status: 'success' },
            { id: 2, amount: '5.00', kind: 'refund', status: 'failure' },
          ],
        },
      ],
    },
    {
      // Cancelled: excluded entirely rather than ingested and netted off.
      id: 5_002,
      name: '#1002',
      created_at: '2025-01-05T12:00:00-05:00',
      currency: 'USD',
      test: false,
      cancelled_at: '2025-01-05T12:30:00-05:00',
      total_tax: '0.00',
      line_items: [
        { id: 7_003, product_id: 3_001, variant_id: 4_001, title: 'Enamel mug', quantity: 1, price: '19.99' },
      ],
    },
    {
      id: 5_003,
      name: '#1003',
      created_at: '2025-01-06T08:00:00-05:00',
      currency: 'USD',
      test: true,
      cancelled_at: null,
      total_tax: '0.00',
      customer: null,
      line_items: [
        { id: 7_004, product_id: null, variant_id: null, title: 'Test item', quantity: 1, price: '1.00' },
      ],
      refunds: [],
    },
  ],
}
