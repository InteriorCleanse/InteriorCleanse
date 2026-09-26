/**
 * The InteriorCleanse mark — a threshold with the sun rising inside it.
 *
 * The outer arch is a doorway, the oldest gesture of interior architecture.
 * Inside it a horizon line and a half-disc of light: morning entering a room.
 * "Interior" is the doorway; "cleanse" is the light coming through it. Three
 * short rays make the disc read as sun rather than tunnel at any size.
 *
 * Stroke-only in `currentColor` apart from the filled sun, so it inherits the
 * header's ink and flips between the light bar and the over-hero state with
 * no raster. Geometric, so the same mark holds at a 16px favicon and a 44px
 * lockup.
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
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* The doorway */}
      <path d="M11 42 V23 A13 13 0 0 1 37 23 V42" />
      {/* The threshold */}
      <path d="M8.5 42 H39.5" opacity={0.55} />
      {/* The horizon */}
      <path d="M17.5 32 H30.5" />
      {/* The sun, rising */}
      <path d="M19 32 A5 5 0 0 1 29 32 Z" fill="currentColor" stroke="none" opacity={0.92} />
      {/* Three rays */}
      <g opacity={0.75} strokeWidth={1.7}>
        <path d="M24 19.5 V22.5" />
        <path d="M17.6 22.4 L19.8 24.6" />
        <path d="M30.4 22.4 L28.2 24.6" />
      </g>
    </svg>
  )
}
