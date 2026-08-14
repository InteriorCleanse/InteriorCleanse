'use client'

import type { Scene } from '@/lib/scenes'
import type { Product } from '@/lib/types'
import { EnvironmentHero } from './EnvironmentHero'

/**
 * The atrium — the homepage hero.
 *
 * A thin preset over `EnvironmentHero`, not a second implementation: it is the
 * same three layers with the full-height stage, the featured card, the mobile
 * carousel, and the globe cursor all switched on. Every environment shares one
 * component so a fix to the hero is a fix everywhere.
 */
export function ResidenceHero({
  scene,
  featured,
  carousel = [],
}: {
  scene: Scene
  featured?: Product
  carousel?: Product[]
}) {
  return (
    <EnvironmentHero
      scene={scene}
      height="full"
      featured={featured}
      carousel={carousel}
      cursor
    />
  )
}
