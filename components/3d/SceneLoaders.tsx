'use client'

import dynamic from 'next/dynamic'
import { InView } from '@/components/InView'
import type { Product } from '@/lib/types'

/**
 * Client boundaries for the WebGL scenes.
 *
 * Server Components cannot pass `ssr: false` to next/dynamic, so every 3D
 * scene enters the tree through one of these wrappers.
 */

const HeroSceneImpl = dynamic(() => import('./HeroScene').then((m) => m.HeroScene), {
  ssr: false,
  loading: () => <div className="hero-canvas" aria-hidden="true" />,
})

const ScrollGalleryImpl = dynamic(
  () => import('./ScrollGallery').then((m) => m.ScrollGallery),
  {
    ssr: false,
    loading: () => <div style={{ height: '100vh', background: '#080806' }} />,
  }
)

export function HeroSceneLoader() {
  return <HeroSceneImpl />
}

/**
 * The scroll gallery's WebGL context — and the Three.js chunk behind it — must
 * not exist until the visitor actually reaches it.
 *
 * rootMargin is 0 deliberately. The trust strip above the gallery is only 84px
 * tall, so the gallery's top edge sits barely below the fold; any positive
 * margin mounts it on first load and undoes the whole point. The placeholder is
 * a full-height panel, so there is no shift when the scene arrives.
 */
export function ScrollGalleryLoader({ products }: { products: Product[] }) {
  return (
    <InView
      rootMargin="0px"
      placeholder={<div style={{ height: '100vh', background: '#080806' }} aria-hidden="true" />}
    >
      <ScrollGalleryImpl products={products} />
    </InView>
  )
}
