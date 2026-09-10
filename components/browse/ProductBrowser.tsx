'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AddToCartButton } from '@/components/cart'
import { track } from '@/lib/analytics'
import { isInternalCheckout, purchaseLabel } from '@/lib/category-experience'
import type { Product } from '@/lib/types'

/** Horizontal travel, in px, that commits to a card change. */
const COMMIT = 90
/** How many cards behind the active one are drawn for depth. */
const DEPTH = 2

/**
 * A one-at-a-time product browser: swipe on touch, drag on desktop, arrow keys
 * for the keyboard.
 *
 * No swipe library — pointer events and CSS transforms only, which is both
 * lighter and the only way to keep the keyboard and reduced-motion paths honest.
 *
 * Accessibility is structural rather than bolted on. The whole stack is a
 * labelled group with `aria-roledescription="carousel"`; a live region
 * announces each product on change; every card that is not active is
 * `inert`-equivalent (`aria-hidden` plus removed from the tab order) so a
 * screen reader never reads three products at once. Under reduced motion the
 * spring is replaced with an instant swap.
 *
 * Crucially, this is never the only way to reach a product: the same catalogue
 * is a plain accessible grid at /shop, and this component's own fallback is a
 * plain vertical list that needs no JavaScript at all.
 */
export function ProductBrowser({
  products,
  label = 'Featured products',
}: {
  products: Product[]
  label?: string
}) {
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState(0)
  const [ready, setReady] = useState(false)
  const [reduced, setReduced] = useState(false)
  const startX = useRef<number | null>(null)
  const stackRef = useRef<HTMLDivElement>(null)

  const count = products.length

  // Until this flips, the server-rendered plain list is what is on screen. It
  // means the no-JS experience is the default rather than a special case.
  useEffect(() => setReady(true), [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (((i + delta) % count) + count) % count)
      setDrag(0)
    },
    [count]
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('a, button')) return
    startX.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return
    setDrag(e.clientX - startX.current)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return
    const dx = e.clientX - startX.current
    startX.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (Math.abs(dx) > COMMIT) go(dx < 0 ? 1 : -1)
    else setDrag(0)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(1)
    else if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'Home') setIndex(0)
    else if (e.key === 'End') setIndex(count - 1)
    else return
    e.preventDefault()
  }

  useEffect(() => {
    if (ready) track('product_view', { slug: products[index]?.slug })
  }, [index, ready, products])

  if (count === 0) return null

  const plainList = (
    <ul className="browser-fallback">
      {products.map((p) => (
        <li key={p.slug}>
          <Link href={`/shop/${p.slug}/`}>
            <img src={p.heroImage} alt="" loading="lazy" decoding="async" />
            <span className="browser-fallback-name">{p.name}</span>
            <span className="browser-fallback-price">
              {p.price ? `$${p.price}` : 'Coming soon'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )

  // Server render and the no-JS case both land here.
  if (!ready) {
    return (
      <section className="product-browser" aria-label={label}>
        {plainList}
      </section>
    )
  }

  const active = products[index]

  return (
    <section className="product-browser" aria-label={label}>
      <div
        className="browser-stack"
        ref={stackRef}
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-reduced={reduced ? 'true' : undefined}
      >
        {products.map((p, i) => {
          // Distance forward from the active card, wrapping.
          const offset = (((i - index) % count) + count) % count
          if (offset > DEPTH) return null
          const isActive = offset === 0
          return (
            <article
              key={p.slug}
              className="browser-card"
              data-active={isActive ? 'true' : undefined}
              aria-hidden={isActive ? undefined : true}
              style={
                {
                  '--offset': offset,
                  '--drag': isActive ? `${drag}px` : '0px',
                  zIndex: count - offset,
                } as React.CSSProperties
              }
            >
              {/* Transparent background so the environment shows through. */}
              <img className="browser-card-image" src={p.heroImage} alt="" loading={offset === 0 ? 'eager' : 'lazy'} decoding="async" />
              <h3 className="browser-card-name">{p.name}</h3>
              <p className="browser-card-desc">{p.tagline}</p>
              <p className="browser-card-price">
                {p.price ? `$${p.price}` : 'Coming soon'}
              </p>
              <div className="browser-card-actions">
                {isInternalCheckout(p) ? (
                  <AddToCartButton
                    disabled={p.comingSoon}
                    tabIndex={isActive ? 0 : -1}
                    item={{ slug: p.slug, name: p.name, price: p.price, heroImage: p.heroImage }}
                  />
                ) : (
                  <Link className="add-to-cart-btn" href={`/shop/${p.slug}/`} tabIndex={isActive ? 0 : -1}>
                    {purchaseLabel(p).toUpperCase()}
                  </Link>
                )}
                <Link
                  className="browser-details"
                  href={`/shop/${p.slug}/`}
                  tabIndex={isActive ? 0 : -1}
                >
                  Details
                </Link>
              </div>
            </article>
          )
        })}
      </div>

      <div className="browser-controls">
        <button type="button" onClick={() => go(-1)} aria-label="Previous product">
          ‹
        </button>
        <p className="browser-position">
          {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </p>
        <button type="button" onClick={() => go(1)} aria-label="Next product">
          ›
        </button>
      </div>

      {/* Announces the change without moving focus. */}
      <p className="sr-only" role="status" aria-live="polite">
        {active.name}, {active.price ? `$${active.price}` : 'price not yet set'}. Item{' '}
        {index + 1} of {count}.
      </p>

      <p className="browser-escape">
        <Link href="/shop/">Browse all {count} products as a grid →</Link>
      </p>
    </section>
  )
}
