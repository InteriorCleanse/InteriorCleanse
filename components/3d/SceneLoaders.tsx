'use client'

import dynamic from 'next/dynamic'
import { ProductReel } from '@/components/ProductReel'
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

export function HeroSceneLoader() {
  return <HeroSceneImpl />
}

/**
 * The homepage reel. Once a WebGL scene behind an IntersectionObserver gate;
 * now plain images and CSS (see components/ProductReel.tsx), so it renders on
 * the server, needs no gate, and pulls no Three.js chunk onto the homepage.
 * The export name stays so the page does not have to know the difference.
 */
export function ScrollGalleryLoader({ products }: { products: Product[] }) {
  return <ProductReel products={products} />
}
