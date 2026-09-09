import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { readCatalog, writeCatalog } from '@/lib/catalog-store'
import { env, errorBody } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Creates (or updates) the Stripe Product and Price for a catalog record.
 *
 * Body: `{ id, price? }`. `price` overrides the catalog price and is written
 * back to it, so the number Stripe charges and the number the page shows come
 * from the same request.
 *
 * Idempotent in the way that matters for money: the Stripe Product is looked
 * up by `metadata.ic_slug` and reused; a new Price is created only when the
 * amount differs from the current one, and the previous Price is deactivated
 * so it cannot be used by a stale session. Stripe Prices are immutable, which
 * is why "update" means "replace and retire", not "edit".
 */
export async function POST(req: Request) {
  try {
    const { id, price: override } = (await req.json()) as { id: string; price?: number }
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const all = await readCatalog()
    const product = all.find((p) => p.id === id)
    if (!product) return NextResponse.json({ error: `No product with id "${id}".` }, { status: 404 })
    if (product.purchaseType !== 'stripe') {
      return NextResponse.json({ error: 'Only Stripe-sold products get a Stripe Price.' }, { status: 400 })
    }

    const amount = override !== undefined ? Number(override) : product.price
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Set a price greater than 0 first.' }, { status: 400 })
    }
    const unitAmount = Math.round(amount * 100)

    const stripe = new Stripe(env.stripeSecret())

    // 1. Find or create the Product, keyed by slug in metadata.
    const found = await stripe.products.search({ query: `metadata['ic_slug']:'${product.slug}'`, limit: 1 })
    let stripeProduct = found.data[0]
    const productParams = {
      name: product.name,
      description: product.description || undefined,
      images: product.images.hero && /^https?:\/\//.test(product.images.hero) ? [product.images.hero] : undefined,
      metadata: {
        ic_slug: product.slug,
        ...(product.printfulVariantId ? { printfulVariantId: product.printfulVariantId } : {}),
        ...(product.printifyVariantId ? { printifyVariantId: product.printifyVariantId } : {}),
      },
    }
    if (stripeProduct) {
      stripeProduct = await stripe.products.update(stripeProduct.id, productParams)
    } else {
      stripeProduct = await stripe.products.create(productParams)
    }

    // 2. Reuse the current Price if the amount matches; otherwise replace it.
    let priceId = product.stripePriceId
    let action: 'unchanged' | 'created' | 'replaced' = 'unchanged'
    let current: Stripe.Price | null = null
    if (priceId) {
      try {
        current = await stripe.prices.retrieve(priceId)
      } catch {
        current = null
      }
    }
    if (!current || !current.active || current.unit_amount !== unitAmount || current.product !== stripeProduct.id) {
      const created = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: unitAmount,
        currency: 'usd',
        metadata: { ic_slug: product.slug },
      })
      await stripe.products.update(stripeProduct.id, { default_price: created.id })
      if (current && current.active && current.product === stripeProduct.id) {
        await stripe.prices.update(current.id, { active: false })
        action = 'replaced'
      } else {
        action = 'created'
      }
      priceId = created.id
    }

    product.stripePriceId = priceId
    product.price = amount
    if (product.status === 'needs-pricing') product.status = 'needs-assets'
    product.updatedAt = new Date().toISOString()
    const commit = await writeCatalog(all, `catalog: stripe price for ${product.slug}`)

    return NextResponse.json({
      action,
      stripeProductId: stripeProduct.id,
      stripePriceId: priceId,
      amount,
      mode: env.stripeSecret().startsWith('sk_live_') ? 'live' : 'test',
      product,
      commit,
    })
  } catch (e) {
    console.error('[admin/create-price]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
