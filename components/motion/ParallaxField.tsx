'use client'

import { useEffect, useRef } from 'react'
import { normalisePointer, parallaxOffset, prefersReducedMotion, type LayerMotion } from '@/lib/motion'

/**
 * Decorative layers that move at different rates as the page scrolls and the
 * pointer moves, so a flat page reads as a space with depth.
 *
 * Everything here is decoration and is treated as such: aria-hidden, no
 * pointer events, behind the content, and frozen under reduced motion. The
 * layers are painted with tokens, so they read in every theme, and they never
 * carry text — the contrast test guards the tokens, not the atmosphere.
 *
 * Updates happen on one animation frame per scroll or pointer event rather
 * than per event, which is the difference between a smooth page and a warm
 * laptop.
 */

export type ParallaxLayer = LayerMotion & {
  /** One of the shapes below. */
  shape: 'orb' | 'ring' | 'grid' | 'shard'
  /** Position as CSS insets, e.g. { top: '10%', left: '70%' }. */
  at: { top?: string; left?: string; right?: string; bottom?: string }
  /** Width in px; height follows the shape. */
  size: number
  /** A theme token name: 'signal', 'cobalt', 'positive', 'negative', 'amber'. */
  tone?: 'signal' | 'cobalt' | 'positive' | 'negative' | 'amber'
}

export function ParallaxField({ layers, className = '' }: { layers: ParallaxLayer[]; className?: string }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = root.current
    if (!node || prefersReducedMotion()) return

    const elements = Array.from(node.querySelectorAll<HTMLElement>('[data-layer]'))
    let frame = 0
    let pointer = { x: 0, y: 0 }

    const paint = () => {
      frame = 0
      const scrollY = window.scrollY
      elements.forEach((element, index) => {
        const layer = layers[index]
        if (!layer) return
        const { x, y } = parallaxOffset(layer, scrollY, pointer)
        // `translate`, not `transform`: the shapes keep their own skew and the
        // two never fight over one property.
        element.style.translate = `${x}px ${y}px`
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onPointer = (event: PointerEvent) => {
      pointer = normalisePointer(
        { x: event.clientX, y: event.clientY },
        { width: window.innerWidth, height: window.innerHeight },
      )
      schedule()
    }
    const onLeave = () => {
      pointer = { x: 0, y: 0 }
      schedule()
    }

    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('pointermove', onPointer, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    paint()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [layers])

  return (
    <div ref={root} aria-hidden="true" className={`parallax-field ${className}`}>
      {layers.map((layer, index) => (
        <span
          key={index}
          data-layer=""
          className={`parallax-layer parallax-${layer.shape} tone-${layer.tone ?? 'signal'}`}
          style={{ ...layer.at, width: layer.size, height: layer.shape === 'shard' ? layer.size * 0.35 : layer.size }}
        />
      ))}
    </div>
  )
}
