import type { CheckoutMode, Product, ProductCategory, RenderMode } from './types'

/**
 * Art direction per category.
 *
 * Adding a category means adding a record here — no component changes, no new
 * route file. The numbers are deliberately restrained: this is quiet luxury,
 * so the object suggests a turn rather than performing one.
 */
export type CategoryExperience = {
  /** Which stage the heavy viewer composes. */
  scenePreset: 'studio' | 'shelf' | 'pedestal' | 'wall' | 'room' | 'device'
  defaultRenderMode: RenderMode
  /** Maximum pointer-driven tilt, in degrees, on each axis. */
  tiltRange: number
  /** How far the object lifts toward the viewer on hover/focus, in px. */
  liftPx: number
  /** Parallax travel of the furthest-forward layer, in px. */
  parallaxPx: number
  /** CSS colour for the card's ambient wash. */
  accent: string
  /** Auto-rotation on the detail-page viewer, before the visitor takes hold. */
  autoRotate: boolean
}

const DEFAULT_EXPERIENCE: CategoryExperience = {
  scenePreset: 'studio',
  // Every category currently on the site has procedural geometry, so the
  // detail-page default is the real viewer; `resolveRenderMode` downgrades
  // automatically for any future category that lacks the assets.
  defaultRenderMode: 'true_3d',
  tiltRange: 7,
  liftPx: 10,
  parallaxPx: 12,
  accent: 'rgba(169, 137, 90, 0.16)',
  autoRotate: true,
}

export const CATEGORY_EXPERIENCE: Record<ProductCategory, CategoryExperience> = {
  // A book cover reads as a plane, so it needs real angle before thickness
  // becomes legible. It gets the widest tilt of anything on the site.
  book: {
    ...DEFAULT_EXPERIENCE,
    scenePreset: 'shelf',
    tiltRange: 14,
    liftPx: 16,
    parallaxPx: 18,
    accent: 'rgba(127, 168, 114, 0.18)',
  },
  // Glass and wax blow out under motion; the candle only wants a suggestion.
  candle: {
    ...DEFAULT_EXPERIENCE,
    tiltRange: 5,
    liftPx: 8,
    parallaxPx: 9,
    accent: 'rgba(245, 237, 214, 0.14)',
  },
  print: {
    ...DEFAULT_EXPERIENCE,
    scenePreset: 'wall',
    tiltRange: 9,
    liftPx: 12,
    parallaxPx: 16,
  },
  tote: {
    ...DEFAULT_EXPERIENCE,
    scenePreset: 'pedestal',
    tiltRange: 8,
    liftPx: 12,
    parallaxPx: 14,
  },
  mug: {
    ...DEFAULT_EXPERIENCE,
    scenePreset: 'pedestal',
    tiltRange: 10,
    liftPx: 12,
    parallaxPx: 12,
  },
  cleaning: {
    ...DEFAULT_EXPERIENCE,
    scenePreset: 'room',
    tiltRange: 6,
    liftPx: 9,
    parallaxPx: 11,
    accent: 'rgba(91, 99, 87, 0.2)',
  },
  custom: DEFAULT_EXPERIENCE,
}

export const experienceFor = (category: ProductCategory): CategoryExperience =>
  CATEGORY_EXPERIENCE[category] ?? DEFAULT_EXPERIENCE

/**
 * Categories `ProductGeometry` builds from procedural meshes.
 *
 * These reach `true_3d` with no `modelUrl` at all — the geometry is code, not
 * an asset — which is why the existing detail-page viewer works today with an
 * empty product record. A category outside this set needs a real model file.
 */
const PROCEDURAL_CATEGORIES = new Set<ProductCategory>([
  'candle',
  'tote',
  'print',
  'mug',
  'custom',
  'cleaning',
  'book',
])

export const hasProceduralGeometry = (category: ProductCategory) =>
  PROCEDURAL_CATEGORIES.has(category)

/**
 * The mode a product actually renders in.
 *
 * A declared mode is honoured only when its assets are present — a product
 * marked `true_3d` with no `modelUrl` falls back rather than rendering an empty
 * canvas. This is what lets the data be edited freely without breaking pages.
 */
export function resolveRenderMode(product: Product): RenderMode {
  const declared = product.renderMode ?? experienceFor(product.category).defaultRenderMode

  if (declared === 'true_3d' && !product.modelUrl && !hasProceduralGeometry(product.category)) {
    return product.spinFrames?.length ? 'spin_360' : 'depth_interactive'
  }
  if (declared === 'spin_360' && (product.spinFrames?.length ?? 0) < 2) {
    return 'depth_interactive'
  }
  return declared
}

/** Layers for Mode C, falling back to the hero image as a single plane. */
export function resolveDepthLayers(product: Product) {
  if (product.depthLayers?.length) return product.depthLayers
  return [{ src: product.heroImage, depth: 1, alt: product.name }]
}

export const checkoutModeFor = (product: Product): CheckoutMode =>
  product.checkoutMode ?? 'internal_physical'

/** External purchases leave the site, so they must never enter our cart. */
export const isInternalCheckout = (product: Product) =>
  !checkoutModeFor(product).startsWith('external_')

/** The label a CTA must use, so the destination is never ambiguous. */
export function purchaseLabel(product: Product): string {
  switch (checkoutModeFor(product)) {
    case 'external_amazon':
      return 'Buy on Amazon ↗'
    case 'external_tiktok':
      return 'Shop on TikTok ↗'
    case 'inquiry_or_consultation':
      return 'Enquire'
    case 'internal_digital':
      return 'Buy & download'
    default:
      return 'Add to cart'
  }
}
