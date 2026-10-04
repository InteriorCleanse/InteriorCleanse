'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LogoIcon, Wordmark } from './Logo'
import { useCart } from './CartProvider'

const LINKS = [
  ['/#build', 'Build'],
  ['/#shop', 'Shop'],
  ['/#drops', 'Drops'],
  ['/coverage/', 'Coverage'],
  ['/how-it-works/', 'How it works'],
  ['/faq/', 'FAQ'],
]

export function SiteHeader() {
  const { count, openDrawer } = useCart()
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menu])

  return (
    <>
      <div className="navwrap">
        <nav className="island" aria-label="Primary">
          <Link className="brand" href="/" onClick={() => setMenu(false)}>
            <LogoIcon size={32} />
            <Wordmark />
          </Link>

          <div className="island-links">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
          </div>

          <div className="island-actions">
            <button className="cart" onClick={openDrawer} aria-label={`Open cart, ${count} item${count === 1 ? '' : 's'}`}>
              BAG<span className="cart-n">{count}</span>
            </button>
            <button className={`burger${menu ? ' on' : ''}`} aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <span /><span />
            </button>
          </div>
        </nav>
      </div>

      <div className={`navmenu${menu ? ' open' : ''}`} aria-hidden={!menu}>
        <div className="navmenu-inner">
          {LINKS.map(([href, label], i) => (
            <Link key={href} href={href} style={{ ['--i' as string]: i }} onClick={() => setMenu(false)}>
              <span className="nm-num">0{i + 1}</span>{label}
            </Link>
          ))}
          <Link href="/operator/login/" style={{ ['--i' as string]: LINKS.length }} onClick={() => setMenu(false)}>
            <span className="nm-num">0{LINKS.length + 1}</span>Operator
          </Link>
        </div>
      </div>
    </>
  )
}
