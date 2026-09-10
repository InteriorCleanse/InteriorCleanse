'use client'

import { useState } from 'react'
import type { ShowroomProduct } from '@/lib/showroom'
import { StageProduct } from './StageProduct'

/**
 * The pedestal on a product page: the same Layer-3 stage the showroom uses,
 * with one control. Drag rotates only when a turntable exists; otherwise the
 * object stands still and the control is absent rather than disabled — a
 * button for a feature this product does not have is a promise it cannot keep.
 */
export function ProductPedestal({ product }: { product: ShowroomProduct }) {
  const [rotating, setRotating] = useState(false)
  const hasTurntable = product.rotationSequence.length > 1

  return (
    <div className="pedestal" data-rotating={rotating ? 'true' : undefined}>
      <StageProduct product={product} rotating={rotating} />
      {hasTurntable ? (
        <button
          type="button"
          className="pedestal-rotate"
          aria-pressed={rotating}
          onClick={() => setRotating((r) => !r)}
        >
          {rotating ? 'Drag to rotate · done' : '360° · drag to rotate'}
        </button>
      ) : null}
    </div>
  )
}
