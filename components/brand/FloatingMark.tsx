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
 * The flowing-C mark in the header.
 *
 * Inline SVG with a specular highlight sweeping across it, a slow float, and a
 * tilt that eases toward the cursor. No WebGL and no Three.js: this is a 40px
 * logo, and a GL context for it would cost more than the entire rest of the
 * header.
 *
 * The paths are inlined rather than loaded from `/brand/flowing-c.svg` so the
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
        <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">
          <defs>
            {/* The specular sweep. Animating the stop offsets rather than
                transforming the whole gradient keeps it on one paint. */}
            <linearGradient id="ic-sheen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--bone)" stopOpacity="0.55" />
              <stop offset="18%" stopColor="#FFFFFF" stopOpacity="1">
                <animate
                  attributeName="offset"
                  values="-0.35;1.35;1.35"
                  dur="6s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="36%" stopColor="var(--bone)" stopOpacity="0.55">
                <animate
                  attributeName="offset"
                  values="-0.2;1.5;1.5"
                  dur="6s"
                  repeatCount="indefinite"
                />
              </stop>
            </linearGradient>
          </defs>
          <g fill="url(#ic-sheen)" fillRule="evenodd">
            <path d="M47.8 13.4c-1.1 3.2-3.9 4.8-7.5 5.6-5.3 1.2-9.9 3.1-13 7.2-2.6 3.4-3.3 7.4-2.4 11.5.2 1 .6 2 1 3-3.6-2.4-5.8-5.9-6.2-10.3-.5-5.6 2-10.4 6.5-14 3.9-3.1 8.5-4.7 13.4-5.3 2.2-.3 4.4-.3 6.6.1.6.1 1.1.3 1.6.6l-.3.9c0 .2 0 .5.3.7z" />
            <path d="M24.6 40.3c1.9 3.6 5 5.7 8.9 6.6 4.6 1.1 9 .5 13.2-1.6.9-.5 1.8-1.1 2.7-1.7.3 1.6-.2 3-1.1 4.2-1.9 2.6-4.6 4.1-7.6 5-5.4 1.7-10.7 1.4-15.8-1.1-5.1-2.5-8.4-6.6-9.7-12.2-1.4-6.2.2-11.7 4.1-16.6.3-.4.7-.8 1.1-1.1-2 4.1-2.6 8.3-1.6 12.7.5 2.1 1.4 4 2.7 5.7l3.1.1z" />
            <path d="M45.9 9.6c2.4-1.3 4.8-1.6 7.2-.4 1.4.7 2.3 1.9 2.7 3.4-1.9-1.4-3.9-1.9-6.2-1.5-1.4.2-2.6.8-3.7 1.7l-.9-1.4.9-1.8z" />
            <path d="M49.3 44.1c2.1-1.6 3.4-3.6 3.6-6.2 1.7 1.6 2.3 3.5 1.8 5.7-.5 2.3-1.9 3.9-4 4.9-.5.2-1 .4-1.6.5l-.6-2.3.8-2.6z" />
          </g>
        </svg>
      </span>
    </Link>
  )
}
