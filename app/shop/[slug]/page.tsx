import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductExperience } from '@/components/product/ProductExperience'
import { validUrl } from '@/components/cards'
import { AddToCartButton } from '@/components/cart'
import { allProducts, getProduct } from '@/lib/content'
import type { Product } from '@/lib/types'

export function generateStaticParams() {
  return allProducts.map((p) => ({ slug: p.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = getProduct(params.slug)
  if (!p) return { title: 'Product' }
  return { title: p.name, description: p.tagline }
}

const CARE_BY_CATEGORY: Record<string, string[]> = {
  candle: [
    'Approximately 50-hour burn time',
    'Trim wick to ¼ inch before each burn',
    'Hand-poured soy-blend wax',
  ],
  book: [
    'Available as paperback and Kindle',
    'Fulfilled by Amazon KDP',
    'Ships directly from Amazon',
  ],
  mug: [
    'Glazed stoneware, 11 oz',
    'Dishwasher and microwave safe',
    'Fulfilled by our print partner',
  ],
  print: [
    'Giclée print on heavyweight matte stock',
    'Ships flat and unframed',
    'Frame not included',
  ],
}

const DEFAULT_CARE = [
  'Material: see product listing for details',
  'Fulfilled by Printful, Printify, or Tapstitch',
  'Wash cold, gentle cycle',
]

function CareNotes({ product }: { product: Product }) {
  const notes = product.careNotes ?? CARE_BY_CATEGORY[product.category] ?? DEFAULT_CARE

  return (
    <div className="care-craft">
      <p className="care-craft-title">Care &amp; Craft</p>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  )
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const p = getProduct(params.slug)
  if (!p) notFound()

  return (
    <section className="product-detail-grid">
      <div className="product-viewer-col">
        <ProductExperience product={p} variant="stage" eager />
      </div>

      <div className="product-info-col">
        <div className="product-breadcrumb">
          <Link href="/shop/">The Edit</Link>
          <span>/ {p.category}</span>
          <span>/ {p.name}</span>
        </div>

        <p className="eyebrow">
          {p.category} · Object {String(allProducts.indexOf(p) + 1).padStart(2, '0')}
        </p>

        <h1 className="product-detail-name">{p.name}</h1>
        <p className="product-detail-tagline">{p.tagline}</p>
        <p className="product-detail-desc">{p.description}</p>

        <div className="product-price-row">
          <span className="product-price">
            {p.price ? `$${p.price}.00` : 'PRICE ON RELEASE'}
          </span>
          <span className="product-currency">USD · Tax at checkout</span>
        </div>

        <AddToCartButton
          disabled={p.comingSoon}
          item={{
            slug: p.slug,
            name: p.name,
            price: p.price,
            heroImage: p.heroImage,
            printfulVariantId: p.channels.printfulId,
            printifyVariantId: p.channels.printifyId,
          }}
        />

        <div className="channel-buttons">
          {validUrl(p.channels.amazonUrl) ? (
            <a
              className="channel-btn amazon"
              href={p.channels.amazonUrl}
              target="_blank"
              rel="noreferrer"
            >
              Buy on Amazon ↗
            </a>
          ) : null}
          {validUrl(p.channels.etsyUrl) ? (
            <a
              className="channel-btn etsy"
              href={p.channels.etsyUrl}
              target="_blank"
              rel="noreferrer"
            >
              Buy on Etsy ↗
            </a>
          ) : null}
          {validUrl(p.channels.tiktokShopUrl) ? (
            <a
              className="channel-btn tiktok"
              href={p.channels.tiktokShopUrl}
              target="_blank"
              rel="noreferrer"
            >
              TikTok Shop ↗
            </a>
          ) : null}
        </div>

        <CareNotes product={p} />

        <dl className="product-meta">
          <div>
            <dt>Fulfillment</dt>
            <dd>Made and dispatched by our trusted production partner.</dd>
          </div>
          <div>
            <dt>The edit standard</dt>
            <dd>Selected for material, utility, and a quieter visual life.</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
