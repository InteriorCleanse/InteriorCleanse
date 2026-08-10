import type { Product } from '@/lib/types'

/**
 * The non-interactive view of a product, rendered alongside every 3D stage.
 *
 * This exists so nothing about the product is available *only* inside a canvas:
 * a screen reader, a crawler, a browser without WebGL, and a visitor who has
 * turned motion off all get the same images and the same description. It is
 * plain server-rendered HTML — no JavaScript, no canvas, no dependency on the
 * viewer having loaded.
 */
export function StaticGallery({ product }: { product: Product }) {
  const images = [product.posterUrl, product.heroImage, ...(product.gallery ?? [])].filter(
    (src): src is string => Boolean(src)
  )

  // De-duplicated: posterUrl and heroImage are frequently the same file.
  const unique = Array.from(new Set(images))
  if (unique.length === 0) return null

  return (
    <section className="static-gallery" aria-label={`${product.name} — product images`}>
      <h2 className="static-gallery-title">Product images</h2>
      <ul className="static-gallery-list">
        {unique.map((src, i) => (
          <li key={src}>
            <img
              src={src}
              alt={
                i === 0
                  ? `${product.name} — ${product.tagline}`
                  : `${product.name}, view ${i + 1}`
              }
              loading="lazy"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
