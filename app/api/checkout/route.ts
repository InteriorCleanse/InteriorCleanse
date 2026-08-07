import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { env, errorBody } from '@/lib/env'

export const runtime = 'nodejs'

type CartItem = {
  slug: string
  name: string
  price: number
  quantity: number
  heroImage?: string
  printfulVariantId?: string
  printifyVariantId?: string
}

export async function POST(req: Request) {
  try {
    // Validate the request before touching config, so a malformed cart is a
    // 400 about the cart rather than a 500 about a missing key.
    const { items } = (await req.json()) as { items: CartItem[] }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 })
    }

    // Prices come from the request, so they must be sanity-checked — a client
    // can post any number it likes. Anything non-positive or absurd is rejected
    // rather than charged. (A production store should look each price up from
    // the catalogue server-side; see VERCEL_ENV_SETUP.md.)
    for (const item of items) {
      if (!(item.price > 0) || item.price > 10000) {
        return NextResponse.json(
          { error: `Invalid price for ${item.name}.` },
          { status: 400 }
        )
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
        return NextResponse.json(
          { error: `Invalid quantity for ${item.name}.` },
          { status: 400 }
        )
      }
    }

    const stripe = new Stripe(env.stripeSecret())

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: items.map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            ...(item.heroImage?.startsWith('https://') ? { images: [item.heroImage] } : {}),
            metadata: {
              slug: item.slug,
              printfulVariantId: item.printfulVariantId ?? '',
              printifyVariantId: item.printifyVariantId ?? '',
            },
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      success_url: `${env.siteUrl()}/shop/success/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl()}/shop/`,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR'],
      },
      phone_number_collection: { enabled: true },
      // Requires Stripe Tax to be enabled on the account, and an origin
      // address set under Settings → Tax. Without that, Stripe rejects the
      // session — see VERCEL_ENV_SETUP.md.
      automatic_tax: { enabled: true },
    })

    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[checkout]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
