/**
 * The trailing arrow every primary call to action carries — never a naked
 * glyph beside the label, always seated in its own small disc flush with the
 * button's end. The disc drifts a pixel toward the corner on hover, which is
 * the kinetic tension that makes a pill read as pressable.
 */
export function ArrowOrb({ className = '' }: { className?: string }) {
  return (
    <span className={`btn-orb ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5" />
      </svg>
    </span>
  )
}
