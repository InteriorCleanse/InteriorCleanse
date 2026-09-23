'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Gives the primary calls to action a magnetic pull: while the pointer is near,
 * the control eases a few pixels toward it, then settles back on leave. It is
 * the single interaction that most reads as an award-site, and it is kept in
 * the Premium register — a small pull, no bounce.
 *
 * The handler writes --mx/--my custom properties; the stylesheet turns those
 * into the transform, composed with the press scale, so the pull never fights
 * the button's existing feedback. Mounted once; it re-scans on route change so
 * CTAs on the new page get wired. Stands down for touch and reduced motion.
 */
const SELECTOR = [
  '.btn-residence-primary',
  '.btn-residence-ghost',
  '.btn-primary',
  '.add-to-cart-btn',
  '.nav-cta',
  '.partner-cta:not([data-disabled="true"])',
].join(',')

/** Max pull in px and how strongly the control tracks the pointer. */
const MAX_PULL = 7
const STRENGTH = 0.32

export function MagneticButtons() {
  const pathname = usePathname()

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!fine.matches || reduced.matches) return

    const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))
    const cleanups: Array<() => void> = []

    for (const el of els) {
      el.dataset.magnetic = 'true'
      let raf: number | null = null

      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        const mx = Math.max(-MAX_PULL, Math.min(MAX_PULL, dx * STRENGTH))
        const my = Math.max(-MAX_PULL, Math.min(MAX_PULL, dy * STRENGTH))
        if (raf !== null) cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          el.style.setProperty('--mx', `${mx.toFixed(2)}px`)
          el.style.setProperty('--my', `${my.toFixed(2)}px`)
        })
      }
      const leave = () => {
        if (raf !== null) cancelAnimationFrame(raf)
        el.style.setProperty('--mx', '0px')
        el.style.setProperty('--my', '0px')
      }

      el.addEventListener('pointermove', move)
      el.addEventListener('pointerleave', leave)
      cleanups.push(() => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerleave', leave)
        if (raf !== null) cancelAnimationFrame(raf)
        delete el.dataset.magnetic
        el.style.removeProperty('--mx')
        el.style.removeProperty('--my')
      })
    }

    return () => cleanups.forEach((fn) => fn())
  }, [pathname])

  return null
}
