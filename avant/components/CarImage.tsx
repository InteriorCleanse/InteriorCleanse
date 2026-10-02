'use client'

import { useEffect, useRef, useState } from 'react'
import type { BodyType } from '@/lib/types'
import { CarArt } from './CarArt'

/**
 * A listing's cover photo: always the host's own photo of that car. With no
 * photo (sample listings, or a host who has not uploaded yet) it shows a
 * plain drawing of the body type with a label saying so. Never a stock or
 * generated picture standing in for the real car.
 */
export function CarImage({
  body,
  color,
  alt,
  photo,
  sample = false,
  priority = false,
  className = '',
}: {
  body: BodyType
  color: string
  alt: string
  /** The host's photo URL, if they have uploaded one. */
  photo?: string | null
  sample?: boolean
  priority?: boolean
  className?: string
}) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(photo ? 'loading' : 'failed')
  const img = useRef<HTMLImageElement>(null)
  // An image can finish (or fail) before React hydrates and attaches
  // onLoad/onError; read its settled state once mounted.
  useEffect(() => {
    const el = img.current
    if (!photo) setState('failed')
    else if (el?.complete) setState(el.naturalWidth > 0 ? 'loaded' : 'failed')
    else setState('loading')
  }, [photo])
  return (
    <div
      className={`car-img ${className}`.trim()}
      data-loaded={state === 'loaded' ? 'true' : undefined}
      data-failed={state === 'failed' ? 'true' : undefined}
    >
      <div className="car-art" style={{ color }}>
        <CarArt body={body} color={color} />
      </div>
      {state === 'failed' ? <span className="car-img-note">{sample ? 'Sample listing · no photos' : 'Photos coming soon'}</span> : null}
      {photo ? (
        <img
          ref={img}
          src={photo}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      ) : null}
    </div>
  )
}
