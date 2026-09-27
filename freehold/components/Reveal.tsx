'use client'

import { useEffect } from 'react'

/**
 * Adds `.in` to every `.rv` element as it enters the viewport, once.
 * IntersectionObserver only; no scroll listeners. Under reduced motion the
 * CSS already renders everything in its final state.
 */
export function Reveal() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const els = Array.from(document.querySelectorAll<HTMLElement>('.rv'))
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement
            const i = Number(el.dataset.i || 0)
            el.style.transitionDelay = `${Math.min(i, 6) * 70}ms`
            el.classList.add('in')
            io.unobserve(el)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return null
}
