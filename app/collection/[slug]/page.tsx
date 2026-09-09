import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AddToCartButton } from '@/components/cart'
import { EnvironmentHero } from '@/components/hero/EnvironmentHero'
import { ProductPedestal } from '@/components/showroom/ProductPedestal'
import { BreadcrumbLd, ProductLd } from '@/components/StructuredData'
import { externalUrlOf, getCatalogProduct, productsInEnvironment, publishedProducts, toLegacyProduct } from '@/lib/catalog'
import type { CatalogProduct } from '@/lib/catalog-schema'
import { getScene, type SceneId } from '@/lib/scenes'
import { catalogToShowroom } from '@/lib/showroom'
import { SITE } from '@/lib/site-config'

/** Only published products get a page. A draft's URL is a 404, not a preview. */
export function generateStaticParams() {
  return publishedProducts().map((p) => ({ slug: p.slug }))
}
export const dynamicParams = false

const SIZE_LABEL: Record<CatalogProduct['sizeClass'], string> = {
  small: 'Small — sits in the hand',
  medium: 'Medium — a shelf or a tabletop',
  large: 'Large — a piece of furniture',
  oversized: 'Oversized — needs its own room',
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = getCatalogProduct(params.slug)
  if (!p || p.status !== 'published') return { title: 'The Collection' }
  const title = p.seoTitle ?? p.name
  const description = p.seoDescription ?? p.tagline ?? p.description.slice(0, 155)
  return {
    title,
    description,
    alternates: { canonical: `/collection/${p.slug}/` },
    openGraph: {
      title,
      description,
      url: `/collection/${p.slug}/`,
      type: 'website',
      // The per-product image is rendered by opengraph-image.tsx alongside
      // this file; Next wires it in automatically.
    },
  }
}

/**
 * A product in its room.
 *
 * The environment hero at the top is the same component every page uses, fed
 * the product's own environment; the product then stands on the showroom's
 * pedestal below it. Purchase copy is decided by `purchaseType` alone, so the
 * visitor always knows where the money changes hands.
 */
export default function CollectionProductPage({ params }: { params: { slug: string } }) {
  const p = getCatalogProduct(params.slug)
  if (!p || p.status !== 'published') notFound()

  const scene = getScene(p.environment as SceneId)
  const legacy = toLegacyProduct(p)
  const stage = catalogToShowroom(p)
  const related = productsInEnvironment(p.environment, p.slug).slice(0, 4)
  const external = externalUrlOf(p)

  return (
    <>
      {scene ? <EnvironmentHero scene={scene} height="band" headingLevel="h2" /> : null}

      <section className="product-detail-grid collection-product">
        <ProductLd product={legacy} />
        <BreadcrumbLd
          trail={[
            { name: 'The Collection', path: '/collection/' },
            { name: p.category, path: `/collection/?category=${p.category}` },
            { name: p.name, path: `/collection/${p.slug}/` },
          ]}
        />

        <div className="product-viewer-col">
          <ProductPedestal product={stage} />
        </div>

        <div className="product-info-col">
          <nav className="product-breadcrumb" aria-label="Breadcrumb">
            <Link href="/collection/">The Collection</Link>
            <span>
              / <Link href={`/collection/?category=${p.category}`}>{p.category}</Link>
            </span>
            <span>/ {p.name}</span>
          </nav>

          <p className="eyebrow">
            {p.category} · {p.environment}
          </p>
          <h1 className="product-detail-name">{p.name}</h1>
          {p.tagline ? <p className="product-detail-tagline">{p.tagline}</p> : null}
          <p className="product-detail-desc">{p.description}</p>

          <div className="product-price-row">
            <span className="product-price">
              {p.purchaseType === 'stripe' || p.purchaseType === 'gumroad'
                ? `$${p.price % 1 === 0 ? `${p.price}.00` : p.price.toFixed(2)}`
                : p.price > 0
                  ? `From $${p.price}`
                  : 'Price at partner'}
            </span>
            {p.compareAtPrice && p.compareAtPrice > p.price ? (
              <s className="product-compare">${p.compareAtPrice}</s>
            ) : null}
            <span className="product-currency">
              {p.purchaseType === 'stripe' ? 'USD · Tax at checkout' : 'USD'}
            </span>
          </div>

          <PurchaseCta p={p} external={external} />

          <dl className="product-meta">
            <div>
              <dt>Size</dt>
              <dd>{SIZE_LABEL[p.sizeClass]}</dd>
            </div>
            <div>
              <dt>Fulfilment</dt>
              <dd>
                {p.fulfillment === 'printful' || p.fulfillment === 'printify'
                  ? 'Made to order and dispatched by our print partner.'
                  : p.fulfillment === 'digital'
                    ? 'Delivered instantly as a download.'
                    : p.fulfillment === 'affiliate'
                      ? 'Sold and shipped by the partner. We may earn a commission.'
                      : 'Packed and dispatched by InteriorCleanse.'}
              </dd>
            </div>
            {p.careNotes?.length ? (
              <div>
                <dt>Care &amp; craft</dt>
                <dd>
                  <ul>
                    {p.careNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      {related.length > 0 ? (
        <section className="section related-section" aria-labelledby="related-heading">
          <div className="section-inner">
            <p className="eyebrow">Also in the {p.environment}</p>
            <h2 id="related-heading" className="related-heading">
              From the same room.
            </h2>
            <ul className="related-grid">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/collection/${r.slug}/`}>
                    {r.images.hero ? <img src={r.images.hero} alt="" loading="lazy" decoding="async" /> : <span className="related-empty" />}
                    <span className="related-name">{r.name}</span>
                    <span className="related-price">{r.price ? `$${r.price}` : 'At partner'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  )
}

function PurchaseCta({ p, external }: { p: CatalogProduct; external?: string }) {
  if (p.purchaseType === 'stripe') {
    return (
      <>
        <AddToCartButton
          disabled={!p.stripePriceId}
          item={{ slug: p.slug, name: p.name, price: p.price, heroImage: p.images.hero ?? undefined }}
        />
        <p className="purchase-note">Secure checkout by Stripe. Ships to US, CA, UK, AU, DE, FR.</p>
      </>
    )
  }
  if (!external) {
    return (
      <>
        <button className="add-to-cart-btn" disabled>
          LINK COMING SOON <span>◇</span>
        </button>
        <p className="purchase-note">
          {p.purchaseType === 'affiliate'
            ? 'Our partner application is submitted. The link goes live the moment it is approved.'
            : 'The purchase link for this item is not set yet.'}
        </p>
      </>
    )
  }
  const label = p.purchaseType === 'gumroad' ? 'DOWNLOAD' : 'VIEW AT PARTNER'
  const note =
    p.purchaseType === 'gumroad'
      ? 'You will complete this purchase on Gumroad and receive the download there.'
      : p.purchaseType === 'amazon'
        ? 'You will complete this purchase on Amazon. Price, availability, and delivery are set by Amazon.'
        : `You will complete this purchase with ${p.name.split(' ')[0]}. ${SITE.affiliateDisclosure}`
  return (
    <>
      <a
        className="add-to-cart-btn"
        href={external}
        target="_blank"
        rel={p.purchaseType === 'affiliate' ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
      >
        {label} <span>↗</span>
      </a>
      <p className="purchase-note">{note}</p>
    </>
  )
}
