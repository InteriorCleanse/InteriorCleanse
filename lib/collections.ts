import { allProducts } from './content'
import type { Product, ProductCategory } from './types'

/**
 * Collection pages live under the existing `/shop/[slug]` route rather than in
 * their own route folder, so the storefront keeps one dynamic segment instead
 * of two competing ones. `resolveShopSlug` decides which a URL means.
 */
export type Collection = {
  slug: string
  title: string
  eyebrow: string
  /** Shown when the collection has nothing in it yet. Never fabricate stock. */
  emptyCopy: string
  emptyHref?: string
  emptyHrefLabel?: string
  accent?: string
  background?: string
  match: (product: Product) => boolean
}

const inCategories =
  (...categories: ProductCategory[]) =>
  (p: Product) =>
    categories.includes(p.category)

export const COLLECTIONS: Collection[] = [
  {
    slug: 'books',
    title: 'Books',
    eyebrow: 'Read the room',
    emptyCopy:
      'The books are published through Amazon and live in the Library, where each one links to its paperback and Kindle edition.',
    emptyHref: '/library/',
    emptyHrefLabel: 'Visit the Library',
    accent: 'var(--mind-accent)',
    background: 'var(--mind-bg)',
    match: inCategories('book'),
  },
  {
    slug: 'apparel',
    title: 'Apparel',
    eyebrow: 'Worn well',
    emptyCopy: 'No apparel is listed yet.',
    match: inCategories('custom', 'tote'),
  },
  {
    slug: 'home',
    title: 'Home',
    eyebrow: 'For the home',
    emptyCopy: 'No home objects are listed yet.',
    accent: 'var(--home-accent)',
    background: 'var(--home-bg)',
    match: inCategories('cleaning', 'candle', 'mug'),
  },
  {
    slug: 'wall-art',
    title: 'Wall Art',
    eyebrow: 'On the wall',
    emptyCopy: 'No wall art is listed yet.',
    match: inCategories('print'),
  },
  {
    slug: 'wellness',
    title: 'Wellness',
    eyebrow: 'For the body',
    emptyCopy: 'No wellness objects are listed yet.',
    accent: 'var(--body-accent)',
    background: 'var(--body-bg)',
    match: inCategories('candle'),
  },
  {
    slug: 'digital',
    title: 'Digital',
    eyebrow: 'Instant downloads',
    emptyCopy:
      'Digital goods are delivered through Gumroad today — see the downloads in the Library. Secure in-house delivery is still being built.',
    emptyHref: '/library/',
    emptyHrefLabel: 'See the downloads',
    match: () => false,
  },
  {
    slug: 'wallpapers',
    title: 'Digital Wallpapers',
    eyebrow: 'For every screen',
    emptyCopy:
      'Digital wallpapers are not available yet. Secure download delivery is still being built.',
    match: () => false,
  },
  {
    slug: 'tiktok-finds',
    title: 'TikTok Finds',
    eyebrow: 'Seen on TikTok',
    emptyCopy: 'No TikTok Shop products are listed yet.',
    match: (p) => p.checkoutMode === 'external_tiktok',
  },
  {
    slug: 'new',
    title: 'New',
    eyebrow: 'Just added',
    emptyCopy: 'Nothing is flagged as new right now.',
    match: (p) => p.badge?.toUpperCase() === 'NEW',
  },
  {
    slug: 'bestsellers',
    title: 'Bestsellers',
    eyebrow: 'Most wanted',
    // "Bestseller" is a sales claim. Until order data backs it, this shows the
    // owner's featured selection and says so rather than inventing rankings.
    emptyCopy: 'Nothing is featured right now.',
    match: (p) => p.featured,
  },
]

export const getCollection = (slug: string) => COLLECTIONS.find((c) => c.slug === slug)

export const productsInCollection = (collection: Collection) =>
  allProducts.filter(collection.match)

/**
 * A URL under `/shop/` is either a collection or a product.
 *
 * Collections win, so a product slug can never shadow a collection page. The
 * guard below makes that collision a build failure rather than a silent
 * disappearance.
 */
export function resolveShopSlug(slug: string) {
  const collection = getCollection(slug)
  if (collection) return { kind: 'collection' as const, collection }

  const product = allProducts.find((p) => p.slug === slug)
  if (product) return { kind: 'product' as const, product }

  return { kind: 'none' as const }
}

const collided = allProducts.filter((p) => COLLECTIONS.some((c) => c.slug === p.slug))
if (collided.length > 0) {
  throw new Error(
    `Product slug collides with a collection slug and would be unreachable: ${collided
      .map((p) => p.slug)
      .join(', ')}. Rename the product or the collection.`
  )
}

/** Every `/shop/*` path, for `generateStaticParams`. */
export const shopParams = () => [
  ...COLLECTIONS.map((c) => ({ slug: c.slug })),
  ...allProducts.map((p) => ({ slug: p.slug })),
]
