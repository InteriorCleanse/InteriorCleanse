'use client'

import { useEffect, useRef, useState } from 'react'
import { carImage } from '@/lib/assets'
import type { BodyType } from '@/lib/types'
import { CarArt } from './CarArt'

/**
 * The car's photo, with the drawn silhouette underneath until it loads and
 * in its place if it never does. The tint is the car's own colour.
 */
export function CarImage({
  body,
  slug,
  color,
  alt,
  priority = false,
  className = '',
}: {
  body: BodyType
  /** The car's slug, for its own photo; omit for the body-type photo. */
  slug?: string
  color: string
  alt: string
  priority?: boolean
  className?: string
}) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  const img = useRef<HTMLImageElement>(null)
  // An image can finish (or fail) before React hydrates and attaches
  // onLoad/onError; read its settled state once mounted.
  useEffect(() => {
    const el = img.current
    if (el?.complete) setState(el.naturalWidth > 0 ? 'loaded' : 'failed')
  }, [])
  return (
    <div
      className={`car-img ${className}`.trim()}
      style={{ ['--tint' as string]: color }}
      data-loaded={state === 'loaded' ? 'true' : undefined}
      data-failed={state === 'failed' ? 'true' : undefined}
    >
      <div className="car-art" style={{ color }}>
        <CarArt body={body} color={color} />
      </div>
      <img
        ref={img}
        src={carImage(body, slug)}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
    </div>
  )
}
