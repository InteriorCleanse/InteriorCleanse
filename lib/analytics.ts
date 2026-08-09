/**
 * Privacy-respecting event tracking.
 *
 * Two rules govern everything here: no personal data leaves the page, and a
 * broken analytics call can never interrupt a purchase. Every function
 * swallows its own errors — an exception thrown from a tracking call has no
 * business stopping an add-to-cart.
 */

export type AnalyticsEvent =
  | 'category_view'
  | 'product_view'
  | 'product_3d_started'
  | 'product_rotated'
  | 'product_hotspot_opened'
  | 'variant_selected'
  | 'add_to_cart'
  | 'checkout_started'
  | 'purchase_completed'
  | 'amazon_outbound'
  | 'tiktok_outbound'
  | 'ai_project_started'
  | 'ai_generation_submitted'
  | 'ai_generation_completed'
  | 'wallpaper_downloaded'
  | 'connector_sync_failed'

type Props = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Props }) => void
  }
}

/**
 * Records an event. Safe to call from anywhere, including render paths and
 * error handlers — it never throws and never returns a promise to await.
 */
export function track(event: AnalyticsEvent, props?: Props): void {
  try {
    if (typeof window === 'undefined') return

    // Plausible is the configured provider; when it is absent the call is a
    // no-op rather than an error, so the storefront works without analytics.
    if (typeof window.plausible === 'function') {
      window.plausible(event, props ? { props } : undefined)
    }
  } catch {
    /* Analytics must never break shopping. */
  }
}

/** Outbound purchase clicks, which leave the site and end our session. */
export function trackOutbound(destination: 'amazon' | 'tiktok', slug: string): void {
  track(destination === 'amazon' ? 'amazon_outbound' : 'tiktok_outbound', { slug })
}
