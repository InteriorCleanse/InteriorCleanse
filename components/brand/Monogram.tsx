/**
 * The InteriorCleanse monogram — a geometric "IC".
 *
 * A vertical bar (I) beside an open ring (C). Stroke-only and drawn in
 * `currentColor`, so it inherits the header's ink and flips cleanly between the
 * light solid bar and the light-over-hero state without shipping two rasters.
 * Purely geometric: the same mark reads at 24px in a favicon and at 44px in the
 * header lockup.
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
      strokeWidth={2.4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      {/* I */}
      <path d="M14 12 V36" />
      {/* C — an open ring, the aperture facing forward */}
      <path d="M37.7 14.8 A12 12 0 1 0 37.7 33.2" />
    </svg>
  )
}
