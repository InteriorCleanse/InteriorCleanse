'use client'

import Link from 'next/link'
import { LogoIcon, Wordmark } from './Logo'
import { useCart } from './CartProvider'

export function SiteHeader() {
  const { count, openDrawer } = useCart()
  return (
    <div className="wrap">
    <header className="top">
      <Link className="brand" href="/">
        <LogoIcon />
        <Wordmark />
      </Link>
      <nav className="nav">
        <Link href="/#build">BUILD</Link>
        <Link href="/#shop">SHOP</Link>
        <Link href="/#drops">DROPS</Link>
        <Link href="/coverage/">COVERAGE</Link>
        <Link href="/how-it-works/">HOW&nbsp;IT&nbsp;WORKS</Link>
        <Link href="/operator/login/">OPERATOR</Link>
        <button className="cart" onClick={openDrawer} aria-label={`Open cart, ${count} item${count === 1 ? '' : 's'}`}>
          CART [{count}]
        </button>
      </nav>
    </header>
    </div>
  )
}
