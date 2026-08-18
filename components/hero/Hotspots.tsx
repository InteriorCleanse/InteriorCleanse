'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import type { Hotspot } from '@/lib/scenes'

/**
 * Layer B — the scene hotspots.
 *
 * Positioned from the manifest as percentages, so they hold their place over
 * the video at any viewport. They are ordinary links in the DOM, never painted
 * into the footage: the scene can be re-shot without touching them, and they
 * remain focusable, crawlable, and readable by a screen reader.
 *
 * Hidden entirely below the mobile breakpoint — pointing at a detail in a
 * letterboxed 9:16 crop does not work, so mobile gets the carousel instead.
 */
export function Hotspots({ hotspots }: { hotspots: Hotspot[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  const layerRef = useRef<HTMLDivElement>(null)

  /**
   * Hides any hotspot that would land on the headline or a CTA.
   *
   * Hotspot coordinates are authored against the photograph, but the copy
   * reflows with the viewport — a position that clears the headline at 1440
   * can sit under it at 1024. Rather than hand-tuning coordinates per
   * breakpoint forever, the collision is measured against the real ink and the
   * offender steps aside. It is only ever hiding a duplicate route: every
   * hotspot's destination is also reachable from the nav and the shop.
   */
  const reflow = useCallback(() => {
    const layer = layerRef.current
    if (!layer) return
    const scene = layer.closest('.residence-hero')
    if (!scene) return

    const ink = Array.from(
      scene.querySelectorAll('.residence-headline-line, .residence-ctas a')
    ).map((e) => e.getBoundingClientRect())
    const pad = 14

    const clashing: string[] = []
    for (const el of Array.from(layer.querySelectorAll<HTMLElement>('[data-hotspot]'))) {
      const r = el.getBoundingClientRect()
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      const hit = ink.some(
        (i) => cx > i.x - pad && cx < i.right + pad && cy > i.y - pad && cy < i.bottom + pad
      )
      if (hit) clashing.push(el.dataset.hotspot!)
    }
    setHidden((prev) =>
      prev.length === clashing.length && prev.every((v, i) => v === clashing[i]) ? prev : clashing
    )
  }, [])

  useEffect(() => {
    reflow()
    window.addEventListener('resize', reflow)
    // Fonts land after first paint and change the headline's width.
    document.fonts?.ready.then(reflow).catch(() => {})
    return () => window.removeEventListener('resize', reflow)
  }, [reflow])

  if (hotspots.length === 0) return null

  return (
    <div className="hotspot-layer" ref={layerRef}>
      {hotspots.map((h) => (
        <Link
          key={h.id}
          href={h.href}
          className="hotspot"
          data-hotspot={h.id}
          data-clashing={hidden.includes(h.id) ? 'true' : undefined}
          aria-hidden={hidden.includes(h.id) ? true : undefined}
          tabIndex={hidden.includes(h.id) ? -1 : undefined}
          style={{ left: `${h.x}%`, top: `${h.y}%` }}
          data-open={open === h.id ? 'true' : undefined}
          onMouseEnter={() => setOpen(h.id)}
          onMouseLeave={() => setOpen((c) => (c === h.id ? null : c))}
          onFocus={() => setOpen(h.id)}
          onBlur={() => setOpen((c) => (c === h.id ? null : c))}
          onClick={() => track('product_hotspot_opened', { id: h.id })}
        >
          <span className="hotspot-dot" aria-hidden="true" />
          <span className="hotspot-label">{h.label}</span>
        </Link>
      ))}
    </div>
  )
}
