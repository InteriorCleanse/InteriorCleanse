'use client'

import Link from 'next/link'
import { useMemo, useRef } from 'react'
import { GlobeCursor } from '@/components/cursor/GlobeCursor'
import type { Scene } from '@/lib/scenes'
import type { Product } from '@/lib/types'
import { FeaturedCard } from './FeaturedCard'
import { Hotspots } from './Hotspots'
import { SceneBackground } from './SceneBackground'
import { useParallax } from './useParallax'

interface EnvironmentHeroProps {
  scene: Scene
  /** `full` fills the viewport (homepage); `band` is a shorter section hero. */
  height?: 'full' | 'band'
  /** Optional product card over the scene. */
  featured?: Product
  /** Replaces hotspots on small screens, where aiming at a crop fails. */
  carousel?: Product[]
  /** The pointer-replacing globe. Reserved for the primary scene per page. */
  cursor?: boolean
  /** Anchor target, so /shop#home can land on an environment band. */
  id?: string
  /**
   * Whether this hero carries the page's h1. A page may show more than one
   * environment — /shop opens with the water garden and closes with the
   * atelier — and only the first may be the h1.
   */
  headingLevel?: 'h1' | 'h2'
}

/**
 * The one hero every environment uses.
 *
 * Three independent layers — A background, B hotspots and card, C interface —
 * driven entirely by a scene from `content/scenes.json`. There is deliberately
 * no second hero component: five environments differ only in their manifest
 * entry and a couple of booleans, and five near-identical components would
 * drift apart within a month.
 *
 * Every media field is optional, so an environment is complete with a poster
 * alone, and complete with neither poster nor video — the painted gradient
 * stands in until an asset lands.
 */
export function EnvironmentHero({
  scene,
  height = 'full',
  featured,
  carousel = [],
  cursor = false,
  id,
  headingLevel = 'h1',
}: EnvironmentHeroProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const Heading = headingLevel

  // Background drifts slower than the page, the copy slightly faster than the
  // background — the depth cue is the difference between them, not the numbers.
  const layers = useMemo(
    () => [
      { ref: bgRef, speed: 0.3 },
      { ref: copyRef, speed: 0.6 },
    ],
    []
  )
  useParallax(stageRef, layers)

  return (
    <>
      <section
        className="residence-hero"
        data-height={height}
        data-cursor="native"
        ref={stageRef}
        id={id}
      >
        {/* LAYER A */}
        <div className="parallax-layer parallax-bg" ref={bgRef}>
          <SceneBackground
            desktopVideo={scene.desktopVideo ?? undefined}
            mobileVideo={scene.mobileVideo ?? undefined}
            webmVideo={scene.webmVideo ?? undefined}
            posterMotion={scene.posterMotion ?? undefined}
            posterImage={scene.posterImage ?? undefined}
            reducedMotionPoster={scene.reducedMotionPoster ?? undefined}
          />
        </div>
        <div className="residence-scrim" aria-hidden="true" />

        {/* LAYER C */}
        <div className="residence-copy parallax-layer" ref={copyRef}>
          <Heading className="residence-headline">
            {scene.headline.map((line) => (
              <span key={line} className="residence-headline-line">
                {line}
              </span>
            ))}
          </Heading>
          <div className="residence-ctas">
            <Link href={scene.primaryCta.href} className="btn-residence-primary">
              {scene.primaryCta.label}
            </Link>
            {scene.secondaryCta ? (
              <Link href={scene.secondaryCta.href} className="btn-residence-ghost">
                {scene.secondaryCta.label}
              </Link>
            ) : null}
          </div>
        </div>

        {/* LAYER B */}
        <Hotspots hotspots={scene.hotspots} />
        {featured ? (
          <div className="featured-slot" data-position={scene.featuredProduct?.position ?? 'bottom-right'}>
            <FeaturedCard product={featured} />
          </div>
        ) : null}

        {cursor ? <GlobeCursor targetRef={stageRef} /> : null}
      </section>

      {carousel.length > 0 ? (
        <section className="hero-carousel" aria-label="Shop the scene">
          <h2 className="hero-carousel-title">Shop the scene</h2>
          <ul className="hero-carousel-track">
            {carousel.map((p) => (
              <li key={p.slug}>
                <Link href={`/shop/${p.slug}/`}>
                  <img src={p.heroImage} alt="" loading="lazy" decoding="async" />
                  <span className="hero-carousel-name">{p.name}</span>
                  <span className="hero-carousel-price">${p.price}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
