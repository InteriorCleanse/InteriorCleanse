/**
 * A small, consistent line-icon set — one stroke weight, round joins, drawn in
 * currentColor so each inherits its context. Used where a distinct, meaningful
 * glyph reads better than repeating the brand mark (the trust strip, features).
 */
export type IconName = 'shield' | 'flame' | 'book' | 'ship'

const PATHS: Record<IconName, React.ReactNode> = {
  shield: (
    <>
      <path d="M12 3 5 5.6v5.7c0 4.2 3 6.9 7 8.1 4-1.2 7-3.9 7-8.1V5.6L12 3Z" />
      <path d="M9.2 11.7l2 2 3.6-3.9" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3.5c2.6 2.9 4.2 5.3 4.2 8.1a4.2 4.2 0 0 1-8.4 0c0-1.4.5-2.6 1.5-3.8.3 1 .1 1.9 1 2.5 1-1 .9-3.5.7-6.8Z" />
    </>
  ),
  book: (
    <>
      <path d="M6 4h11a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 17.5V5.5A1.5 1.5 0 0 1 6.5 4Z" />
      <path d="M9 4v15" />
    </>
  ),
  ship: (
    <>
      <path d="M3 6.5h11v9H3z" />
      <path d="M14 9.5h3.5L21 13v2.5h-7z" />
      <circle cx="7" cy="17.5" r="1.7" />
      <circle cx="17.5" cy="17.5" r="1.7" />
    </>
  ),
}

export function LineIcon({
  name,
  size = 22,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
