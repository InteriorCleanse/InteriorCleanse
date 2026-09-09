import { blankProduct, type CatalogProduct } from './catalog-schema'
import { readCatalog, writeCatalog } from './catalog-store'
import type { SyncedProduct } from './print-providers'

const CATEGORY_FOR_OBJECT: Record<string, CatalogProduct['category']> = {
  candle: 'fragrance',
  cleaning: 'cleaning',
  print: 'wall-art',
  tote: 'merch',
  mug: 'home',
  custom: 'merch',
  book: 'books',
}

const ENVIRONMENT_FOR_OBJECT: Record<string, CatalogProduct['environment']> = {
  candle: 'atrium',
  cleaning: 'cleaning',
  print: 'gallery',
  tote: 'atelier',
  mug: 'atelier',
  custom: 'atelier',
  book: 'library',
}

export type SyncSummary = {
  provider: 'printful' | 'printify'
  created: string[]
  updated: string[]
  unchanged: string[]
  commit: string | null
}

/**
 * Writes a provider's catalogue into the catalog.
 *
 * A synced product arrives as `needs-pricing`: the provider knows its cost and
 * its mockups, and the owner sets the retail price. Anything a person has
 * already written — name, description, tagline, price, status, environment,
 * category, SEO — is kept on re-sync; only provider-owned facts (variant id,
 * mockup images when none were uploaded by hand, fulfilment) are refreshed.
 * A sync therefore never demotes a published product or blanks its copy.
 */
export async function syncIntoCatalog(
  provider: 'printful' | 'printify',
  incoming: SyncedProduct[]
): Promise<SyncSummary> {
  const all = await readCatalog()
  const created: string[] = []
  const updated: string[] = []
  const unchanged: string[] = []
  const now = new Date().toISOString()

  for (const s of incoming) {
    const variantId =
      provider === 'printful' ? s.channels.printfulId ?? null : s.channels.printifyId ?? null
    const idx = all.findIndex(
      (p) =>
        p.slug === s.slug ||
        (variantId && (provider === 'printful' ? p.printfulVariantId : p.printifyVariantId) === variantId)
    )

    if (idx < 0) {
      all.push(
        blankProduct({
          id: s.slug,
          slug: s.slug,
          name: s.name,
          category: CATEGORY_FOR_OBJECT[s.category] ?? 'merch',
          environment: ENVIRONMENT_FOR_OBJECT[s.category] ?? 'atelier',
          description: s.description ?? '',
          // The provider's retail price is a suggestion, kept for reference
          // in compareAtPrice-free form: the owner sets the real one.
          price: 0,
          images: { hero: s.heroImage || null, transparent: null, gallery: s.gallery ?? [] },
          sizeClass: s.category === 'mug' || s.category === 'candle' ? 'small' : 'medium',
          purchaseType: 'stripe',
          fulfillment: provider,
          printfulVariantId: provider === 'printful' ? variantId : null,
          printifyVariantId: provider === 'printify' ? variantId : null,
          status: 'needs-pricing',
          tags: [s.category, provider],
          objectType: s.category,
          tagline: s.tagline ?? '',
          badge: 'NEW',
          seoDescription: null,
          createdAt: now,
          updatedAt: now,
        })
      )
      created.push(s.slug)
      continue
    }

    const p = all[idx]
    const before = JSON.stringify(p)
    if (provider === 'printful') p.printfulVariantId = variantId
    else p.printifyVariantId = variantId
    if (p.fulfillment === 'manual') p.fulfillment = provider
    // Only fill images the owner has not supplied; never replace an upload.
    if (!p.images.hero && s.heroImage) p.images.hero = s.heroImage
    if (p.images.gallery.length === 0 && s.gallery?.length) p.images.gallery = s.gallery
    if (!p.tags.includes(provider)) p.tags = [...p.tags, provider]
    if (JSON.stringify(p) === before) unchanged.push(p.slug)
    else {
      p.updatedAt = now
      updated.push(p.slug)
    }
  }

  const commit =
    created.length || updated.length
      ? await writeCatalog(all, `catalog: sync ${provider} (${created.length} new, ${updated.length} updated)`)
      : null

  return { provider, created, updated, unchanged, commit }
}
