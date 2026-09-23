'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Splits an element's text into lines on its existing <br> breaks and wraps
 * each in a clipping mask, so the line can rise into view from behind its own
 * edge. This is the one move that separates editorial typography from a fade.
 *
 * Done at runtime rather than in the markup because the copy already carries
 * the breaks the designer chose, and duplicating them into wrapper spans in
 * every page would be the same information in two places. Element nodes are
 * moved, not re-serialised, so an <em> inside a line survives intact.
 *
 * If this never runs the text is simply visible, which is the correct
 * failure: the animation adds the mask, it does not create the text.
 */
function splitLines(el: HTMLElement): HTMLElement[] {
  if (el.dataset.split === 'true') return Array.from(el.querySelectorAll('.line-inner'))
  const groups: Node[][] = [[]]
  el.childNodes.forEach((node) => {
    if (node.nodeName === 'BR') groups.push([])
    else groups[groups.length - 1].push(node)
  })
  const nonEmpty = groups.filter((g) =>
    g.some((n) => (n.textContent ?? '').trim().length > 0)
  )
  if (!nonEmpty.length) return []
  const frag = document.createDocumentFragment()
  const inners: HTMLElement[] = []
  for (const group of nonEmpty) {
    const line = document.createElement('span')
    line.className = 'line'
    const inner = document.createElement('span')
    inner.className = 'line-inner'
    group.forEach((n) => inner.appendChild(n))
    line.appendChild(inner)
    frag.appendChild(line)
    inners.push(inner)
  }
  el.textContent = ''
  el.appendChild(frag)
  el.dataset.split = 'true'
  return inners
}

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
          // Headlines rise line by line from behind a mask. One tween per
          // headline, staggered across its own lines, so a three-line
          // headline reads as three beats rather than one block moving.
          gsap.utils.toArray<HTMLElement>('.gsap-headline, .track-headline, .manifesto-text').forEach((el) => {
            const lines = splitLines(el)
            if (!lines.length) return
            gsap.fromTo(
              lines,
              { yPercent: 115 },
              {
                yPercent: 0,
                duration: 1.1,
                stagger: 0.09,
                ease: 'power4.out',
                immediateRender: false,
                scrollTrigger: { trigger: el, start: 'top 88%', once: true },
              }
            )
          })

          // Hairline rules draw out from their start edge. Scale only.
          gsap.utils.toArray<HTMLElement>('.rule-draw').forEach((el) => {
            gsap.fromTo(
              el,
              { scaleX: 0 },
              {
                scaleX: 1,
                duration: 1.4,
                ease: 'power3.inOut',
                immediateRender: false,
                scrollTrigger: { trigger: el, start: 'top 92%', once: true },
              }
            )
          })

          // Images are uncovered by a curtain that slides off them, rather
          // than faded in. The curtain is a pseudo-element moved through a
          // custom property, so nothing here paints per frame.
          gsap.utils.toArray<HTMLElement>(
            '.product-card-image, .book-card-image, .article-card-image, .triptych-col'
          ).forEach((el, i) => {
            gsap.fromTo(
              el,
              { '--curtain': '0%' },
              {
                '--curtain': '-101%',
                duration: 1.1,
                delay: (i % 3) * 0.08,
                ease: 'power3.inOut',
                immediateRender: false,
                scrollTrigger: { trigger: el, start: 'top 90%', once: true },
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

          // Triptych: three columns, three speeds. The images are taller than
          // their frames (CSS), so the travel never exposes an edge. Transform
          // only, scrubbed to scroll — no layout, no paint.
          gsap.utils.toArray<HTMLElement>('.triptych-col img').forEach((img, i) => {
            const travel = [14, 8, 11][i % 3]
            gsap.fromTo(
              img,
              { yPercent: -travel },
              {
                yPercent: travel,
                ease: 'none',
                immediateRender: false,
                scrollTrigger: { trigger: '.triptych', start: 'top bottom', end: 'bottom top', scrub: 0.6 },
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
