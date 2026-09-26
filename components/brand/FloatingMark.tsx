'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BRAND_NAME } from '@/lib/site-config'

/** Maximum tilt in degrees, resting and hovered. */
const TILT = 8
const TILT_HOVER = 12
/** Lerp factor — low enough that the mark trails the cursor rather than snapping. */
const EASE = 0.08

/**
 * The threshold mark in the header.
 *
 * Inline SVG with a specular highlight sweeping across it, a slow float, and a
 * tilt that eases toward the cursor. No WebGL and no Three.js: this is a 40px
 * logo, and a GL context for it would cost more than the entire rest of the
 * header.
 *
 * The paths are inlined rather than loaded from `/brand/monogram.svg` so the
 * mark is in the server HTML and paints with the first frame — an `<img>` would
 * be a second request in front of the most important thing in the header.
 *
 * The tilt loop only runs while the pointer is actually over the header, and
 * stops entirely for touch and reduced motion.
 */
export function FloatingMark() {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const target = useRef({ x: 0, y: 0 })
  const current = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const [hover, setHover] = useState(false)
  const [interactive, setInteractive] = useState(false)

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setInteractive(fine.matches && !reduced.matches)
    sync()
    fine.addEventListener('change', sync)
    reduced.addEventListener('change', sync)
    return () => {
      fine.removeEventListener('change', sync)
      reduced.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    if (!interactive) return
    const header = wrapRef.current?.closest('header')
    const el = wrapRef.current
    if (!header || !el) return

    const max = hover ? TILT_HOVER : TILT

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      // Normalised against the header's own box, so the mark responds to the
      // pointer crossing the header rather than to absolute screen position.
      const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (header.clientWidth / 2)))
      const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (header.clientHeight || 72)))
      target.current = { x: -ny * max, y: nx * max }
      start()
    }

    const onLeave = () => {
      target.current = { x: 0, y: 0 }
      start()
    }

    function start() {
      if (rafRef.current !== null) return
      const tick = () => {
        const c = current.current
        const t = target.current
        c.x += (t.x - c.x) * EASE
        c.y += (t.y - c.y) * EASE
        el!.style.setProperty('--rx', `${c.x.toFixed(2)}deg`)
        el!.style.setProperty('--ry', `${c.y.toFixed(2)}deg`)

        // Settle and stop rather than spinning a frame loop forever.
        if (Math.abs(t.x - c.x) < 0.01 && Math.abs(t.y - c.y) < 0.01) {
          el!.style.setProperty('--rx', `${t.x.toFixed(2)}deg`)
          el!.style.setProperty('--ry', `${t.y.toFixed(2)}deg`)
          rafRef.current = null
          return
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    header.addEventListener('pointermove', onMove)
    header.addEventListener('pointerleave', onLeave)
    return () => {
      header.removeEventListener('pointermove', onMove)
      header.removeEventListener('pointerleave', onLeave)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [interactive, hover])

  return (
    <Link href="/" className="floating-mark" aria-label={`${BRAND_NAME} — home`}>
      <span
        className="floating-mark-inner"
        ref={wrapRef}
        data-hover={hover ? 'true' : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
          <defs>
            {/* The specular sweep. Animating the stop offsets rather than
                transforming the whole gradient keeps it on one paint. */}
            <linearGradient id="ic-sheen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--bone)" stopOpacity="0.85" />
              <stop offset="18%" stopColor="var(--sheen-hi)" stopOpacity="1">
                <animate
                  attributeName="offset"
                  values="-0.35;1.35;1.35"
                  dur="6s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="36%" stopColor="var(--bone)" stopOpacity="0.85">
                <animate
                  attributeName="offset"
                  values="-0.2;1.5;1.5"
                  dur="6s"
                  repeatCount="indefinite"
                />
              </stop>
            </linearGradient>
          </defs>
          {/* The mark: a doorway with the sun rising inside it, swept by the
              specular highlight. Same geometry as brand/Monogram. */}
          <g fill="none" stroke="url(#ic-sheen)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 42 V23 A13 13 0 0 1 37 23 V42" />
            <path d="M8.5 42 H39.5" opacity="0.55" />
            <path d="M17.5 32 H30.5" />
            <g opacity="0.75" strokeWidth="1.7">
              <path d="M24 19.5 V22.5" />
              <path d="M17.6 22.4 L19.8 24.6" />
              <path d="M30.4 22.4 L28.2 24.6" />
            </g>
          </g>
          <path d="M19 32 A5 5 0 0 1 29 32 Z" fill="url(#ic-sheen)" opacity="0.95" />
        </svg>
      </span>
    </Link>
  )
}
