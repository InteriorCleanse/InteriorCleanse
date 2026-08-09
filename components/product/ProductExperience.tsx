import type { StageCategory } from '@/components/3d/ProductGeometry'
import { ProductStageLoader } from '@/components/3d/ProductStageLoader'
import {
  experienceFor,
  resolveDepthLayers,
  resolveRenderMode,
} from '@/lib/category-experience'
import type { Product } from '@/lib/types'
import { DepthInteractive } from './DepthInteractive'
import { Spin360 } from './Spin360'

interface ProductExperienceProps {
  product: Product
  /** `card` is the grid presentation; `stage` is the detail-page hero. */
  variant?: 'card' | 'stage'
  eager?: boolean
}

/**
 * The single dimensional presentation used everywhere a product appears.
 *
 * The mode comes from the product data, so a product moves between depth, 360,
 * and true 3D with a content edit and no code change. Cards are pinned to Mode
 * C regardless of what the data declares — a grid must never open one WebGL
 * context per item, and that rule is enforced here rather than trusted to
 * callers.
 */
export function ProductExperience({
  product,
  variant = 'card',
  eager = false,
}: ProductExperienceProps) {
  const experience = experienceFor(product.category)
  const mode = variant === 'card' ? 'depth_interactive' : resolveRenderMode(product)

  if (mode === 'true_3d') {
    return (
      <ProductStageLoader
        productColor={product.materialColor || '#A9895A'}
        productName={product.name}
        category={product.category as StageCategory}
      />
    )
  }

  if (mode === 'spin_360' && product.spinFrames) {
    return <Spin360 frames={product.spinFrames} alt={product.name} />
  }

  return (
    <DepthInteractive
      layers={resolveDepthLayers(product)}
      alt={product.name}
      experience={experience}
      eager={eager}
      className={variant === 'stage' ? 'depth-stage-large' : ''}
    />
  )
}
