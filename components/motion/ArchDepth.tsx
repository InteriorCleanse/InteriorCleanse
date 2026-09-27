'use client'

import { useEffect } from 'react'
import { normalisePointer, prefersReducedMotion } from '@/lib/motion'

/**
 * Pointer depth for the Arch theme's atmosphere.
 *
 * The grid and the aurora already drift on their own. This adds the pointer:
 * two CSS variables on the root, −1..1, that the theme's background layers
 * translate by a few pixels in opposite directions, so moving the mouse
 * moves the room. Nothing is rendered; the component is only a listener,
 * and it does nothing under reduced motion or on a device with no pointer.
 */
export function ArchDepth() {
  useEffect(() => {
    if (prefersReducedMotion()) return
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: fine)').matches) return

    const root = document.documentElement
    let frame = 0
    let pointer = { x: 0, y: 0 }

    const paint = () => {
      frame = 0
      root.style.setProperty('--depth-x', pointer.x.toFixed(3))
      root.style.setProperty('--depth-y', pointer.y.toFixed(3))
    }
    const onMove = (event: PointerEvent) => {
      pointer = normalisePointer(
        { x: event.clientX, y: event.clientY },
        { width: window.innerWidth, height: window.innerHeight },
      )
      if (!frame) frame = requestAnimationFrame(paint)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      root.style.removeProperty('--depth-x')
      root.style.removeProperty('--depth-y')
    }
  }, [])

  return null
}
