'use client'

import { useCallback, useRef, useState } from 'react'

/** Horizontal travel that commits a swipe. */
const COMMIT = 110
/**
 * A drag is only a swipe if it is clearly horizontal. Below this ratio it is
 * the visitor scrolling the page with a finger that happened to land on the
 * stage, and stealing it would fire Pass or Save by accident.
 */
const HORIZONTAL_RATIO = 1.6
const ZOOM_MIN = 1
const ZOOM_MAX = 2.6

export type SwipeDirection = 'pass' | 'save'

/**
 * Pointer gestures for the showroom stage: swipe left to Pass, right to Save,
 * plus wheel and pinch zoom.
 *
 * Swipes are suppressed entirely while the turntable is engaged — a drag cannot
 * mean "rotate" and "Pass" at the same time, so rotation is an explicit mode
 * and swiping is what a drag means the rest of the time.
 */
export function useStageGestures({
  onSwipe,
  enabled,
}: {
  onSwipe: (dir: SwipeDirection) => void
  enabled: boolean
}) {
  const [dx, setDx] = useState(0)
  const [zoom, setZoom] = useState(1)
  const start = useRef<{ x: number; y: number } | null>(null)
  const decided = useRef<'horizontal' | 'vertical' | null>(null)
  /** Live pointers, so a two-finger pinch can be told from a one-finger swipe. */
  const points = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null)

  const reset = useCallback(() => {
    start.current = null
    decided.current = null
    setDx(0)
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      points.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (points.current.size === 2) {
        const [a, b] = Array.from(points.current.values())
        pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom }
        reset()
        return
      }
      if (!enabled) return
      start.current = { x: e.clientX, y: e.clientY }
      decided.current = null
    },
    [enabled, zoom, reset]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (points.current.has(e.pointerId)) {
        points.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }

      // Pinch wins over swipe whenever two pointers are down.
      if (points.current.size === 2 && pinchStart.current) {
        const [a, b] = Array.from(points.current.values())
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const next = pinchStart.current.zoom * (d / pinchStart.current.distance)
        setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)))
        return
      }

      const s = start.current
      if (!s || !enabled) return
      const moveX = e.clientX - s.x
      const moveY = e.clientY - s.y

      // Decide once, then stick with it — a gesture that starts as a scroll
      // must not turn into a Pass halfway through.
      if (!decided.current && (Math.abs(moveX) > 8 || Math.abs(moveY) > 8)) {
        decided.current =
          Math.abs(moveX) > Math.abs(moveY) * HORIZONTAL_RATIO ? 'horizontal' : 'vertical'
      }
      if (decided.current === 'horizontal') setDx(moveX)
    },
    [enabled]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      points.current.delete(e.pointerId)
      if (points.current.size < 2) pinchStart.current = null

      const s = start.current
      if (s && decided.current === 'horizontal') {
        const moveX = e.clientX - s.x
        if (Math.abs(moveX) > COMMIT) onSwipe(moveX < 0 ? 'pass' : 'save')
      }
      reset()
    },
    [onSwipe, reset]
  )

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      // Only claim the wheel while it actually changes zoom; otherwise the page
      // must keep scrolling normally through the stage.
      const next = zoom - e.deltaY * 0.0015
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
      if (clamped === zoom) return
      setZoom(clamped)
    },
    [zoom]
  )

  return {
    dx,
    zoom,
    resetZoom: () => setZoom(1),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onWheel,
    },
  }
}
