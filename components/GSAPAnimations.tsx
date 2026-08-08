'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Scroll-driven choreography: headline reveals, staggered grids, hero parallax.
 *
 * Every tween is a `fromTo` with `immediateRender: false`. That matters more
 * than it looks — a plain `gsap.from(..., {opacity: 0})` writes opacity 0 on
 * mount and only clears it when its trigger fires, so anything the trigger
 * misses (short pages, restored scroll position, a resize mid-load) stays
 * permanently invisible. `fromTo` leaves the element at its authored state
 * until the trigger actually runs.
 *
 * Elements animated here must NOT also carry `data-reveal` — the two systems
 * would fight over opacity.
 */
export function GSAPAnimations() {
  const pathname = usePathname()

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger | undefined
    let onLenisScroll: (() => void) | undefined
    let cleanup: (() => void) | undefined
    let cancelled = false

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([{ gsap }, st]) => {
        if (cancelled) return
        ScrollTrigger = st.ScrollTrigger
        gsap.registerPlugin(ScrollTrigger)

        // Keep ScrollTrigger in step with Lenis rather than the native scroll.
        const lenis = window.__lenis
        if (lenis) {
          onLenisScroll = () => ScrollTrigger?.update()
          lenis.on('scroll', onLenisScroll)
        }

        const ctx = gsap.context(() => {
          gsap.utils.toArray<HTMLElement>('.gsap-headline').forEach((el) => {
            gsap.fromTo(
              el,
              { y: 80, opacity: 0 },
              {
                y: 0,
                opacity: 1,
                duration: 1.2,
                ease: 'power4.out',
                immediateRender: false,
                scrollTrigger: { trigger: el, start: 'top 88%', once: true },
              }
            )
          })

          gsap.utils.toArray<HTMLElement>('.gsap-stagger').forEach((container) => {
            const cards = container.querySelectorAll('.product-card, .book-card, .spirit-card')
            if (!cards.length) return
            gsap.fromTo(
              cards,
              { y: 60, opacity: 0 },
              {
                y: 0,
                opacity: 1,
                duration: 0.9,
                stagger: 0.12,
                ease: 'power3.out',
                immediateRender: false,
                scrollTrigger: { trigger: container, start: 'top 85%', once: true },
              }
            )
          })

          gsap.utils.toArray<HTMLElement>('.track-headline').forEach((el, i) => {
            gsap.fromTo(
              el,
              { x: i % 2 === 0 ? -70 : 70, opacity: 0 },
              {
                x: 0,
                opacity: 1,
                duration: 1.3,
                ease: 'power4.out',
                immediateRender: false,
                scrollTrigger: { trigger: el, start: 'top 85%', once: true },
              }
            )
          })

          // Hero: drift the 3D stage as the headline scrolls away.
          const heroCanvas = document.querySelector('.hero-canvas')
          if (heroCanvas) {
            gsap.to(heroCanvas, {
              yPercent: 18,
              ease: 'none',
              scrollTrigger: {
                trigger: '.hero-section',
                start: 'top top',
                end: 'bottom top',
                scrub: true,
              },
            })
          }

          gsap.utils.toArray<HTMLElement>('.gsap-counter').forEach((el) => {
            const target = parseInt(el.dataset.target || '0', 10)
            const counter = { val: 0 }
            gsap.to(counter, {
              val: target,
              duration: 2,
              ease: 'power2.out',
              scrollTrigger: { trigger: el, start: 'top 85%', once: true },
              onUpdate: () => {
                el.textContent = Math.round(counter.val).toLocaleString()
              },
            })
          })
        })

        // Late-loading images change page height; recompute once they settle.
        ScrollTrigger.refresh()
        window.addEventListener('load', () => ScrollTrigger?.refresh())

        cleanup = () => ctx.revert()
      }
    )

    return () => {
      cancelled = true
      const lenis = window.__lenis
      if (lenis && onLenisScroll) lenis.off('scroll', onLenisScroll)
      cleanup?.()
      ScrollTrigger?.getAll().forEach((t) => t.kill())
    }
  }, [pathname])

  return null
}
