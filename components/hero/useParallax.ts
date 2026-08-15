'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Scroll parallax for the hero layers.
 *
 * Writes `--py` (pixels of travel) onto each element and lets CSS apply the
 * transform, so nothing here reads layout in the scroll handler — the only
 * measurement is the section's offset, taken once per resize. Transform-only,
 * so it never triggers layout or paint, and it runs on rAF so a fast scroll
 * coalesces into one write per frame.
 *
 * Does nothing at all under reduced motion: no listener, no loop, no transform.
 */
export function useParallax(
  sectionRef: RefObject<HTMLElement>,
  layers: { ref: RefObject<HTMLElement>; speed: number }[]
) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return

    const section = sectionRef.current
    if (!section) return

    let top = 0
    let height = 0
    let frame: number | null = null
    let visible = true

    const measure = () => {
      const r = section.getBoundingClientRect()
      top = r.top + window.scrollY
      height = r.height
    }

    const apply = () => {
      frame = null
      if (!visible) return
      // Progress through the section, clamped so layers stop travelling once
      // the hero has fully left the viewport.
      const travelled = Math.max(0, Math.min(window.scrollY - top, height))
      for (const { ref, speed } of layers) {
        ref.current?.style.setProperty('--py', `${(travelled * speed).toFixed(1)}px`)
      }
    }

    const onScroll = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(apply)
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        if (visible) onScroll()
      },
      { rootMargin: '100px' }
    )
    io.observe(section)

    measure()
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [sectionRef, layers])
}
