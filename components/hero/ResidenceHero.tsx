'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { GlobeCursor } from '@/components/cursor/GlobeCursor'
import type { Scene } from '@/lib/scenes'
import type { Product } from '@/lib/types'
import { FeaturedCard } from './FeaturedCard'
import { Hotspots } from './Hotspots'
import { SceneBackground } from './SceneBackground'

interface ResidenceHeroProps {
  scene: Scene
  featured?: Product
  /** Products offered in the mobile carousel, which replaces the hotspots. */
  carousel?: Product[]
}

/**
 * The residence hero, built as three independent layers:
 *
 *   A — background (poster, optionally upgraded to video)
 *   B — hotspots and the featured card, positioned from the manifest
 *   C — headline, CTAs
 *
 * Nothing in B or C is ever baked into the footage. The scene can be re-shot,
 * or arrive months from now, without touching a line of the interface — and
 * with no video present at all the hero is still complete and shoppable.
 */
export function ResidenceHero({ scene, featured, carousel = [] }: ResidenceHeroProps) {
  const stageRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <section className="residence-hero" ref={stageRef} data-cursor="native">
        {/* LAYER A */}
        <SceneBackground
          desktopVideo={scene.desktopVideo}
          mobileVideo={scene.mobileVideo}
          posterImage={scene.posterImage}
          reducedMotionPoster={scene.reducedMotionPoster}
        />
        <div className="residence-scrim" aria-hidden="true" />

        {/* LAYER C */}
        <div className="residence-copy">
          <h1 className="residence-headline">
            {scene.headline.map((line, i) => (
              <span key={line} className="residence-headline-line" style={{ '--i': i } as React.CSSProperties}>
                {line}
              </span>
            ))}
          </h1>
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
          <div className="featured-slot" data-position={scene.featuredProduct?.position}>
            <FeaturedCard product={featured} />
          </div>
        ) : null}

        <GlobeCursor targetRef={stageRef} />
      </section>

      {/* Hotspots do not survive a 9:16 crop, so small screens get a real
          carousel instead of a scene they cannot aim at. */}
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
