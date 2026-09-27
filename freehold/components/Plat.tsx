'use client'

import { useEffect, useRef } from 'react'

/**
 * The plat: a survey drawing of a plot, the thing a freehold is.
 * Server-renders complete (screenshot-safe, no-JS safe). With JS and no
 * reduced-motion preference, the boundary draws itself, the monuments land,
 * the labels settle, and the signature signs last. The whole drawing tilts a
 * few degrees toward the pointer, transform only.
 */
export function Plat() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let ctx: { revert: () => void } | undefined
    let cleanupTilt = () => {}
    let cancelled = false

    import('gsap').then(({ gsap }) => {
      if (cancelled) return
      ctx = gsap.context(() => {
        const paths = gsap.utils.toArray<SVGPathElement>('.draw')
        paths.forEach((p) => {
          const len = p.getTotalLength()
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len })
        })
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        tl.to('.boundary', { strokeDashoffset: 0, duration: 1.8 })
          .to('.footprint', { strokeDashoffset: 0, duration: 1.1 }, '-=1.0')
          .fromTo('.monument', { scale: 0, transformOrigin: 'center' }, { scale: 1, duration: 0.5, stagger: 0.08 }, '-=1.2')
          .fromTo('.label', { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05 }, '-=0.6')
          .to('.signature', { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, '-=0.2')
          .fromTo('.seal', { scale: 0, transformOrigin: 'center' }, { scale: 1, duration: 0.5, ease: 'back.out(2)' }, '-=0.3')

        const rx = gsap.quickTo(el, 'rotateX', { duration: 0.8, ease: 'power3.out' })
        const ry = gsap.quickTo(el, 'rotateY', { duration: 0.8, ease: 'power3.out' })
        const onMove = (e: PointerEvent) => {
          const r = el.getBoundingClientRect()
          const px = (e.clientX - r.left) / r.width - 0.5
          const py = (e.clientY - r.top) / r.height - 0.5
          ry(px * 6)
          rx(-py * 6)
        }
        const onLeave = () => { rx(0); ry(0) }
        const zone = el.parentElement || el
        zone.addEventListener('pointermove', onMove)
        zone.addEventListener('pointerleave', onLeave)
        cleanupTilt = () => {
          zone.removeEventListener('pointermove', onMove)
          zone.removeEventListener('pointerleave', onLeave)
        }
      }, el)
    })

    return () => {
      cancelled = true
      cleanupTilt()
      ctx?.revert()
    }
  }, [])

  return (
    <div ref={root} className="w-full" style={{ transformStyle: 'preserve-3d', perspective: '1200px' }}>
      <svg
        viewBox="0 0 600 600"
        className="w-full h-auto"
        role="img"
        aria-label="A survey drawing of a plot of land, its boundary, monuments and signature. The thing a freehold is."
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--hairline)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* faint grid of the survey sheet */}
        {Array.from({ length: 11 }).map((_, i) => (
          <g key={i} stroke="var(--hairline)" strokeWidth="0.5" opacity="0.7">
            <line x1={40 + i * 52} y1="40" x2={40 + i * 52} y2="560" />
            <line x1="40" y1={40 + i * 52} x2="560" y2={40 + i * 52} />
          </g>
        ))}

        {/* building footprint */}
        <rect x="228" y="228" width="150" height="112" fill="url(#hatch)" />
        <path className="draw footprint" d="M228 228 H378 V340 H228 Z" stroke="var(--graphite)" strokeWidth="1.2" />

        {/* boundary */}
        <path className="draw boundary" d="M120 92 L472 70 L522 402 L300 522 L82 432 Z" stroke="var(--graphite)" strokeWidth="2" />

        {/* monuments */}
        {[[120, 92], [472, 70], [522, 402], [300, 522], [82, 432]].map(([x, y]) => (
          <g key={`${x}-${y}`} className="monument">
            <circle cx={x} cy={y} r="5.5" fill="var(--paper)" stroke="var(--graphite)" strokeWidth="1.5" />
            <circle cx={x} cy={y} r="1.6" fill="var(--graphite)" />
          </g>
        ))}

        {/* bearings and distances */}
        <g className="font-mono" fontSize="10" fill="var(--stone)" letterSpacing="0.6">
          <text className="label" x="250" y="66" textAnchor="middle" transform="rotate(-3.6 250 66)">N 86°24′ E · 352.6′</text>
          <text className="label" x="514" y="240" textAnchor="middle" transform="rotate(81.4 514 240)">S 08°36′ E · 335.7′</text>
          <text className="label" x="420" y="480" textAnchor="middle" transform="rotate(28.4 420 480)">S 61°36′ W · 252.3′</text>
          <text className="label" x="176" y="494" textAnchor="middle" transform="rotate(-22.4 176 494)">N 67°36′ W · 236.0′</text>
          <text className="label" x="88" y="262" textAnchor="middle" transform="rotate(-96.4 88 262)">N 06°24′ E · 342.1′</text>
          <text className="label" x="303" y="290" textAnchor="middle" fill="var(--graphite)">RESIDENCE</text>
        </g>

        {/* north arrow */}
        <g className="label" stroke="var(--graphite)" strokeWidth="1.2">
          <line x1="548" y1="150" x2="548" y2="96" />
          <path d="M548 96 L542 110 L548 106 L554 110 Z" fill="var(--graphite)" />
        </g>
        <text className="label font-mono" x="548" y="168" textAnchor="middle" fontSize="10" fill="var(--stone)">N</text>

        {/* title block */}
        <g className="label font-mono" fontSize="10" fill="var(--stone)" letterSpacing="0.8">
          <text x="62" y="556">PLAT OF SURVEY</text>
          <text x="62" y="572">PARCEL 1 · FREEHOLD ESTATE</text>
          <text x="62" y="588">SCALE 1:200</text>
        </g>

        {/* signature in ink, then the seal */}
        <path
          className="draw signature"
          d="M372 562 c 14 -26 28 -30 34 -12 c 4 12 -6 24 -2 26 c 10 4 22 -30 34 -30 c 10 0 4 22 10 24 c 8 2 18 -22 30 -20 c 12 2 6 26 20 22 c 12 -4 18 -16 34 -18"
          stroke="var(--ink)"
          strokeWidth="1.8"
        />
        <circle className="seal" cx="548" cy="548" r="6" fill="var(--ink)" />
      </svg>
    </div>
  )
}
