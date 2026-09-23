'use client'

import { useEffect } from 'react'

/**
 * A hairline brass progress line pinned to the very top of the viewport that
 * fills as the page scrolls — an ambient, Framer-style read of "how far in am
 * I". Driven by a single CSS custom property written from a rAF-throttled
 * passive scroll listener and applied as scaleX, so it stays on the compositor
 * and never lays out or paints per frame.
 *
 * It reads window scroll, which Lenis drives, so it stays in step with the
 * smooth scroll without subscribing to it. It stands down for reduced motion.
 */
export function ScrollProgress() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bar = document.getElementById('scroll-progress')
    if (!bar) return
    let ticking = false

    const update = () => {
      ticking = false
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      bar.style.transform = `scaleX(${p.toFixed(4)})`
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return <div id="scroll-progress" className="scroll-progress" aria-hidden="true" />
}
