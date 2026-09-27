/**
 * The arithmetic behind the motion.
 *
 * Parallax is three numbers per layer — how far the page has scrolled, where
 * the pointer is, and how "deep" the layer sits — turned into a translation.
 * Kept pure and out of the components so the one thing that can make a
 * decorative layer walk off the screen or jitter (an unbounded multiplier, a
 * sign error) is pinned by a test rather than noticed on a phone.
 *
 * Every function here is safe to call with garbage: NaN and infinities clamp
 * to zero movement, because a layer that stays put is always acceptable and a
 * layer at translate(NaN) is a blank page.
 */

export type Pointer = { x: number; y: number }

/** Clamps `value` to [min, max]; a non-finite value clamps to `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * The pointer's position as −1..1 on each axis, with (0, 0) at the centre of
 * the viewport. A pointer outside the viewport (or no viewport) is the centre,
 * so a layer never leans toward a cursor that has left.
 */
export function normalisePointer(pointer: Pointer, viewport: { width: number; height: number }): Pointer {
  if (!(viewport.width > 0) || !(viewport.height > 0)) return { x: 0, y: 0 }
  return {
    x: clamp((pointer.x / viewport.width) * 2 - 1, -1, 1),
    y: clamp((pointer.y / viewport.height) * 2 - 1, -1, 1),
  }
}

export type LayerMotion = {
  /** 0 = pinned to the page, 1 = moves with it fully. Above 1 moves faster than the page. */
  depth: number
  /** Pixels of drift at the viewport's edge for a pointer at full lean. */
  lean?: number
  /** Cap on the scroll-driven offset, so a long page cannot push a layer away. */
  maxScroll?: number
}

/**
 * Where a layer should sit, in pixels, for a given scroll position and
 * pointer lean. Scroll moves layers up as the page moves up, scaled by depth,
 * so a shallow layer trails the content and reads as far away.
 */
export function parallaxOffset(
  layer: LayerMotion,
  scrollY: number,
  pointer: Pointer = { x: 0, y: 0 },
): { x: number; y: number } {
  // Garbage means "do not move", never "move to the minimum".
  const depth = clamp(finite(layer.depth), -2, 2)
  const lean = clamp(finite(layer.lean), 0, 200)
  const maxScroll = clamp(finite(layer.maxScroll, 600), 0, 4_000)
  const scroll = clamp(finite(scrollY), -maxScroll, maxScroll)
  return {
    x: round(clamp(finite(pointer.x), -1, 1) * lean),
    y: round(-scroll * depth + clamp(finite(pointer.y), -1, 1) * lean),
  }
}

function finite(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * A card's tilt from the pointer's position over it: a few degrees at most,
 * the near edge dipping toward the pointer, and zero once the pointer leaves.
 */
export function tiltFor(
  pointer: Pointer | null,
  rect: { left: number; top: number; width: number; height: number },
  maxDegrees = 6,
): { rotateX: number; rotateY: number } {
  if (!pointer || !(rect.width > 0) || !(rect.height > 0)) return { rotateX: 0, rotateY: 0 }
  const x = clamp(((pointer.x - rect.left) / rect.width) * 2 - 1, -1, 1)
  const y = clamp(((pointer.y - rect.top) / rect.height) * 2 - 1, -1, 1)
  const max = clamp(maxDegrees, 0, 20)
  return { rotateX: round(-y * max), rotateY: round(x * max) }
}

/** Two decimals is a sub-pixel; more is noise in a transform string. `-0` is `0`. */
function round(value: number): number {
  return Math.round(value * 100) / 100 || 0
}

/** Whether the person has asked for less motion. Safe to call on the server. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
