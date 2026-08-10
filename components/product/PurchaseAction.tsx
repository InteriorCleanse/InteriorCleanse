'use client'

import { AddToCartButton } from '@/components/cart'
import { trackOutbound } from '@/lib/analytics'
import { checkoutModeFor, purchaseLabel } from '@/lib/category-experience'
import type { Product } from '@/lib/types'

/**
 * The single purchase control for a product.
 *
 * Its whole job is that the customer always knows where the money changes
 * hands. An Amazon or TikTok item gets an outbound link and says so; only an
 * internally-fulfilled item gets an add-to-cart. Nothing here decides that on
 * its own — it reads `checkoutMode` from the product data.
 */
export function PurchaseAction({ product }: { product: Product }) {
  const mode = checkoutModeFor(product)
  const label = purchaseLabel(product)

  if (product.comingSoon) {
    return (
      <AddToCartButton
        item={{ slug: product.slug, name: product.name, price: product.price }}
        disabled
      />
    )
  }

  if (mode === 'external_amazon' || mode === 'external_tiktok') {
    const destination = mode === 'external_amazon' ? 'amazon' : 'tiktok'
    const href =
      product.externalPurchaseUrl ??
      (destination === 'amazon'
        ? product.channels.amazonUrl
        : product.channels.tiktokShopUrl)

    // No URL means no honest CTA. Saying "buy" and going nowhere is worse than
    // saying the link is not ready.
    if (!href || href === 'TODO') {
      return (
        <button className="add-to-cart-btn" disabled>
          LINK COMING SOON <span>◇</span>
        </button>
      )
    }

    return (
      <>
        <a
          className="add-to-cart-btn"
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackOutbound(destination, product.slug)}
        >
          {label.toUpperCase()}
        </a>
        <p className="purchase-note">
          {destination === 'amazon'
            ? 'You will complete this purchase on Amazon. Price, availability, and delivery are set by Amazon.'
            : 'You will complete this purchase on TikTok Shop. Price and availability are set there.'}
        </p>
      </>
    )
  }

  if (mode === 'inquiry_or_consultation') {
    return (
      <a className="add-to-cart-btn" href="/contact/">
        {label.toUpperCase()}
      </a>
    )
  }

  return (
    <AddToCartButton
      item={{
        slug: product.slug,
        name: product.name,
        price: product.price,
        heroImage: product.heroImage,
        printfulVariantId: product.channels.printfulId,
        printifyVariantId: product.channels.printifyId,
      }}
    />
  )
}
