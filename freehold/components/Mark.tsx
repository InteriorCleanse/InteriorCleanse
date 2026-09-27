export function Mark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="2.75" y="2.75" width="15.5" height="15.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20.5" cy="20.5" r="1.75" fill="var(--seal)" />
    </svg>
  )
}
