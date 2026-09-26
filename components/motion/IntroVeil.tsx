'use client'

import { useEffect, useState } from 'react'
import { LOGO_URL } from '@/lib/brand-assets'

/**
 * The first-visit curtain: the seal draws its rings, the ligature
 * appears inside, the wordmark settles beneath, and the veil lifts to reveal the
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
      <img src={LOGO_URL} width={132} height={132} alt="" className="veil-logo" decoding="async" />
      <span className="veil-word">Interior Cleanse</span>
    </div>
  )
}
