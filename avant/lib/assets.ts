/**
 * Image URLs. Each asset resolves to the local copy once it has been landed
 * (content/assets-landed.json), and to the generation CDN until then.
 */

import sources from '@/content/asset-sources.json'
import landed from '@/content/assets-landed.json'

export type AssetName = keyof typeof sources.assets

const landedSet = new Set<string>(landed.landed)

export function asset(name: AssetName): { src: string; alt: string } {
  const a = sources.assets[name]
  return { src: landedSet.has(name) ? a.local : `${sources.cdn}/${a.file}`, alt: a.alt }
}

export function carImage(body: string): string {
  return asset(body as AssetName).src
}

/** Origins the CSP must allow for images. */
export const IMAGE_ORIGINS = [new URL(sources.cdn).origin]
