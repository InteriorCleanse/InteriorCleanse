'use client'

import { ContactShadows } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import Link from 'next/link'
import { Suspense, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Product } from '@/lib/types'
import { ProductBody, type StageCategory } from './ProductGeometry'
import { StudioEnvironment } from './StudioEnvironment'

const SPACING = 9

/**
 * One product in the scrolling reel.
 *
 * Position is driven from a ref rather than React state: scroll fires far more
 * often than we'd ever want to re-render, so the scene reads the latest
 * progress each frame and the DOM only re-renders when the *active index*
 * changes.
 */
function GalleryItem({
  product,
  index,
  progress,
}: {
  product: Product
  index: number
  progress: React.MutableRefObject<number>
}) {
  const group = useRef<THREE.Group>(null)

  useFrame((state, delta) => {
    if (!group.current) return
    const offset = progress.current - index

    // Recede on BOTH sides of active rather than travelling past the camera:
    // an item that crosses the near plane balloons to fill the frame before it
    // disappears. Peak size is therefore always the z=0 framing we tuned for.
    const z = -Math.abs(offset) * SPACING
    const x = offset * 1.4

    group.current.position.z = THREE.MathUtils.damp(group.current.position.z, z, 6, delta)
    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, x, 6, delta)
    group.current.rotation.y += delta * 0.25
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.8 + index) * 0.06

    // Beyond this the fog has already swallowed it — stop drawing it.
    group.current.visible = Math.abs(offset) < 1.8
  })

  return (
    <group ref={group} position={[0, 0, -Math.abs(index) * SPACING]}>
      <ProductBody
        category={product.category as StageCategory}
        color={product.materialColor || '#A9895A'}
      />
    </group>
  )
}

function GalleryScene({
  products,
  progress,
}: {
  products: Product[]
  progress: React.MutableRefObject<number>
}) {
  return (
    <>
      {/* Fog does the fading for us — objects dissolve into the backdrop
          instead of needing per-material transparency. */}
      {/* Near plane sits just past the active item (camera z 6.6) so it stays
          crisp, while the next one dissolves in from the dark. */}
      <fog attach="fog" args={['#080806', 7.5, 17]} />
      <color attach="background" args={['#080806']} />

      <ambientLight intensity={0.18} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-3, 2, 4]} color="#A9895A" intensity={1} />

      {products.map((product, i) => (
        <GalleryItem key={product.slug} product={product} index={i} progress={progress} />
      ))}

      <ContactShadows
        position={[0, -1.5, 0]}
        opacity={0.45}
        scale={9}
        blur={3}
        far={3}
        color="#000000"
      />
      <StudioEnvironment />

      <EffectComposer>
        <Bloom intensity={0.35} luminanceThreshold={0.92} luminanceSmoothing={0.25} mipmapBlur />
        <Vignette offset={0.15} darkness={0.6} />
      </EffectComposer>
    </>
  )
}

export function ScrollGallery({ products }: { products: Product[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const progress = useRef(0)

  useEffect(() => {
    if (!products.length) return

    const handleScroll = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const range = el.offsetHeight - window.innerHeight
      if (range <= 0) return

      const scrolled = THREE.MathUtils.clamp(-rect.top / range, 0, 1)
      // Map 0..1 across the gaps between products, not the products themselves,
      // so the first and last both get a full beat on screen.
      const p = scrolled * (products.length - 1)
      progress.current = p

      const next = Math.round(p)
      setActiveIndex((prev) => (prev === next ? prev : next))
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [products.length])

  const scrollToIndex = (i: number) => {
    const el = containerRef.current
    if (!el || products.length < 2) return
    const range = el.offsetHeight - window.innerHeight
    const top = el.offsetTop + (i / (products.length - 1)) * range
    window.scrollTo({ top, behavior: 'smooth' })
  }

  if (!products.length) return null
  const active = products[activeIndex]

  return (
    <div
      ref={containerRef}
      className="scroll-gallery"
      style={{ height: `${products.length * 100 + 60}vh` }}
    >
      <div className="scroll-gallery-sticky">
        <div className="scroll-gallery-canvas-col">
          <Canvas
            shadows
            dpr={[1, 1.75]}
            camera={{ position: [0, 0.3, 6.6], fov: 40 }}
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.95,
            }}
            aria-label="Scrolling 3D product gallery"
          >
            <Suspense fallback={null}>
              <GalleryScene products={products} progress={progress} />
            </Suspense>
          </Canvas>
        </div>

        <div className="scroll-gallery-info-col">
          <div className="gallery-counter" key={`counter-${activeIndex}`}>
            {String(activeIndex + 1).padStart(2, '0')}
          </div>
          <div className="gallery-info-body" key={`info-${activeIndex}`}>
            <p className="eyebrow" style={{ marginBottom: '1rem' }}>
              {active.category} · InteriorCleanse
            </p>
            <h3 className="gallery-product-name">{active.name}</h3>
            <p className="gallery-product-tagline">{active.tagline}</p>
            <Link href={`/shop/${active.slug}/`} className="gallery-explore-btn">
              Explore product →
            </Link>
          </div>
        </div>

        <div className="gallery-dots">
          {products.map((p, i) => (
            <button
              key={p.slug}
              className={`gallery-dot ${i === activeIndex ? 'active' : ''}`}
              aria-label={`View ${p.name}`}
              onClick={() => scrollToIndex(i)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
