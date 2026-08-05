'use client'

import { useEffect } from 'react'

/**
 * Site-wide weighted scrolling via Lenis.
 *
 * Lenis is imported inside the effect so it never reaches the server bundle,
 * and skipped entirely when the visitor prefers reduced motion — hijacking
 * scroll is exactly the kind of motion that setting is asking us not to do.
 *
 * The instance is published on `window.__lenis` so GSAP's ScrollTrigger can
 * drive its updates from the same loop instead of racing it.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let lenis: import('lenis').default | undefined
    let frame = 0
    let cancelled = false

    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return

      lenis = new Lenis({
        duration: 1.4,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 2,
      })

      window.__lenis = lenis

      const raf = (time: number) => {
        lenis?.raf(time)
        frame = requestAnimationFrame(raf)
      }
      frame = requestAnimationFrame(raf)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      lenis?.destroy()
      delete window.__lenis
    }
  }, [])

  return <>{children}</>
}
