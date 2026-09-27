'use client'

import { useEffect, useRef } from 'react'
import { prefersReducedMotion, tiltFor } from '@/lib/motion'

/**
 * A card that leans a few degrees toward the pointer, like a pane of glass on
 * a desk. The tilt is small on purpose: enough to feel dimensional, not
 * enough to move the text someone is reading. It resets the moment the
 * pointer leaves and never moves under reduced motion.
 */
export function TiltCard({
  children,
  className = '',
  maxDegrees = 6,
}: {
  children: React.ReactNode
  className?: string
  maxDegrees?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || prefersReducedMotion()) return

    let frame = 0
    let pointer: { x: number; y: number } | null = null

    const paint = () => {
      frame = 0
      const rect = node.getBoundingClientRect()
      const { rotateX, rotateY } = tiltFor(pointer, rect, maxDegrees)
      node.style.transform = `perspective(1100px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
      node.style.setProperty('--glare-x', pointer ? `${((pointer.x - rect.left) / rect.width) * 100}%` : '50%')
      node.style.setProperty('--glare-y', pointer ? `${((pointer.y - rect.top) / rect.height) * 100}%` : '50%')
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      schedule()
    }
    const onLeave = () => {
      pointer = null
      schedule()
    }

    node.addEventListener('pointermove', onMove, { passive: true })
    node.addEventListener('pointerleave', onLeave)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [maxDegrees])

  return (
    <div ref={ref} className={`tilt-card ${className}`}>
      {children}
    </div>
  )
}
