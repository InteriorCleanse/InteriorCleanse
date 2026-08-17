import { allProducts } from './content'
import type { Product } from './types'

export type SizeClass = 'small' | 'medium' | 'large' | 'oversized'
export type PurchaseType = 'internal' | 'affiliate'
export type StockStatus = 'in_stock' | 'coming_soon' | 'sold_out' | 'unknown'

/** The showroom category set, matching the ?category= deep links. */
export const SHOWROOM_CATEGORIES = [
  'books',
  'wellness',
  'home',
  'cleaning',
  'fragrance',
  'merch',
  'digital',
  'partners',
] as const

export type ShowroomCategory = (typeof SHOWROOM_CATEGORIES)[number]

export type ShowroomProduct = {
  id: string
  name: string
  category: ShowroomCategory
  description: string
  price: number | null
  /** Ordinary catalogue image, used in cards and as the last-resort stage art. */
  productImage: string | null
  /** Cut-out with alpha — the only one that sits believably on the pedestal. */
  transparentImage: string | null
  /** Ordered turntable frames, loaded only after the visitor asks to rotate. */
  rotationSequence: string[]
  /** GLB/GLTF, loaded only once this product is selected. */
  modelUrl: string | null
  sizeClass: SizeClass
  purchaseType: PurchaseType
  checkoutUrl: string | null
  affiliateUrl: string | null
  stockStatus: StockStatus
  /** Which environment this product belongs to. */
  environment: string
  featured: boolean
  saved: boolean
}

/**
 * How much of the stage each size class is allowed to occupy.
 *
 * The architecture never scales — a candle and a sauna stand in the same room,
 * and it is the product's presentation and the camera crop that change. This is
 * why a book does not get stretched to the height of a wardrobe.
 */
export const SIZE_PRESENTATION: Record<SizeClass, { maxHeight: string; shadowScale: number }> = {
  small: { maxHeight: '38%', shadowScale: 0.5 },
  medium: { maxHeight: '55%', shadowScale: 0.7 },
  large: { maxHeight: '72%', shadowScale: 0.9 },
  oversized: { maxHeight: '86%', shadowScale: 1.1 },
}

const CATEGORY_FROM_PRODUCT: Record<string, ShowroomCategory> = {
  candle: 'fragrance',
  cleaning: 'cleaning',
  print: 'digital',
  tote: 'merch',
  mug: 'home',
  custom: 'merch',
  book: 'books',
}

const SIZE_FROM_PRODUCT: Record<string, SizeClass> = {
  candle: 'small',
  book: 'small',
  print: 'medium',
  tote: 'medium',
  mug: 'small',
  custom: 'medium',
  cleaning: 'medium',
}

/**
 * Projects the real catalogue into showroom shape.
 *
 * Every field that has no honest source is left null rather than filled in:
 * there are no transparent cut-outs, no turntables, and no models yet, so the
 * stage shows its empty state instead of pretending. Nothing here invents a
 * product.
 */
export function toShowroomProduct(p: Product): ShowroomProduct {
  const external = p.checkoutMode?.startsWith('external_')
  return {
    id: p.slug,
    name: p.name,
    category: CATEGORY_FROM_PRODUCT[p.category] ?? 'home',
    description: p.tagline,
    price: p.price || null,
    productImage: p.heroImage || null,
    // No cut-outs have been produced; the stage needs one to look real.
    transparentImage: null,
    rotationSequence: p.spinFrames ?? [],
    modelUrl: p.modelUrl ?? null,
    sizeClass: SIZE_FROM_PRODUCT[p.category] ?? 'medium',
    purchaseType: external ? 'affiliate' : 'internal',
    checkoutUrl: external ? null : `/shop/${p.slug}/`,
    affiliateUrl: external ? p.externalPurchaseUrl ?? null : null,
    stockStatus: p.comingSoon ? 'coming_soon' : p.channels.stripePriceId ? 'in_stock' : 'unknown',
    environment: 'showroom',
    featured: p.featured,
    saved: false,
  }
}

export const showroomProducts = (): ShowroomProduct[] =>
  allProducts.map(toShowroomProduct)

export const isValidCategory = (v: string | null): v is ShowroomCategory =>
  Boolean(v) && (SHOWROOM_CATEGORIES as readonly string[]).includes(v as string)

export const categoryLabel = (c: string) =>
  c.charAt(0).toUpperCase() + c.slice(1)
