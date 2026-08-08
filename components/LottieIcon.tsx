'use client'

import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { useEffect, useState } from 'react'

export type LottieIconName =
  | 'book'
  | 'sparkle'
  | 'flame'
  | 'star'
  | 'envelope'
  | 'diamond'

interface LottieIconProps {
  /** One of the generated icons in public/animations, or an explicit src. */
  name?: LottieIconName
  src?: string
  width?: number
  height?: number
  loop?: boolean
  autoplay?: boolean
  className?: string
  /** Shown until the animation is ready, and permanently if it fails. */
  fallback?: React.ReactNode
}

export function LottieIcon({
  name,
  src,
  width = 120,
  height = 120,
  loop = true,
  autoplay = true,
  className = '',
  fallback = <span aria-hidden="true">◇</span>,
}: LottieIconProps) {
  const url = src ?? (name ? `/animations/${name}.json` : undefined)
  const [failed, setFailed] = useState(!url)

  // The player fetches its WASM renderer at runtime; if that or the animation
  // itself is unreachable, fall back to the mark rather than a blank hole.
  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url, { method: 'HEAD' })
      .then((r) => {
        if (!cancelled && !r.ok) setFailed(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (failed || !url) {
    return (
      <span
        className={`lottie-fallback ${className}`}
        style={{ width, height }}
        aria-hidden="true"
      >
        {fallback}
      </span>
    )
  }

  return (
    <div className={`lottie-icon ${className}`} style={{ width, height }} aria-hidden="true">
      <DotLottieReact
        src={url}
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
