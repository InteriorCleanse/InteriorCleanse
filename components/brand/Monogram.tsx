/**
 * The InteriorCleanse mark — two nested arches, a recessed doorway.
 *
 * An arch is the oldest gesture of interior architecture, and nesting a second
 * one inside reads as depth — a threshold you step through into a calmer room.
 * Stroke-only in `currentColor`, so it inherits the header's ink and flips
 * between the light bar and the over-hero state with no raster. Geometric, so
 * the same mark holds at a 24px favicon and a 44px lockup.
 */
export function Monogram({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Outer arch — the doorway */}
      <path d="M11 42 V23 A13 13 0 0 1 37 23 V42" />
      {/* Inner arch — the niche within */}
      <path d="M19.5 42 V29 A4.5 4.5 0 0 1 28.5 29 V42" />
    </svg>
  )
}
