'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A wireframe globe that replaces the native pointer over the hero.
 *
 * SVG, not WebGL — a decorative cursor has no business owning a GL context, and
 * the whole thing is a handful of ellipses. The spin is a CSS animation on the
 * meridian group, so it runs on the compositor and keeps turning whether or not
 * the pointer is moving; position is written straight to a transform from the
 * pointermove handler, so following the pointer never triggers a React render.
 *
 * It stands down completely for touch, for reduced motion, and over anything
 * interactive — a globe sitting on top of a button hides the affordance that
 * tells you it is a button.
 */

/** Selector for elements that must keep the real pointer. */
const INTERACTIVE = 'a, button, input, select, textarea, [role="button"], .featured-card'

export function GlobeCursor({ targetRef }: { targetRef: React.RefObject<HTMLElement> }) {
  const cursorRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const [active, setActive] = useState(false)
  const [hinted, setHinted] = useState(false)
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
    const host = targetRef.current
    if (!host || !enabled) return

    const move = (e: PointerEvent) => {
      // Over a control, hand the pointer back rather than covering it.
      const overControl = (e.target as Element | null)?.closest?.(INTERACTIVE)
      if (overControl) {
        host.dataset.cursor = 'native'
        setActive(false)
        return
      }
      host.dataset.cursor = 'globe'
      setActive(true)
      setHinted(true)

      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        const el = cursorRef.current
        if (!el) return
        el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`
      })
    }

    const leave = () => {
      host.dataset.cursor = 'native'
      setActive(false)
    }

    host.addEventListener('pointermove', move)
    host.addEventListener('pointerleave', leave)
    return () => {
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
      host.dataset.cursor = 'native'
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [targetRef, enabled])

  if (!enabled) return null

  return (
    <div className="globe-cursor" ref={cursorRef} data-active={active ? 'true' : undefined} aria-hidden="true">
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
      <span className="globe-cursor-hint" data-shown={hinted ? 'true' : undefined}>
        Drag to explore
      </span>
    </div>
  )
}
