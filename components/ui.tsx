import Link from 'next/link'
import type { ReactNode } from 'react'
import { SITE } from '@/lib/site-config'

export function PageHero({
  eyebrow,
  title,
  sub,
  background,
  eyebrowColor,
}: {
  eyebrow: string
  title: ReactNode
  sub?: ReactNode
  background?: string
  eyebrowColor?: string
}) {
  return (
    <section className="page-hero" style={background ? { background } : undefined}>
      <div className="page-hero-inner">
        <p className="eyebrow" style={eyebrowColor ? { color: eyebrowColor } : undefined}>
          {eyebrow}
        </p>
        <h1 className="gsap-headline">{title}</h1>
        {sub ? <p className="page-hero-sub">{sub}</p> : null}
      </div>
    </section>
  )
}

export function Section({
  children,
  className = '',
  background,
  id,
}: {
  children: ReactNode
  className?: string
  background?: string
  id?: string
}) {
  return (
    <section
      id={id}
      className={`section ${className}`}
      style={background ? { background } : undefined}
    >
      {children}
    </section>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  accent,
}: {
  eyebrow: string
  title: ReactNode
  accent?: string
}) {
  return (
    <div className="section-header">
      <p className="eyebrow" style={accent ? { color: accent } : undefined}>
        {eyebrow}
      </p>
      <h2 className="gsap-headline">{title}</h2>
    </div>
  )
}

export function Button({
  href,
  children,
  variant = 'primary',
  external = false,
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'ghost'
  external?: boolean
}) {
  const cls = variant === 'primary' ? 'btn-primary' : 'btn-ghost'
  return external ? (
    <a className={cls} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <Link className={cls} href={href}>
      {children}
    </Link>
  )
}

export function DisclosureBox() {
  return (
    <div className="disclosure-box">
      {SITE.affiliateDisclosure} Checkout is completed securely on Amazon or TikTok
      Shop — we never collect your payment details on this site.
    </div>
  )
}
