'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AddToCartButton } from '@/components/cart'
import { isInternalCheckout, purchaseLabel } from '@/lib/category-experience'
import { resolveRenderMode } from '@/lib/category-experience'
import type { Product } from '@/lib/types'

/**
 * Layer B — the featured product card over the scene.
 *
 * The 360° badge is shown only when the product genuinely has a rotatable
 * presentation. Putting it on a flat image would be a promise the card cannot
 * keep, which is exactly the kind of claim the render-mode data exists to stop.
 */
export function FeaturedCard({ product }: { product: Product }) {
  const [favorite, setFavorite] = useState(false)
  const rotatable = resolveRenderMode(product) !== 'depth_interactive'
  const internal = isInternalCheckout(product)

  return (
    <article className="featured-card">
      <div className="featured-card-media">
        {rotatable ? (
          <span className="featured-badge">
            <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
              <path
                d="M2.5 8a5.5 5.5 0 1 1 1.8 4.1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path d="M1.4 10.6 4.3 12.4 2.2 14.4Z" fill="currentColor" />
            </svg>
            360°
          </span>
        ) : null}

        <button
          type="button"
          className="featured-fav"
          aria-pressed={favorite}
          aria-label={favorite ? `Remove ${product.name} from favourites` : `Save ${product.name} to favourites`}
          onClick={() => setFavorite((f) => !f)}
        >
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
            <path
              d="M10 16.5 3.8 10.6a3.8 3.8 0 0 1 5.4-5.3l.8.8.8-.8a3.8 3.8 0 0 1 5.4 5.3Z"
              fill={favorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
        </button>

        <Link href={`/shop/${product.slug}/`}>
          <img src={product.heroImage} alt={product.name} loading="lazy" decoding="async" />
        </Link>
      </div>

      <h3 className="featured-card-name">
        <Link href={`/shop/${product.slug}/`}>{product.name}</Link>
      </h3>
      <p className="featured-card-price">${product.price}</p>

      {internal ? (
        <AddToCartButton
          disabled={product.comingSoon}
          item={{
            slug: product.slug,
            name: product.name,
            price: product.price,
            heroImage: product.heroImage,
          }}
        />
      ) : (
        <Link className="add-to-cart-btn" href={`/shop/${product.slug}/`}>
          {purchaseLabel(product).toUpperCase()}
        </Link>
      )}
    </article>
  )
}
