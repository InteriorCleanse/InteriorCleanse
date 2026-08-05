'use client'

import dynamic from 'next/dynamic'
import type { StageCategory } from './ProductGeometry'

/**
 * Client boundary for the 3D viewer.
 *
 * `ssr: false` is only legal inside a Client Component, so the server pages
 * import this wrapper rather than calling next/dynamic themselves.
 */
const ProductStage = dynamic(
  () => import('./ProductStage').then((m) => m.ProductStage),
  {
    ssr: false,
    loading: () => <div className="stage-fallback">Preparing 3D object…</div>,
  }
)

export function ProductStageLoader(props: {
  productColor?: string
  productName: string
  category: StageCategory
}) {
  return <ProductStage {...props} />
}
