'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SAMPLE_FLEET } from '@/lib/data'
import { LocalProvider, useLocal } from '@/lib/store'
import { CommandPalette } from './CommandPalette'
import { ConciergeProvider, useConcierge } from './Concierge'
import { DriverProvider, useDriver } from './DriverProvider'
import { Icon } from './Icons'
import { NAV, TOP_NAV } from './nav'
import { ToastProvider } from './Toast'

function typing(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))
}

function PassBadge() {
  const { facts, loaded } = useDriver()
  const verified = loaded && facts.verified
  return (
    <Link href={verified ? '/account' : '/verify'} className="pass" data-verified={verified ? 'true' : undefined} aria-label={verified ? 'Driver Pass: verified' : 'Verify your licence'}>
      <span className="pass-dot">
        <Icon name={verified ? 'check' : 'id'} size={14} />
      </span>
      <span className="pass-label">{verified ? 'Driver Pass' : 'Verify licence'}</span>
    </Link>
  )
}

function DemoRibbon() {
  const { modes } = useDriver()
  if (!modes || (modes.payments && modes.identity && !modes.demoKeys)) return null
  return (
    <div className="demo-ribbon" role="note">
      Preview mode: {SAMPLE_FLEET ? 'sample cars, ' : ''}no real charges{modes.identity ? '' : ', simulated licence checks'}. <Link href="/security#modes">What this means</Link>
    </div>
  )
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const [palette, setPalette] = useState(false)
  const chord = useRef<number | null>(null)
  const { setOpen } = useConcierge()
  const { trips } = useLocal()
  const upcoming = trips.filter((t) => t.status === 'booked').length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || palette) return
      if (e.key === '/') {
        e.preventDefault()
        setPalette(true)
        return
      }
      if (chord.current !== null) {
        window.clearTimeout(chord.current)
        chord.current = null
        const target = NAV.find((n) => n.key === e.key.toLowerCase())
        if (target) router.push(target.href)
        else if (e.key === 'i') setOpen(true)
        return
      }
      if (e.key === 'g') chord.current = window.setTimeout(() => (chord.current = null), 1000)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [palette, router, setOpen])

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <DemoRibbon />
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="wordmark" aria-label="AVANT home">
            AVANT<i aria-hidden="true" />
          </Link>
          <nav className="topnav" aria-label="Main">
            {TOP_NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>
                {n.label}
                {n.href === '/trips' && upcoming ? ` (${upcoming})` : ''}
              </Link>
            ))}
          </nav>
          <div className="top-actions">
            <button type="button" className="palette-btn" onClick={() => setPalette(true)} aria-label="Jump to a page or car">
              <Icon name="search" size={16} />
              <span>Jump to</span>
              <span className="kbd">⌘K</span>
            </button>
            <PassBadge />
          </div>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="site-foot">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <Link href="/" className="wordmark">
                AVANT<i aria-hidden="true" />
              </Link>
              <p className="muted small" style={{ marginTop: 12, maxWidth: '36ch' }}>
                Book the exact car you want from a neighbour. The whole price up front, coverage in one number, a concierge that never sleeps.
              </p>
            </div>
            <div>
              <h3>Drive</h3>
              <ul>
                <li><Link href="/search">Search cars</Link></li>
                <li><Link href="/coverage">Coverage, explained</Link></li>
                <li><Link href="/verify">Driver Pass</Link></li>
                <li><Link href="/concierge">Concierge</Link></li>
              </ul>
            </div>
            <div>
              <h3>Host</h3>
              <ul>
                <li><Link href="/host">Earn with your car</Link></li>
                <li><Link href="/security">Trust &amp; safety</Link></li>
              </ul>
            </div>
            <div>
              <h3>Company</h3>
              <ul>
                <li><Link href="/legal/privacy">Privacy</Link></li>
                <li><Link href="/legal/terms">Terms</Link></li>
                <li><Link href="/account">Your data</Link></li>
              </ul>
            </div>
          </div>
          <p className="foot-legal">
            AVANT is a peer-to-peer car sharing marketplace. Vehicles are owned by independent hosts. Coverage descriptions are summaries; the policy
            documents govern. In an emergency call 911.
          </p>
        </div>
      </footer>

      <nav className="tabbar" aria-label="Main">
        <Link href="/search" aria-current={active('/search') ? 'page' : undefined}>
          <Icon name="compass" size={22} />
          Search
        </Link>
        <Link href="/trips" aria-current={active('/trips') ? 'page' : undefined}>
          <Icon name="trips" size={22} />
          Trips{upcoming ? ` (${upcoming})` : ''}
        </Link>
        <button type="button" className="tab-ai" onClick={() => setOpen(true)} aria-label="Ask the AVANT concierge">
          <span className="tab-ai-dot">
            <Icon name="sparkle" size={22} />
          </span>
        </button>
        <Link href="/saved" aria-current={active('/saved') ? 'page' : undefined}>
          <Icon name="heart" size={22} />
          Saved
        </Link>
        <Link href="/account" aria-current={active('/account') ? 'page' : undefined}>
          <Icon name="user" size={22} />
          Account
        </Link>
      </nav>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <LocalProvider>
      <DriverProvider>
        <ToastProvider>
          <ConciergeProvider>
            <Frame>{children}</Frame>
          </ConciergeProvider>
        </ToastProvider>
      </DriverProvider>
    </LocalProvider>
  )
}
