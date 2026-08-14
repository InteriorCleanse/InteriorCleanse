import scenes from '@/content/scenes.json'
import { getProduct } from './content'

export type Hotspot = {
  id: string
  label: string
  /** Percentages of the stage box, so they scale with any viewport. */
  x: number
  y: number
  href: string
}

export type Cta = { label: string; href: string }

export type Scene = {
  /** All media is optional — the hero must be complete with none of it. */
  desktopVideo?: string
  mobileVideo?: string
  posterImage?: string
  reducedMotionPoster?: string
  headline: string[]
  primaryCta: Cta
  secondaryCta?: Cta
  hotspots: Hotspot[]
  featuredProduct?: { slug: string; position: string }
}

const SCENES = scenes as Record<string, Scene>

export const getScene = (id: string): Scene | undefined => SCENES[id]

/**
 * The featured product, resolved against the real catalogue.
 *
 * Returns undefined when the manifest names a slug that does not exist rather
 * than rendering an empty card — a scene manifest is edited by hand and will
 * drift ahead of the catalogue.
 */
export function resolveFeatured(scene: Scene) {
  if (!scene.featuredProduct) return undefined
  return getProduct(scene.featuredProduct.slug)
}
