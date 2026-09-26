/**
 * The InteriorCleanse seal — an "IC" ligature in the display face inside a
 * fine double ring. A house mark rather than a pictogram: it reads as a
 * maker's stamp on a candle box, a book spine, a tote, and it stays legible
 * at favicon size because the ring carries the shape when the letters
 * blur. Drawn in `currentColor` so it inherits its context's ink.
 */
export function Monogram({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth={1.3} />
      <circle cx="24" cy="24" r="18.6" stroke="currentColor" strokeWidth={0.6} opacity={0.7} />
      <text
        x="24"
        y="31.6"
        textAnchor="middle"
        fill="currentColor"
        fontSize="21"
        fontWeight={500}
        style={{
          fontFamily: 'var(--font-display, Fraunces, Georgia, serif)',
          fontVariationSettings: "'SOFT' 100, 'WONK' 1, 'opsz' 144",
          letterSpacing: '-1px',
        }}
      >
        IC
      </text>
    </svg>
  )
}
