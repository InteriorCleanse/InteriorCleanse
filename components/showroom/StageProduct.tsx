'use client'

import { useEffect, useRef, useState } from 'react'
import { ProductImage } from '@/components/product/ProductImage'
import { SIZE_PRESENTATION, type ShowroomProduct } from '@/lib/showroom'

/**
 * LAYER 3 — the replaceable product media on the pedestal.
 *
 * Media is chosen by what actually exists, in descending fidelity: a GLB once
 * one is supplied and the product is selected, then a turntable once the
 * visitor asks to rotate, then a transparent cut-out, then the flat catalogue
 * image. Nothing is invented to fill the gap — with no media the pedestal
 * stands empty, which is the specified state.
 *
 * The contact shadow is a separate element scaled to the size class, so the
 * product reads as standing on the pedestal rather than pasted over it. A flat
 * catalogue image on a white plate cannot do that, so it is rendered as a
 * framed card on the plinth instead of pretending to be a cut-out.
 */
export function StageProduct({
  product,
  rotating,
  zoom = 1,
  dx = 0,
}: {
  product: ShowroomProduct | null
  /** True while the 360 mode is engaged; drags then rotate instead of swiping. */
  rotating: boolean
  zoom?: number
  /** Live horizontal swipe offset, so the object tracks the finger. */
  dx?: number
}) {
  const [frame, setFrame] = useState(0)
  const dragRef = useRef<{ x: number; frame: number } | null>(null)

  const size = SIZE_PRESENTATION[product?.sizeClass ?? 'medium']
  const frames = product?.rotationSequence ?? []
  const hasTurntable = frames.length > 1

  useEffect(() => setFrame(0), [product?.id])

  if (!product) {
    return (
      <div className="stage-empty" role="status">
        <div className="stage-pedestal" aria-hidden="true">
          <span className="stage-shadow" style={{ '--shadow-scale': 0.7 } as React.CSSProperties} />
        </div>
        <p className="stage-empty-copy">Select a product to begin.</p>
      </div>
    )
  }

  // Turntable dragging only applies while 360 mode is engaged — otherwise the
  // gesture belongs to Pass/Save.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!hasTurntable || !rotating) return
    dragRef.current = { x: e.clientX, frame }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const step = Math.round((e.clientX - d.x) / 12)
    setFrame((((d.frame + step) % frames.length) + frames.length) % frames.length)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
  }

  const media = hasTurntable && rotating ? frames[frame] : product.transparentImage

  return (
    <div className="stage-product">
      <div
        className="stage-media"
        style={
          {
            '--max-h': size.maxHeight,
            '--zoom': zoom,
            '--swipe': `${dx}px`,
          } as React.CSSProperties
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-rotatable={hasTurntable && rotating ? 'true' : undefined}
      >
        {/* Descending fidelity: a rotation frame or cut-out floats on the
            plinth; otherwise the flat catalogue image; otherwise the branded
            stand-in. Never a broken box — the product is real, the photograph
            is simply pending. */}
        <ProductImage
          src={media ?? product.productImage}
          alt=""
          label={product.name}
          variant="plain"
        />
      </div>

      <span
        className="stage-shadow"
        style={{ '--shadow-scale': size.shadowScale } as React.CSSProperties}
        aria-hidden="true"
      />

      {hasTurntable ? (
        <p className="stage-hint">{rotating ? '360° · Drag to rotate' : 'Drag to Rotate'}</p>
      ) : null}
    </div>
  )
}
