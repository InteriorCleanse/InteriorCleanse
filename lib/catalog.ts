import catalogJson from '@/content/catalog.json'
import type { CatalogProduct, CatalogStatus } from './catalog-schema'
import type { CheckoutMode, Product } from './types'

/**
 * The catalog as built, and its projection onto the storefront's `Product`.
 *
 * content/catalog.json is the single source of truth for everything sellable.
 * The storefront, the cart, and checkout were written against the older
 * `Product` shape and are deliberately left alone — `toLegacyProduct` gives them
 * exactly what they expect, derived from the catalog, so a product edited in
 * /admin/products shows up everywhere without a second record to keep in step.
 *
 * Only `published` products reach the public site. A draft with no price and a
 * placeholder name is an admin concern, never a "Coming soon" card.
 */
export const catalog = catalogJson as CatalogProduct[]

export const publishedProducts = (): CatalogProduct[] =>
  catalog.filter((p) => p.status === 'published')

export const getCatalogProduct = (slug: string) => catalog.find((p) => p.slug === slug)

export const catalogByStatus = (): Record<CatalogStatus, number> => {
  const counts: Record<CatalogStatus, number> = {
    draft: 0,
    'needs-assets': 0,
    'needs-pricing': 0,
    approved: 0,
    published: 0,
  }
  for (const p of catalog) counts[p.status]++
  return counts
}

export const productsInEnvironment = (environment: string, exceptSlug?: string) =>
  publishedProducts().filter((p) => p.environment === environment && p.slug !== exceptSlug)

/** Where checkout happens, derived from how the product is sold. */
export function checkoutModeOf(p: CatalogProduct): CheckoutMode {
  switch (p.purchaseType) {
    case 'stripe':
      return p.fulfillment === 'digital' ? 'internal_digital' : 'internal_physical'
    case 'amazon':
      return 'external_amazon'
    case 'affiliate':
      return p.tags.includes('tiktok') ? 'external_tiktok' : 'external_amazon'
    case 'gumroad':
      // Gumroad hosts the checkout; the storefront treats it like any other
      // external destination and never puts it in the internal cart.
      return 'external_amazon'
  }
}

export const externalUrlOf = (p: CatalogProduct): string | undefined => {
  switch (p.purchaseType) {
    case 'amazon':
      return p.amazonUrl ?? undefined
    case 'affiliate':
      return p.affiliateUrl && p.affiliateUrl !== 'PENDING_APPROVAL' ? p.affiliateUrl : undefined
    case 'gumroad':
      return p.gumroadUrl ?? undefined
    default:
      return undefined
  }
}

/**
 * Projects a catalog record onto the storefront's `Product`.
 *
 * The mapping is total: every field the older components read is filled from a
 * real catalog field, and nothing is invented. `comingSoon` is false for a
 * published product by definition — an unfinished product is not published.
 */
export function toLegacyProduct(p: CatalogProduct): Product {
  const mode = checkoutModeOf(p)
  return {
    slug: p.slug,
    name: p.name,
    category: p.objectType,
    tagline: p.tagline,
    description: p.description,
    price: p.price,
    heroImage: p.images.hero ?? '',
    gallery: p.images.gallery,
    materialColor: p.materialColor ?? undefined,
    renderMode: p.renderMode ?? undefined,
    modelUrl: p.modelUrl ?? undefined,
    posterUrl: p.images.hero ?? undefined,
    spinFrames: p.rotationSequence ?? undefined,
    sourceType:
      p.fulfillment === 'printful'
        ? 'printful'
        : p.fulfillment === 'printify'
          ? 'printify'
          : p.fulfillment === 'digital'
            ? 'digital'
            : p.purchaseType === 'amazon'
              ? 'amazon'
              : p.purchaseType === 'affiliate' && p.tags.includes('tiktok')
                ? 'tiktok'
                : 'owned',
    checkoutMode: mode,
    externalPurchaseUrl: externalUrlOf(p),
    viewer: p.rotationSequence?.length
      ? { mode: 'spin', spinImages: p.rotationSequence, frameCount: p.rotationSequence.length }
      : p.modelUrl
        ? { mode: 'model', modelPath: p.modelUrl }
        : { mode: 'static' },
    channels: {
      website: true,
      amazonUrl: p.amazonUrl ?? undefined,
      tiktokShopUrl: p.tags.includes('tiktok') ? p.affiliateUrl ?? undefined : undefined,
      printfulId: p.printfulVariantId ?? undefined,
      printifyId: p.printifyVariantId ?? undefined,
      stripePriceId: p.stripePriceId,
    },
    featured: p.featured,
    comingSoon: p.status !== 'published',
    badge: p.badge ?? undefined,
    careNotes: p.careNotes ?? undefined,
  }
}
