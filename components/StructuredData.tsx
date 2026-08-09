import { checkoutModeFor } from '@/lib/category-experience'
import { BRAND_NAME, SITE } from '@/lib/site-config'
import type { Book, Product } from '@/lib/types'

/**
 * JSON-LD structured data.
 *
 * The governing rule is truthfulness: a field is emitted only when the value is
 * genuinely known. Search engines treat structured data as a factual claim, and
 * an invented rating, stock level, or review count is a misrepresentation that
 * can cost the whole site its rich results — so nothing here is guessed.
 */
function Ld({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // The payload is built from our own content, never from user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export function OrganizationLd() {
  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: BRAND_NAME,
        url: SITE.url,
        email: SITE.contactEmail,
        sameAs: [SITE.social.tiktok, SITE.social.instagram],
      }}
    />
  )
}

export function WebSiteLd() {
  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: BRAND_NAME,
        url: SITE.url,
        description: SITE.tagline,
      }}
    />
  )
}

export function BreadcrumbLd({ trail }: { trail: { name: string; path: string }[] }) {
  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((crumb, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: crumb.name,
          item: `${SITE.url}${crumb.path}`,
        })),
      }}
    />
  )
}

export function ProductLd({ product }: { product: Product }) {
  const mode = checkoutModeFor(product)
  const external = mode.startsWith('external_')

  // Availability and price are only asserted for products we actually sell and
  // price ourselves. An external item's price belongs to Amazon or TikTok and
  // changes without telling us, so no offer is emitted for it at all.
  const offers =
    external || product.comingSoon || !product.price
      ? undefined
      : {
          '@type': 'Offer',
          price: product.price,
          priceCurrency: 'USD',
          availability: product.channels.stripePriceId
            ? 'https://schema.org/InStock'
            : 'https://schema.org/PreOrder',
          url: `${SITE.url}/shop/${product.slug}/`,
        }

  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.description,
        category: product.category,
        image: product.heroImage,
        brand: { '@type': 'Brand', name: BRAND_NAME },
        ...(offers ? { offers } : {}),
      }}
    />
  )
}

export function BookLd({ book }: { book: Book }) {
  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@type': 'Book',
        name: book.title,
        ...(book.subtitle ? { alternateName: book.subtitle } : {}),
        description: book.hook,
        image: book.coverImage,
        publisher: { '@type': 'Organization', name: BRAND_NAME },
        // Amazon owns the price and availability; we link, we do not quote.
        workExample: [
          { '@type': 'Book', bookFormat: 'https://schema.org/Paperback', url: book.paperbackUrl },
          { '@type': 'Book', bookFormat: 'https://schema.org/EBook', url: book.kindleUrl },
        ],
      }}
    />
  )
}
