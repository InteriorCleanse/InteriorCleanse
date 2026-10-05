'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SAMPLE_FLEET } from '@/lib/places'
import { LocalProvider } from '@/lib/store'
import { AgreementPrompt } from './AgreementPrompt'
import { CommandPalette } from './CommandPalette'
import { ConciergeProvider, useConcierge } from './Concierge'
import { DriverProvider, useDriver } from './DriverProvider'
import { Icon } from './Icons'
import { Lockup } from './Logo'
import { NativeBridge } from './NativeBridge'
import { NAV, TABS } from './nav'
import { SessionProvider, useSession } from './Session'
import { Avatar } from './ui'
import { ToastProvider } from './Toast'

function typing(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))
}

function AccountBadge() {
  const { user, loaded } = useSession()
  if (!loaded) return <span className="pass" aria-hidden="true" style={{ width: 120, visibility: 'hidden' }} />
  if (!user)
    return (
      <Link href="/signin" className="btn btn-primary btn-sm">
        Sign in
      </Link>
    )
  return (
    <Link href="/more" className="pass" aria-label={`Your account, ${user.firstName}`}>
      <Avatar name={user.name} photo={user.photo} size={28} />
      <span className="pass-label">{user.firstName}</span>
    </Link>
  )
}

function DemoRibbon() {
  const { modes } = useDriver()
  if (!modes || (modes.payments && modes.identity && !modes.demoKeys)) return null
  return (
    <aside className="demo-ribbon" aria-label="Preview mode">
      Preview mode: {SAMPLE_FLEET ? 'sample cars, ' : ''}no real charges{modes.identity ? '' : ', simulated licence checks'}. <Link href="/security#modes">What this means</Link>
    </aside>
  )
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const [palette, setPalette] = useState(false)
  const chord = useRef<number | null>(null)
  const { setOpen } = useConcierge()
  const { unread } = useSession()
  const inbox = unread.messages + unread.notifications

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
        else if (e.key === 'a') setOpen(true)
        return
      }
      if (e.key === 'g') chord.current = window.setTimeout(() => (chord.current = null), 1000)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [palette, router, setOpen])

  // Task flows get the whole screen: no tab bar over a form or a pay button.
  const flow = /^\/(checkout|signin|forgot|reset|verify|verify-email|confirm-email|unsubscribe|host\/new|trips\/confirm)(\/|$)/.test(pathname)

  const active = (href: string) => (href === '/' ? pathname === '/' || pathname.startsWith('/search') || pathname.startsWith('/cars') : pathname.startsWith(href) || (href === '/favorites' && pathname.startsWith('/saved')))

  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <DemoRibbon />
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="wordmark" aria-label="AVANT home">
            <Lockup />
          </Link>
          <nav className="topnav" aria-label="Main">
            {TABS.slice(0, 4).map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>
                {n.label}
                {n.href === '/inbox' && inbox ? <span className="count"> {inbox}</span> : null}
              </Link>
            ))}
            <Link href="/host" aria-current={active('/host') ? 'page' : undefined}>
              Become a host
            </Link>
          </nav>
          <div className="top-actions">
            <button type="button" className="palette-btn" onClick={() => setPalette(true)} aria-label="Jump to a page or car">
              <Icon name="search" size={16} />
              <span>Jump to</span>
              <span className="kbd">⌘K</span>
            </button>
            <AccountBadge />
          </div>
        </div>
      </header>

      <AgreementPrompt />
      <main id="main" data-flow={flow ? '' : undefined}>
        {children}
      </main>

      <footer className="site-foot">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <Link href="/" className="wordmark wordmark-lg" aria-label="AVANT home">
                <Lockup tone="platinum" />
              </Link>
              <p className="muted small" style={{ marginTop: 12, maxWidth: '36ch' }}>
                Book the exact car you want from a neighbour. The whole price up front, coverage in one number, a concierge that never sleeps.
              </p>
            </div>
            <div>
              <h2>Drive</h2>
              <ul>
                <li><Link href="/search">Search cars</Link></li>
                <li><Link href="/coverage">Coverage, explained</Link></li>
                <li><Link href="/verify">Driver Pass</Link></li>
                <li><Link href="/concierge">Concierge</Link></li>
                <li><Link href="/circle">AVANT Circle</Link></li>
              </ul>
            </div>
            <div>
              <h2>Host</h2>
              <ul>
                <li><Link href="/host">Earn with your car</Link></li>
                <li><Link href="/security">Trust &amp; safety</Link></li>
                <li><Link href="/legal/host">Host Agreement</Link></li>
              </ul>
            </div>
            <div>
              <h2>Company</h2>
              <ul>
                <li><Link href="/why">Why AVANT</Link></li>
                <li><Link href="/legal/privacy">Privacy</Link></li>
                <li><Link href="/legal/terms">Terms</Link></li>
                <li><Link href="/account">Your data</Link></li>
              </ul>
            </div>
          </div>
          <div className="foot-legal">
            <p>
              AVANT is a peer-to-peer car sharing marketplace. Vehicles are owned by independent hosts. Coverage descriptions are summaries; the
              policy documents govern. In an emergency call 911.
            </p>
          </div>
        </div>
      </footer>

      {flow ? null : (
        <nav className="tabbar" aria-label="Main">
          {TABS.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>
              <Icon name={n.href === '/favorites' && active(n.href) ? 'heart-filled' : n.icon} size={22} />
              {n.label}
              {n.href === '/inbox' && inbox ? (
                <span className="tab-badge" aria-label={`${inbox} unread`}>
                  {inbox > 9 ? '9+' : inbox}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <LocalProvider>
      <SessionProvider>
        <NativeBridge />
        <DriverProvider>
          <ToastProvider>
            <ConciergeProvider>
              <Frame>{children}</Frame>
            </ConciergeProvider>
          </ToastProvider>
        </DriverProvider>
      </SessionProvider>
    </LocalProvider>
  )
}
