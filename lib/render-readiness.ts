import { allProducts } from './content'
import { hasProceduralGeometry, resolveRenderMode } from './category-experience'
import type { Product, RenderMode } from './types'

export type ReadinessIssue =
  | 'missing_poster'
  | 'declared_3d_without_assets'
  | 'declared_spin_without_frames'
  | 'unresolved_channel_link'
  | 'no_stripe_price'
  | 'external_without_url'

export type ProductReadiness = {
  slug: string
  name: string
  mode: RenderMode
  /** True when the mode is achieved by procedural mesh rather than an asset. */
  procedural: boolean
  issues: ReadinessIssue[]
}

/** A channel URL is only real once the owner has replaced the TODO marker. */
const unresolved = (url?: string) => Boolean(url) && url === 'TODO'

export function readinessFor(product: Product): ProductReadiness {
  const mode = resolveRenderMode(product)
  const issues: ReadinessIssue[] = []

  if (!product.posterUrl && !product.heroImage) issues.push('missing_poster')

  if (
    product.renderMode === 'true_3d' &&
    !product.modelUrl &&
    !hasProceduralGeometry(product.category)
  ) {
    issues.push('declared_3d_without_assets')
  }

  if (product.renderMode === 'spin_360' && (product.spinFrames?.length ?? 0) < 2) {
    issues.push('declared_spin_without_frames')
  }

  const { amazonUrl, etsyUrl, tiktokShopUrl, stripePriceId } = product.channels
  if (unresolved(amazonUrl) || unresolved(etsyUrl) || unresolved(tiktokShopUrl)) {
    issues.push('unresolved_channel_link')
  }

  // Only internal checkout needs a Price ID; an external item never touches it.
  const external = product.checkoutMode?.startsWith('external_')
  if (!external && !stripePriceId && !product.comingSoon) {
    issues.push('no_stripe_price')
  }
  if (external && !product.externalPurchaseUrl) {
    issues.push('external_without_url')
  }

  return {
    slug: product.slug,
    name: product.name,
    mode,
    procedural: mode === 'true_3d' && !product.modelUrl,
    issues,
  }
}

/** The whole-catalogue report the admin renders. */
export function renderReadinessReport() {
  const rows = allProducts.map(readinessFor)
  return {
    rows,
    counts: {
      total: rows.length,
      true3d: rows.filter((r) => r.mode === 'true_3d').length,
      spin360: rows.filter((r) => r.mode === 'spin_360').length,
      depth: rows.filter((r) => r.mode === 'depth_interactive').length,
      withIssues: rows.filter((r) => r.issues.length > 0).length,
    },
  }
}
