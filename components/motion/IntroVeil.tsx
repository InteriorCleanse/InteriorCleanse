'use client'

import { useEffect, useState } from 'react'

/**
 * The first-visit curtain: the threshold mark draws itself, the sun rises
 * inside it, the wordmark settles beneath, and the veil lifts to reveal the
 * residence. Once per session, never under reduced motion.
 *
 * All the choreography is CSS keyframes, so it starts on the very first paint
 * whether or not JavaScript has arrived. The inline script in the root layout
 * sets html[data-intro='skip'] before paint for returning visitors, and this
 * component only records the visit and removes the node once the curtain is
 * up. The hero's own entrance keys off the same html attribute, so the
 * headline waits for the veil on a first visit and does not on the second.
 */
export function IntroVeil() {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    let seen = false
    try {
      seen = Boolean(sessionStorage.getItem('ic_intro'))
    } catch {
      /* private mode: play it once, forget it */
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (seen || reduced) {
      root.dataset.intro = 'skip'
      setGone(true)
      return
    }
    root.dataset.intro = 'playing'
    const t = window.setTimeout(() => {
      root.dataset.intro = 'done'
      try {
        sessionStorage.setItem('ic_intro', '1')
      } catch {
        /* ignore */
      }
      setGone(true)
    }, 2500)
    return () => window.clearTimeout(t)
  }, [])

  if (gone) return null

  return (
    <div className="intro-veil" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path className="veil-draw" d="M11 42 V23 A13 13 0 0 1 37 23 V42" />
        <path className="veil-draw veil-draw--late" d="M8.5 42 H39.5" opacity={0.55} />
        <path className="veil-draw veil-draw--late" d="M17.5 32 H30.5" />
        <path className="veil-sun" d="M19 32 A5 5 0 0 1 29 32 Z" fill="currentColor" stroke="none" />
        <g className="veil-rays" opacity={0.75} strokeWidth={1.5}>
          <path d="M24 19.5 V22.5" />
          <path d="M17.6 22.4 L19.8 24.6" />
          <path d="M30.4 22.4 L28.2 24.6" />
        </g>
      </svg>
      <span className="veil-word">Interior Cleanse</span>
    </div>
  )
}
