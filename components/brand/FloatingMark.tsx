'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BRAND_NAME } from '@/lib/site-config'
import { LOGO_MIN_URL } from '@/lib/brand-assets'

/** Maximum tilt in degrees, resting and hovered. */
const TILT = 8
const TILT_HOVER = 12
/** Lerp factor — low enough that the mark trails the cursor rather than snapping. */
const EASE = 0.08

/**
 * The emblem in the header.
 *
 * Inline SVG with a specular highlight sweeping across it, a slow float, and a
 * tilt that eases toward the cursor. No WebGL and no Three.js: this is a 40px
 * logo, and a GL context for it would cost more than the entire rest of the
 * header.
 *
 * The seal is inlined rather than loaded as an image so the
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
        <img src={LOGO_MIN_URL} width={44} height={44} alt="" aria-hidden="true" decoding="async" className="brand-emblem floating-mark-img" />
      </span>
    </Link>
  )
}
