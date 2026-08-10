import Link from 'next/link'
import { ProductCard } from '@/components/cards'
import { DisclosureBox, PageHero } from '@/components/ui'
import type { Collection } from '@/lib/collections'
import { productsInCollection } from '@/lib/collections'

/**
 * A collection page.
 *
 * When a collection is empty it says so plainly and points somewhere useful.
 * It never pads itself with unrelated products to look fuller — a shopper who
 * clicks "Wall Art" and gets candles has been misled.
 */
export function CollectionView({ collection }: { collection: Collection }) {
  const products = productsInCollection(collection)

  return (
    <>
      <PageHero
        eyebrow={`${collection.eyebrow} / ${products.length} ${
          products.length === 1 ? 'object' : 'objects'
        }`}
        eyebrowColor={collection.accent}
        background={collection.background}
        title={<>{collection.title}</>}
        sub={
          products.length > 0
            ? 'Objects selected not for novelty, but for how beautifully they serve.'
            : collection.emptyCopy
        }
      />

      <section
        className="section"
        style={{ background: collection.background ?? 'var(--black)', paddingTop: 0 }}
      >
        <div className="section-inner">
          {products.length > 0 ? (
            <div className="product-grid gsap-stagger" style={{ marginTop: 0 }}>
              {products.map((p, i) => (
                <ProductCard product={p} index={i} key={p.slug} />
              ))}
            </div>
          ) : (
            <div className="collection-empty">
              <p className="collection-empty-copy">{collection.emptyCopy}</p>
              <div className="hero-actions">
                {collection.emptyHref ? (
                  <Link className="btn-primary" href={collection.emptyHref}>
                    {collection.emptyHrefLabel ?? 'Continue'}
                  </Link>
                ) : null}
                <Link className="btn-ghost" href="/shop/">
                  Back to the shop
                </Link>
              </div>
            </div>
          )}

          <div style={{ marginTop: '5rem' }}>
            <DisclosureBox />
          </div>
        </div>
      </section>
    </>
  )
}
