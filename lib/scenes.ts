import scenes from '@/content/scenes.json'
import type { AmbientKind } from './ambient-audio'
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

/** Camera moves available to a still poster. */
export type PosterMotion =
  | 'push-in'
  | 'pull-out'
  | 'drift-left'
  | 'drift-right'
  | 'drift-up'
  | 'none'

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
  /**
   * Free "living still" motion applied to the poster when no video exists.
   *
   * A slow transform on the poster gives the same imperceptible camera drift the
   * scenes are written around, at no bandwidth cost, with no decode, and with a
   * loop that is seamless by construction rather than by editing.
   */
  posterMotion?: PosterMotion | null
  posterImage?: string | null
  reducedMotionPoster?: string | null
  /**
   * Synthesised room tone offered by this environment. Off by default, never
   * under reduced motion; see lib/ambient-audio.
   */
  ambientSound?: AmbientKind | null
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
  /**
   * The Guest Book band and the /collection showroom carry footage too, and
   * they read their media from here so a re-shoot is a manifest edit for every
   * environment, not seven manifest edits and two component edits.
   */
  | 'guestbook'
  | 'showroom'

const SCENES = scenes as Record<string, Scene>

export const getScene = (id: SceneId): Scene | undefined => SCENES[id]

/** Every environment id in the manifest, in manifest order. */
export const sceneIds = (): SceneId[] => Object.keys(SCENES) as SceneId[]

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
