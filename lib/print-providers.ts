import { env } from './env'
import type { Product, ProductCategory } from './types'

/**
 * Printful + Printify catalogue sync.
 *
 * Both providers are mapped onto the site's own Product shape so the
 * storefront never learns which fulfiller a product came from.
 */

export type ProductVariant = {
  id: string
  name: string
  price: number
  size?: string
  color?: string
}

export type SyncedProduct = Product & {
  variants?: ProductVariant[]
  source?: 'printful' | 'printify'
}

/** Maps a provider's free-text product name onto our 3D-viewer categories. */
export function detectCategory(name: string): ProductCategory {
  const n = name.toLowerCase()
  if (n.includes('tote') || n.includes('bag')) return 'tote'
  if (n.includes('mug') || n.includes('cup')) return 'mug'
  if (n.includes('poster') || n.includes('print') || n.includes('canvas')) return 'print'
  if (n.includes('candle')) return 'candle'
  if (n.includes('hoodie') || n.includes('shirt') || n.includes('tee') || n.includes('sweat'))
    return 'custom'
  return 'custom'
}

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? '0'))
  return Number.isFinite(n) ? n : 0
}

async function printfulFetch(path: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.printfulKey()}`,
  }
  const storeId = env.printfulStoreId()
  if (storeId) headers['X-PF-Store-Id'] = storeId

  const res = await fetch(`https://api.printful.com${path}`, { headers })
  if (!res.ok) {
    throw new Error(`Printful ${path} failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

export async function fetchPrintfulProducts(): Promise<SyncedProduct[]> {
  const list = await printfulFetch('/store/products')
  const items: any[] = list?.result ?? []

  const products = await Promise.all(
    items.map(async (item) => {
      const detail = await printfulFetch(`/store/products/${item.id}`)
      const variants: any[] = detail?.result?.sync_variants ?? []
      const first = variants[0]

      const gallery = variants
        .slice(0, 4)
        .map((v) => v.files?.find((f: any) => f.type === 'preview')?.preview_url)
        .filter(Boolean) as string[]

      const product: SyncedProduct = {
        slug: slugify(item.name),
        name: item.name,
        category: detectCategory(item.name),
        tagline: '',
        description: '',
        price: num(first?.retail_price),
        heroImage: item.thumbnail_url ?? gallery[0] ?? '',
        gallery,
        viewer: { mode: 'static' },
        channels: { website: true, printfulId: String(item.id) },
        variants: variants.map((v) => ({
          id: String(v.id),
          name: v.name,
          price: num(v.retail_price),
          size: v.size,
          color: v.color,
        })),
        featured: true,
        comingSoon: false,
        badge: 'NEW',
        source: 'printful',
      }
      return product
    })
  )

  return products
}

export async function fetchPrintifyProducts(): Promise<SyncedProduct[]> {
  const res = await fetch(
    `https://api.printify.com/v1/shops/${env.printifyShopId()}/products.json`,
    { headers: { Authorization: `Bearer ${env.printifyKey()}` } }
  )
  if (!res.ok) {
    throw new Error(`Printify products failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const items: any[] = data?.data ?? []

  return items.map((item) => {
    const variants: any[] = (item.variants ?? []).filter((v: any) => v.is_enabled !== false)
    const images: string[] = (item.images ?? [])
      .slice(0, 4)
      .map((i: any) => i.src)
      .filter(Boolean)

    // Printify quotes prices in cents; the storefront works in dollars.
    const toDollars = (cents: unknown) => num(cents) / 100

    return {
      slug: slugify(item.title ?? ''),
      name: item.title ?? '',
      category: detectCategory(item.title ?? ''),
      tagline: '',
      description: '',
      price: toDollars(variants[0]?.price),
      heroImage: images[0] ?? '',
      gallery: images,
      viewer: { mode: 'static' },
      channels: { website: true, printifyId: String(item.id) },
      variants: variants.map((v) => ({
        id: String(v.id),
        name: v.title,
        price: toDollars(v.price),
      })),
      featured: true,
      comingSoon: false,
      badge: 'NEW',
      source: 'printify',
    } satisfies SyncedProduct
  })
}

/**
 * Merges provider results with the existing catalogue, keyed by slug.
 *
 * Hand-written copy wins: a synced product never overwrites a `tagline`,
 * `description`, or `careNotes` that someone has already authored, because the
 * providers have no equivalent field and would blank them on every sync.
 */
export function mergeProducts(
  existing: SyncedProduct[],
  incoming: SyncedProduct[]
): SyncedProduct[] {
  const bySlug = new Map<string, SyncedProduct>()
  for (const p of existing) bySlug.set(p.slug, p)

  for (const next of incoming) {
    const prev = bySlug.get(next.slug)
    bySlug.set(
      next.slug,
      prev
        ? {
            ...next,
            tagline: prev.tagline || next.tagline,
            description: prev.description || next.description,
            careNotes: prev.careNotes ?? next.careNotes,
            materialColor: prev.materialColor ?? next.materialColor,
            featured: prev.featured,
            comingSoon: prev.comingSoon,
            badge: prev.badge ?? next.badge,
          }
        : next
    )
  }

  return Array.from(bySlug.values())
}
