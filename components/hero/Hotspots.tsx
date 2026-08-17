'use client'

import Link from 'next/link'
import { useState } from 'react'
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

  if (hotspots.length === 0) return null

  return (
    <div className="hotspot-layer">
      {hotspots.map((h) => (
        <Link
          key={h.id}
          href={h.href}
          className="hotspot"
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
