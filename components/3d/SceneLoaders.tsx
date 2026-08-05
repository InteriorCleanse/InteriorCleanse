'use client'

import dynamic from 'next/dynamic'
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

export function ScrollGalleryLoader({ products }: { products: Product[] }) {
  return <ScrollGalleryImpl products={products} />
}
