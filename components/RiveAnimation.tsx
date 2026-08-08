'use client'

import { Alignment, Fit, Layout, useRive } from '@rive-app/react-canvas'
import { useEffect, useState } from 'react'

interface RiveAnimationProps {
  /** Path to a .riv file under public/rive/. */
  src: string
  stateMachine?: string
  width?: number | string
  height?: number | string
  className?: string
  /** Rendered instead of the canvas when the .riv file is not present. */
  fallback?: React.ReactNode
}

/**
 * Wrapper for Rive's community .riv files.
 *
 * Rive files are binary and must be added by hand — drop them in public/rive/
 * (see README). Until one exists the component renders `fallback`, so a
 * missing file degrades to the designed placeholder instead of a dead canvas.
 */
export function RiveAnimation({
  src,
  stateMachine,
  width = '100%',
  height = 400,
  className = '',
  fallback = null,
}: RiveAnimationProps) {
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(src, { method: 'HEAD' })
      .then((r) => {
        if (!cancelled) setAvailable(r.ok)
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [src])

  const { RiveComponent } = useRive({
    src,
    stateMachines: stateMachine ? [stateMachine] : undefined,
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  })

  if (available === false) return <>{fallback}</>

  return (
    <div className={`rive-stage ${className}`} style={{ width, height }}>
      <RiveComponent style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
