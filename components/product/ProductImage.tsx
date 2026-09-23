'use client'

import { useState } from 'react'
import { Monogram } from '@/components/brand/Monogram'

/**
 * A product image that can never render as a broken box.
 *
 * Real products whose photography has not landed yet (or whose remote image
 * fails to load) fall back to a composed, on-brand tile — the product's own
 * material colour, a hairline frame, the monogram, and the product name set in
 * the display face — instead of a browser broken-image glyph with the alt text
 * showing through. That keeps the grid clean and honest: the object is real,
 * the picture is simply pending.
 *
 * When a real `src` loads, it covers the tile completely, so nothing here
 * changes the look of a product that already has a photograph.
 */
export function ProductImage({
  src,
  alt,
  materialColor = '#E8E1D4',
  label,
  className = '',
  loading = 'lazy',
  eager = false,
  variant = 'tile',
}: {
  src?: string | null
  alt: string
  materialColor?: string
  /** Shown on the fallback tile; defaults to the alt text. */
  label?: string
  className?: string
  loading?: 'lazy' | 'eager'
  eager?: boolean
  /** `tile` fills a card; `plain` is a transparent, frameless fallback for
      surfaces where the product floats over a scene. */
  variant?: 'tile' | 'plain'
}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // The image only counts as present once it has actually decoded. Until then
  // (and forever, if it fails) the branded tile shows and the <img> is fully
  // transparent, so a broken or slow URL never flashes its alt text.
  const showImage = Boolean(src) && !failed && loaded

  return (
    <span className={`product-image ${className}`.trim()} data-fallback={showImage ? undefined : 'true'}>
      <span
        className={`product-image-fallback${variant === 'plain' ? ' product-image-fallback--plain' : ''}`}
        aria-hidden={showImage ? 'true' : undefined}
        style={{ ['--swatch' as string]: materialColor }}
      >
        <Monogram size={30} className="product-image-mark" />
        <span className="product-image-label">{label ?? alt}</span>
      </span>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : loading}
          decoding="async"
          className="product-image-img"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          data-hidden={showImage ? undefined : 'true'}
        />
      ) : null}
    </span>
  )
}
