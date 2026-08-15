'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CartButton } from './cart'
import { FloatingMark } from './brand/FloatingMark'
import { LogoMark } from './logo-mark'

/** Centred navigation. Labels are the approved set; hrefs are real routes. */
const NAV: [string, string][] = [
  ['Residence', '/'],
  ['Books', '/library/'],
  ['Wellness', '/shop/wellness/'],
  ['Home', '/shop/home/'],
  ['Digital', '/shop/digital/'],
  ['Partners', '/partners/'],
]

/** Routes that open with a full-bleed hero the header should float over. */
const TRANSPARENT_ROUTES = new Set(['/'])

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The site header.
 *
 * Transparent while it sits over a hero and solid once the page scrolls, so the
 * nav never floats unreadable over a bright frame of video. The solid state is
 * driven by a passive scroll listener rather than an IntersectionObserver on the
 * hero, because the header must also be solid on every route that has no hero
 * at all.
 */
export function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const overHero = TRANSPARENT_ROUTES.has(pathname) && !scrolled

  return (
    <header className="site-header" data-transparent={overHero ? 'true' : undefined}>
      <div className="header-lockup">
        <FloatingMark />
        <LogoMark />
      </div>

      <nav className="site-nav" aria-label="Primary">
        {NAV.map(([label, href]) => (
          <Link key={label} href={href} aria-current={pathname === href ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="header-actions">
        {/* The catalogue search lives on /shop; this is the way in from anywhere. */}
        <Link href="/shop/#search" className="header-icon-btn" aria-label="Search the shop">
          <SearchIcon />
        </Link>
        <CartButton />
      </div>
    </header>
  )
}
