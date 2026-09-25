/**
 * Series colours.
 *
 * These are the validated categorical slots from the data-viz reference
 * palette, not the product's UI accents. Chrome colours (cyan, cobalt, amber)
 * carry interface meaning; reusing them for data identity makes "is this a
 * series or a button?" ambiguous, and they were never checked for
 * colour-vision separation against each other.
 *
 * Validated with scripts/validate_palette.js: all checks pass in both modes on
 * the adjacent pairlist. Light mode raises a contrast WARN on the aqua and
 * yellow slots, which obliges visible relief — every chart here ships a legend,
 * direct labels, and a table view, so that obligation is met.
 *
 * Assign slots in fixed order and never cycle. Past four series, fold the tail
 * into "Other" rather than inventing a fifth hue.
 */

export const SERIES_SLOTS = 4 as const

/**
 * Slot n → a usable CSS colour.
 *
 * The custom properties hold bare RGB triplets ("42 120 214") so Tailwind can
 * apply an alpha channel to them. That means they must be wrapped in rgb()
 * before use as a paint value — passing the raw triplet to a `fill` silently
 * renders nothing, which is exactly how a chart ends up grey.
 */
export function seriesVar(index: number, alpha?: number): string {
  const slot = (index % SERIES_SLOTS) + 1
  return alpha === undefined
    ? `rgb(var(--series-${slot}))`
    : `rgb(var(--series-${slot}) / ${alpha})`
}

export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500'] as const

/**
 * Groups a long list into the top n plus an "Other" bucket, so a chart never
 * needs a fifth hue. Returns the tail so the caller can still report it.
 */
export function foldToTop<T>(
  items: readonly T[],
  valueOf: (item: T) => number,
  limit = SERIES_SLOTS,
): { top: T[]; otherValue: number; otherCount: number } {
  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a))
  const top = sorted.slice(0, limit)
  const tail = sorted.slice(limit)
  return {
    top,
    otherValue: tail.reduce((sum, item) => sum + valueOf(item), 0),
    otherCount: tail.length,
  }
}
