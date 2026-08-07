import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { env, errorBody } from '@/lib/env'
import { getProduct } from '@/lib/content'

export const runtime = 'nodejs'

type IncomingItem = {
  slug: string
  quantity: number
}

/** Stripe caps a metadata value at 500 characters. */
const METADATA_VALUE_LIMIT = 500

/**
 * Creates a Stripe Checkout Session from Stripe Price IDs.
 *
 * The request supplies **slugs and quantities only**. Everything that decides
 * what the customer is charged — the Price ID, and therefore the amount — is
 * resolved here from content/products.json. An earlier version accepted the
 * price from the browser and merely range-checked it, which still let a
 * crafted request buy a $42 print for $1. A client cannot influence the amount
 * now: it names a product, and the server decides what that product costs.
 *
 * Using Price IDs rather than inline `price_data` also lets Stripe own
 * currency, tax behaviour, and product metadata centrally.
 */
export async function POST(req: Request) {
  try {
    const { items } = (await req.json()) as { items: IncomingItem[] }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 })
    }
    if (items.length > 50) {
      return NextResponse.json({ error: 'Too many line items.' }, { status: 400 })
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    const printfulItems: { variantId: string; qty: number }[] = []

    for (const item of items) {
      const quantity = Number(item.quantity)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        return NextResponse.json(
          { error: `Invalid quantity for ${item.slug}.` },
          { status: 400 }
        )
      }

      const product = getProduct(String(item.slug))
      if (!product) {
        return NextResponse.json({ error: `Unknown product: ${item.slug}.` }, { status: 400 })
      }
      if (product.comingSoon) {
        return NextResponse.json(
          { error: `${product.name} is not available yet.` },
          { status: 400 }
        )
      }

      const priceId = product.channels.stripePriceId
      if (!priceId) {
        // Refuse rather than fall back to a client-supplied amount.
        return NextResponse.json(
          {
            error: `${product.name} has no Stripe price yet. Run \`npm run stripe:setup\` to create it.`,
          },
          { status: 409 }
        )
      }

      lineItems.push({ price: priceId, quantity })

      if (product.channels.printfulId && product.channels.printfulId !== 'TODO') {
        printfulItems.push({ variantId: product.channels.printfulId, qty: quantity })
      }
    }

    // Carried on the session so the webhook can place the Printful order
    // without re-deriving it from expanded line items.
    const printfulMetadata = JSON.stringify(printfulItems)
    const metadata: Record<string, string> =
      printfulMetadata.length <= METADATA_VALUE_LIMIT
        ? { printfulItems: printfulMetadata }
        : {}

    if (!metadata.printfulItems && printfulItems.length > 0) {
      // The webhook falls back to reading line items, so this is recoverable —
      // but it should be visible in the logs when it happens.
      console.warn('[checkout] printfulItems exceeded metadata limit; webhook will use line items')
    }

    const stripe = new Stripe(env.stripeSecret())

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${env.siteUrl()}/shop/success/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl()}/shop/`,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR'],
      },
      phone_number_collection: { enabled: true },
      // Requires Stripe Tax to be enabled with an origin address set;
      // otherwise Stripe rejects the session. See VERCEL_ENV_SETUP.md.
      automatic_tax: { enabled: true },
      metadata,
    })

    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[checkout]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
