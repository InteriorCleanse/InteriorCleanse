'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { CategoryExperience } from '@/lib/category-experience'
import type { DepthLayer } from '@/lib/types'

interface DepthInteractiveProps {
  layers: DepthLayer[]
  alt: string
  experience: CategoryExperience
  /** Eager-load the first few cards in a grid; lazy-load the rest. */
  eager?: boolean
  className?: string
}

/**
 * Mode C — the dimensional fallback every product gets.
 *
 * This is layered depth, perspective tilt, and parallax. It is **not** 3D and
 * is never described as such in the UI. It costs no WebGL context, which is
 * precisely why it is the mode a product grid uses: a hundred cards here are
 * cheaper than one canvas.
 *
 * Motion is written straight to CSS custom properties from the pointer handler
 * rather than through React state, so a hover never triggers a re-render.
 */
export function DepthInteractive({
  layers,
  alt,
  experience,
  eager = false,
  className = '',
}: DepthInteractiveProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  /** Set once we know motion is unwanted — reduced-motion or a coarse pointer. */
  const staticRef = useRef(false)

  const reset = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    el.style.setProperty('--px', '0')
    el.style.setProperty('--py', '0')
  }, [])

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarse = window.matchMedia('(pointer: coarse)')

    // A CSS media query cannot stop a transform written by a pointer handler,
    // so the preference has to be read in JS as well as in the stylesheet.
    const sync = () => {
      staticRef.current = reduced.matches || coarse.matches
      if (staticRef.current) reset()
    }

    sync()
    reduced.addEventListener('change', sync)
    coarse.addEventListener('change', sync)
    return () => {
      reduced.removeEventListener('change', sync)
      coarse.removeEventListener('change', sync)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [reset])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (staticRef.current) return
    const el = rootRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    // Normalised to -1…1 from the centre of the card.
    const px = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const py = ((e.clientY - rect.top) / rect.height) * 2 - 1

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      el.style.setProperty('--px', px.toFixed(3))
      el.style.setProperty('--py', py.toFixed(3))
    })
  }, [])

  return (
    <div
      ref={rootRef}
      className={`depth-stage ${className}`.trim()}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      style={
        {
          '--tilt': `${experience.tiltRange}deg`,
          '--lift': `${experience.liftPx}px`,
          '--travel': `${experience.parallaxPx}px`,
          '--wash': experience.accent,
        } as React.CSSProperties
      }
    >
      <div className="depth-stage-inner">
        {layers.map((layer, i) => (
          <img
            key={layer.src + i}
            src={layer.src}
            // Only the base layer carries the description; the decorative
            // planes above it would otherwise repeat it to a screen reader.
            alt={i === 0 ? alt : ''}
            aria-hidden={i === 0 ? undefined : true}
            loading={eager ? 'eager' : 'lazy'}
            className="depth-layer"
            style={{ '--depth': layer.depth } as React.CSSProperties}
          />
        ))}
        <span className="depth-sheen" aria-hidden="true" />
      </div>
    </div>
  )
}
