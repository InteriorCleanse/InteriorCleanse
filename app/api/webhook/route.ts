import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { env, configured } from '@/lib/env'
import { upsertContact } from '@/lib/brevo'
import { sendAiEmail } from '@/lib/ai-email'

/**
 * Stripe webhook — the automation core.
 *
 * On `checkout.session.completed`: place the Printful order, sync the customer
 * into Brevo, and send the Claude-authored post-purchase email.
 *
 * Runs on the Node runtime and reads the body with `req.text()` because
 * signature verification hashes the exact bytes Stripe sent — any framework
 * that parses and re-serializes the JSON changes those bytes and every
 * signature check fails.
 */
export const runtime = 'nodejs'

async function createPrintfulOrder(session: any, items: { id: string; quantity: number }[]) {
  const shipping = session.shipping_details ?? session.collected_information?.shipping_details
  const address = shipping?.address
  if (!address) throw new Error('No shipping address on the session.')

  const res = await fetch('https://api.printful.com/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.printfulKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: {
        name: shipping?.name ?? session.customer_details?.name ?? '',
        address1: address.line1,
        address2: address.line2 || '',
        city: address.city,
        state_code: address.state,
        country_code: address.country,
        zip: address.postal_code,
        email: session.customer_details?.email ?? '',
        phone: session.customer_details?.phone || '',
      },
      items: items.map((i) => ({
        sync_variant_id: parseInt(i.id, 10),
        quantity: i.quantity,
      })),
      confirm: true,
    }),
  })

  if (!res.ok) {
    throw new Error(`Printful order failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

export async function POST(req: Request) {
  const stripe = new Stripe(env.stripeSecret())
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature.' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const body = await req.text()
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      env.stripeWebhookSecret()
    )
  } catch (e) {
    // A bad signature is the caller's problem — 400 so Stripe stops retrying.
    console.error('[webhook] signature verification failed', e)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as any

  // Each downstream step is isolated: a Printful outage must not stop the
  // customer reaching the CRM, and a failed email must not make Stripe retry a
  // webhook whose order already shipped. Failures are logged and reported.
  const failures: string[] = []

  let lineItems: Stripe.ApiList<Stripe.LineItem> | null = null
  try {
    lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ['data.price.product'],
      limit: 100,
    })
  } catch (e) {
    console.error('[webhook] listLineItems', e)
    failures.push('line-items')
  }

  const productNames =
    lineItems?.data.map((li) => (li.price?.product as Stripe.Product)?.name ?? '') ?? []

  // 1. Printful fulfilment.
  // Checkout writes the variant list into session metadata; that is the
  // authoritative source. Expanded line items are the fallback for sessions
  // whose metadata was dropped for exceeding Stripe's 500-char value limit.
  if (configured.printful()) {
    let printfulItems: { id: string; quantity: number }[] = []

    const raw = session.metadata?.printfulItems
    if (raw) {
      try {
        printfulItems = (JSON.parse(raw) as { variantId: string; qty: number }[])
          .filter((i) => i?.variantId)
          .map((i) => ({ id: String(i.variantId), quantity: Number(i.qty) || 1 }))
      } catch (e) {
        console.error('[webhook] could not parse printfulItems metadata', e)
      }
    }

    if (printfulItems.length === 0 && lineItems) {
      printfulItems = lineItems.data
        .map((li) => ({
          id: ((li.price?.product as Stripe.Product)?.metadata?.printfulVariantId ?? '').trim(),
          quantity: li.quantity ?? 1,
        }))
        .filter((i) => i.id)
    }

    if (printfulItems.length > 0) {
      try {
        await createPrintfulOrder(session, printfulItems)
      } catch (e) {
        console.error('[webhook] printful', e)
        failures.push('printful')
      }
    }
  }

  // 2. Brevo CRM
  if (configured.brevo() && session.customer_details?.email) {
    const name: string = session.customer_details.name ?? ''
    try {
      await upsertContact({
        email: session.customer_details.email,
        attributes: {
          FIRSTNAME: name.split(' ')[0] || '',
          LASTNAME: name.split(' ').slice(1).join(' ') || '',
          LAST_ORDER_DATE: new Date().toISOString(),
          LAST_ORDER_AMOUNT: (session.amount_total ?? 0) / 100,
        },
        listIds: [env.brevoCustomerList()],
      })
      } catch (e) {
      console.error('[webhook] brevo', e)
      failures.push('brevo')
    }
  }

  // 3. Claude post-purchase email
  if (configured.anthropic() && configured.brevo() && session.customer_details?.email) {
    try {
      await sendAiEmail({
        to: session.customer_details.email,
        firstName: (session.customer_details.name ?? '').split(' ')[0] || 'there',
        trigger: 'post-purchase',
        products: productNames.filter(Boolean),
        orderTotal: (session.amount_total ?? 0) / 100,
      })
    } catch (e) {
      console.error('[webhook] ai-email', e)
      failures.push('ai-email')
    }
  }

  // Always 200: the payment succeeded, and a non-2xx makes Stripe redeliver,
  // which would re-run the Printful order that already went through.
  return NextResponse.json({ received: true, failures })
}
