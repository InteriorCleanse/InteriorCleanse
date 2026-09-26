'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The wireframe globe that follows the pointer across the whole site.
 *
 * This is the site-wide sibling of GlobeCursor (which only ran over the hero).
 * It listens on the document, replaces the native pointer over open space, and
 * hands the real pointer back over anything you click, type into, or select —
 * a globe sitting on a button or a text field hides the affordance that tells
 * you what it is.
 *
 * SVG, not WebGL: the whole cursor is a handful of ellipses. The spin is a CSS
 * animation on the meridian group, so it runs on the compositor and keeps
 * turning whether or not the pointer moves; the position is written straight to
 * a transform from the pointermove handler, so following the pointer never
 * triggers a React render.
 *
 * It stands down entirely for touch and for reduced motion. `cursor: none` is
 * applied through the html[data-cursor='globe'] hook in globals.css, only while
 * the globe is actually showing, so the native cursor always returns when it
 * stands down.
 */

/** Elements that must keep the real pointer — clicks, typing, and selection. */
const INTERACTIVE =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable="true"], [data-native-cursor]'

/** Zones that keep the globe even over their links, and caption it. */
const LABELLED = '[data-cursor-label]'

/** Draggable "explore" zones that earn the one hint line. */
const DRAGGABLE = '.residence-hero, .stage-container, .spin-viewport, .browser-stack, .showroom-stage, .pedestal'

export function GlobeCursorGlobal() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const [active, setActive] = useState(false)
  const [hint, setHint] = useState(false)
  const [label, setLabel] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setEnabled(fine.matches && !reduced.matches)
    sync()
    fine.addEventListener('change', sync)
    reduced.addEventListener('change', sync)
    return () => {
      fine.removeEventListener('change', sync)
      reduced.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement

    const move = (e: PointerEvent) => {
      const target = e.target as Element | null
      // Inside a labelled zone (a product card, a room) the globe stays, grows,
      // and says what a click does — the caption is the affordance. Form
      // controls still get the real pointer.
      const zone = target?.closest?.(LABELLED) as HTMLElement | null
      const control = target?.closest?.('input, select, textarea, [contenteditable="true"]')
      // A card is one link, so its caption speaks for the whole tile. A room
      // section is not: a button inside it keeps the real pointer.
      const overControl = Boolean(target?.closest?.(INTERACTIVE))
      const zoneIsCard = Boolean(zone?.matches('.product-card, .book-card, .article-card'))
      if (zone && !control && (!overControl || zoneIsCard)) {
        root.dataset.cursor = 'globe'
        setActive(true)
        setHint(false)
        setLabel(zone.dataset.cursorLabel || null)
      } else if (target?.closest?.(INTERACTIVE)) {
        // Over a control, hand the pointer back rather than covering it.
        root.dataset.cursor = 'native'
        setActive(false)
        setLabel(null)
        return
      } else {
        root.dataset.cursor = 'globe'
        setActive(true)
        setLabel(null)
        setHint(Boolean(target?.closest?.(DRAGGABLE)))
      }

      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        const el = cursorRef.current
        if (!el) return
        el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`
      })
    }

    const leave = () => {
      root.dataset.cursor = 'native'
      setActive(false)
    }

    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    window.addEventListener('blur', leave)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
      window.removeEventListener('blur', leave)
      root.dataset.cursor = 'native'
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div
      className="globe-cursor"
      ref={cursorRef}
      data-active={active ? 'true' : undefined}
      data-label={label ? 'true' : undefined}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" width="52" height="52">
        <g fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.9">
          <circle cx="32" cy="32" r="23" />
          {/* Latitudes are fixed; only the meridians rotate, which is what
              reads as a sphere turning rather than a disc spinning. */}
          <ellipse cx="32" cy="32" rx="23" ry="7.5" />
          <ellipse cx="32" cy="32" rx="23" ry="15" />
          <g className="globe-meridians">
            <ellipse cx="32" cy="32" rx="7.5" ry="23" />
            <ellipse cx="32" cy="32" rx="15.5" ry="23" />
            <line x1="32" y1="9" x2="32" y2="55" />
          </g>
        </g>
      </svg>
      <span className="globe-cursor-hint" data-shown={hint || label ? 'true' : undefined}>
        {label ?? 'Drag to explore'}
      </span>
    </div>
  )
}
