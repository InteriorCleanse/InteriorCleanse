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
  /**
   * All media is optional and nullable — the manifest carries `null` for
   * environments whose footage has not been shot yet, and the hero must be
   * complete with none of it.
   */
  desktopVideo?: string | null
  mobileVideo?: string | null
  /** Optional VP9/AV1 companion to desktopVideo. */
  webmVideo?: string | null
  posterImage?: string | null
  reducedMotionPoster?: string | null
  headline: string[]
  primaryCta: Cta
  secondaryCta?: Cta
  hotspots: Hotspot[]
  featuredProduct?: { slug: string; position: string }
}

export type SceneId =
  | 'atrium'
  | 'library'
  | 'conservatory'
  | 'cleaning'
  | 'chapel'
  | 'gallery'
  | 'atelier'
  /** Not in the seven named environments, but /partners depends on it. */
  | 'pavilion'

const SCENES = scenes as Record<string, Scene>

export const getScene = (id: SceneId): Scene | undefined => SCENES[id]

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
