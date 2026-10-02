/**
 * Image URLs. Each asset resolves to the local copy once it has been landed
 * (content/assets-landed.json), and to the generation CDN until then.
 */

import sources from '@/content/asset-sources.json'
import landed from '@/content/assets-landed.json'

interface Source {
  file: string
  local: string
  alt: string
}

const all = sources.assets as Record<string, Source>
const landedSet = new Set<string>(landed.landed)

export function hasAsset(name: string): boolean {
  return name in all
}

export function asset(name: string): { src: string; alt: string } {
  const a = all[name]
  if (!a) throw new Error(`Unknown asset: ${name}`)
  return { src: landedSet.has(name) ? a.local : `${sources.cdn}/${a.file}`, alt: a.alt }
}

/**
 * The car's own photo when one has been generated for it (`car-<slug>`),
 * otherwise the generic photo for its body type.
 */
export function carImage(body: string, slug?: string): string {
  if (slug && hasAsset(`car-${slug}`)) return asset(`car-${slug}`).src
  return asset(body).src
}

/** Origins the CSP must allow for images. */
export const IMAGE_ORIGINS = [new URL(sources.cdn).origin]
