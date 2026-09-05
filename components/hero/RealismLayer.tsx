'use client'

import { useEffect, useId, useState } from 'react'

/**
 * The realism layer: film grain and a vignette over AI-generated footage.
 *
 * The clips already carry grain baked in; static grain over a moving image is
 * what gives a composite away, because the noise and the picture stop agreeing
 * with each other. So the grain here is regenerated in discrete steps —
 * `feTurbulence`'s seed advances every 80ms — and it reads as alive rather than
 * as a texture laid on top.
 *
 * Cost is kept flat regardless of viewport: the turbulence is rendered into a
 * small pattern tile, and the full-size rectangle is filled from that tile. A
 * full-viewport `feTurbulence` re-rasterised twelve times a second is the kind
 * of thing that turns a hero into a fan noise on a laptop.
 *
 * Under prefers-reduced-motion the seed stops advancing and the grain stays
 * still — it is still there, the room still reads as filmed, it just does not
 * shimmer. The vignette is unaffected by motion preference.
 */
export function RealismLayer() {
  // Multiple heroes can share a page; every filter needs its own id.
  const uid = useId().replace(/:/g, '')
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setAnimate(!mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return (
    <>
      <svg className="scene-grain" aria-hidden="true" focusable="false">
        <defs>
          <filter id={`grain-${uid}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              stitchTiles="stitch"
              seed="1"
            >
              {animate ? (
                <animate
                  attributeName="seed"
                  // Ten distinct grain fields, 80ms each, then round again.
                  values="1;2;3;4;5;6;7;8;9;10"
                  dur="0.8s"
                  calcMode="discrete"
                  repeatCount="indefinite"
                />
              ) : null}
            </feTurbulence>
            {/* Monochrome: coloured noise reads as sensor error, not film. */}
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <pattern
            id={`grain-tile-${uid}`}
            patternUnits="userSpaceOnUse"
            width="320"
            height="320"
          >
            <rect width="320" height="320" filter={`url(#grain-${uid})`} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grain-tile-${uid})`} />
      </svg>
      <div className="scene-vignette" aria-hidden="true" />
    </>
  )
}
