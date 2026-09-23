'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { Product } from '@/lib/types'

/**
 * The homepage product reel: a pinned section the visitor scrolls through,
 * one product at a time, with a counter, the name, and a way in.
 *
 * This replaces a WebGL gallery. That version rendered procedural stand-in
 * shapes with shadows, contact shadows, bloom, and a vignette through a
 * post-processing chain, at up to 1.75× device pixels, every frame, for five
 * and a half screens of scrolling — and the products it stood in for moved to
 * image-based presentation long ago. Measured on the production build it was
 * the main-thread cost during scroll. This reel is images, CSS transitions,
 * and one passive scroll handler that writes a CSS variable. Nothing here
 * rasterises per frame.
 *
 * Structure is unchanged for the reader: same section, same counter and copy,
 * same dots, same links. The products' own photographs stand where the shapes
 * were, which is also more honest.
 */
export function ProductReel({ products }: { products: Product[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!products.length) return
    let frame: number | null = null

    const measure = () => {
      frame = null
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const range = el.offsetHeight - window.innerHeight
      if (range <= 0) return
      const scrolled = Math.min(1, Math.max(0, -rect.top / range))
      // 0..1 across the gaps between products, so first and last get a full beat.
      const p = scrolled * (products.length - 1)
      const next = Math.round(p)
      setActiveIndex((prev) => (prev === next ? prev : next))
      // Fractional position drives a small drift on the stage; written as a
      // variable so the browser animates a transform and React never re-renders.
      stageRef.current?.style.setProperty('--reel-p', (p - next).toFixed(3))
    }

    const onScroll = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame !== null) cancelAnimationFrame(frame)
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
    <section
      ref={containerRef}
      className="scroll-gallery"
      style={{ height: `${products.length * 100 + 60}vh` }}
      aria-label="Featured products"
    >
      <div className="scroll-gallery-sticky">
        <h2 className="sr-only">Featured products</h2>
        <div className="reel-stage" ref={stageRef} aria-hidden="true">
          {products.map((p, i) => (
            <img
              key={p.slug}
              className="reel-image"
              data-active={i === activeIndex ? 'true' : undefined}
              data-side={i < activeIndex ? 'before' : i > activeIndex ? 'after' : undefined}
              src={p.heroImage}
              alt=""
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          ))}
          <span className="reel-shadow" />
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
    </section>
  )
}
