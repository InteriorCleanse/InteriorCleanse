'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useCart } from './CartProvider'

export function CartDrawer() {
  const { items, total, count, drawerOpen, closeDrawer, setQty, remove } = useCart()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer() }
    if (drawerOpen) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, closeDrawer])

  return (
    <>
      <div className={`scrim${drawerOpen ? ' show' : ''}`} onClick={closeDrawer} aria-hidden={!drawerOpen} />
      <aside className={`drawer${drawerOpen ? ' open' : ''}`} aria-label="Cart" aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <span className="kicker">YOUR BAG · {count}</span>
          <button className="xbtn" onClick={closeDrawer} aria-label="Close cart">✕</button>
        </div>

        <div className="drawer-body">
          {items.length === 0 ? (
            <p className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
              Your bag is empty. Build a fob or add from the shop.
            </p>
          ) : (
            items.map((it) => (
              <div className="line" key={it.key}>
                <div style={{ minWidth: 0 }}>
                  <div className="ln">{it.name}</div>
                  {it.meta ? <div className="lm">{it.meta}</div> : null}
                  <div className="qty">
                    <button onClick={() => setQty(it.key, it.qty - 1)} aria-label="Decrease">−</button>
                    <span>{it.qty}</span>
                    <button onClick={() => setQty(it.key, it.qty + 1)} aria-label="Increase">+</button>
                    <button className="rm" onClick={() => remove(it.key)}>remove</button>
                  </div>
                </div>
                <div className="lp">${it.price * it.qty}</div>
              </div>
            ))
          )}
        </div>

        <div className="drawer-foot">
          <div className="totalrow">
            <span>SUBTOTAL</span>
            <span className="amt">${total}</span>
          </div>
          <p className="ex">EXAMPLE PRICING · operator confirms the flat price before any charge</p>
          <Link
            href="/checkout/"
            className={`btn${items.length === 0 ? ' ghost' : ''}`}
            style={{ textAlign: 'center', pointerEvents: items.length === 0 ? 'none' : 'auto', opacity: items.length === 0 ? 0.5 : 1 }}
            onClick={closeDrawer}
          >
            CHECKOUT →
          </Link>
        </div>
      </aside>
    </>
  )
}
