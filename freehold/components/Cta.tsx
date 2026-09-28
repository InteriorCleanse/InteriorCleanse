import Link from 'next/link'
import type { ReactNode } from 'react'

export function Cta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="cta">
      <span>{children}</span>
      <span className="glyph" aria-hidden="true" />
    </Link>
  )
}

export function QuietCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="cta-quiet">
      <span className="dot" aria-hidden="true" />
      <span>{children}</span>
    </Link>
  )
}
