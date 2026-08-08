'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Ambient page behaviour: the trailing brass cursor dot and the
 * scroll-into-view reveal for anything marked `data-reveal`.
 */
export function Experience() {
  const cursor = useRef<HTMLDivElement>(null)
  const path = usePathname()

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduced) return

    let x = -20
    let y = -20
    let tx = -20
    let ty = -20
    let id = 0

    const move = (e: MouseEvent) => {
      tx = e.clientX
      ty = e.clientY
    }

    const tick = () => {
      x += (tx - x) * 0.12
      y += (ty - y) * 0.12
      if (cursor.current) {
        cursor.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
      id = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', move)
    tick()

    return () => {
      window.removeEventListener('mousemove', move)
      cancelAnimationFrame(id)
    }
  }, [])

  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]')
    if (!els.length) return

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('revealed')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.1 }
    )

    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [path])

  return <div ref={cursor} className="mag-cursor" aria-hidden="true" />
}
