'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AddToCartButton } from '@/components/cart'
import { track } from '@/lib/analytics'
import {
  SHOWROOM_CATEGORIES,
  categoryLabel,
  isValidCategory,
  type ShowroomCategory,
  type ShowroomProduct,
} from '@/lib/showroom'
import { RealismLayer } from '@/components/hero/RealismLayer'
import { SceneBackground } from '@/components/hero/SceneBackground'
import type { Scene } from '@/lib/scenes'
import { StageProduct } from './StageProduct'
import { useStageGestures } from './useStageGestures'

type Mode = 'discover' | 'browse'
type Sort = 'featured' | 'price-asc' | 'price-desc' | 'name'

const SAVED_KEY = 'ic_showroom_saved'

/**
 * The locked showroom.
 *
 * Four layers, and the separation is the whole point:
 *
 *   1 — the environment poster. Background only. It contains no products, no
 *       nav, no text, no cards and no controls; every one of those is real HTML
 *       above it. This is why `showroom-poster.png` is used and never
 *       `showroom-browse-poster.png`, which has the interface baked in.
 *   2 — this interface, which never moves or distorts with the background.
 *   3 — StageProduct, the replaceable media on the pedestal.
 *   4 — the product data driving both.
 *
 * Discover puts one product on the pedestal; Pass moves on without deleting or
 * hiding anything, and Save adds to a favourites list held in localStorage.
 * Browse All is an ordinary filterable catalogue, and selecting a card loads it
 * onto the stage. Neither mode is a dead end for the other.
 */
export function Showroom({
  products,
  scene,
  initialCategory,
  initialView = 'discover',
  initialQuery = '',
  initialSort = 'featured',
}: {
  products: ShowroomProduct[]
  /** The `showroom` environment from the manifest; the locked background. */
  scene?: Scene
  initialCategory?: string | null
  initialView?: Mode
  initialQuery?: string
  initialSort?: string
}) {
  const [mode, setMode] = useState<Mode>(initialView)
  const [category, setCategory] = useState<ShowroomCategory | 'all'>(
    isValidCategory(initialCategory ?? null) ? (initialCategory as ShowroomCategory) : 'all'
  )
  const [index, setIndex] = useState(0)
  const [saved, setSaved] = useState<string[]>([])
  const [query, setQuery] = useState(initialQuery)
  const [sort, setSort] = useState<Sort>(
    (['featured', 'price-asc', 'price-desc', 'name'] as const).includes(initialSort as Sort)
      ? (initialSort as Sort)
      : 'featured'
  )
  const [rotating, setRotating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Deep link: /collection?category=books
  useEffect(() => {
    if (isValidCategory(initialCategory ?? null)) {
      setCategory(initialCategory as ShowroomCategory)
      track('category_view', { category: initialCategory as string })
    }
  }, [initialCategory])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY)
      if (raw) setSaved(JSON.parse(raw))
    } catch {
      /* Corrupt favourites must not break the showroom. */
    }
  }, [])

  const persistSaved = useCallback((next: string[]) => {
    setSaved(next)
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    } catch {
      /* Private mode: favourites are session-only. */
    }
  }, [])

  const inCategory = useMemo(
    () => (category === 'all' ? products : products.filter((p) => p.category === category)),
    [products, category]
  )

  const catalogue = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? inCategory.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
        )
      : inCategory
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return (a.price ?? Infinity) - (b.price ?? Infinity)
        case 'price-desc':
          return (b.price ?? -1) - (a.price ?? -1)
        case 'name':
          return a.name.localeCompare(b.name)
        default:
          return Number(b.featured) - Number(a.featured)
      }
    })
  }, [inCategory, query, sort])

  // The stage shows an explicit selection when there is one, otherwise it
  // follows Discover's position. Changing category resets the position but
  // never removes anything from the deck.
  const onStage =
    (selectedId ? inCategory.find((p) => p.id === selectedId) : undefined) ??
    inCategory[index] ??
    null

  useEffect(() => {
    setIndex(0)
    setSelectedId(null)
    setRotating(false)
  }, [category])

  const next = useCallback(() => {
    setSelectedId(null)
    setRotating(false)
    setIndex((i) => (inCategory.length ? (i + 1) % inCategory.length : 0))
  }, [inCategory.length])

  const prev = useCallback(() => {
    setSelectedId(null)
    setRotating(false)
    setIndex((i) => (inCategory.length ? (i - 1 + inCategory.length) % inCategory.length : 0))
  }, [inCategory.length])

  const toggleSave = useCallback(
    (id: string) => {
      persistSaved(saved.includes(id) ? saved.filter((s) => s !== id) : [...saved, id])
    },
    [saved, persistSaved]
  )

  const selectForStage = useCallback((id: string) => {
    setSelectedId(id)
    setMode('discover')
    setRotating(false)
    // Return focus to the stage so a keyboard user is not left in the catalogue.
    document.getElementById('showroom-stage')?.scrollIntoView({ block: 'center' })
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') next()
    else if (e.key === 'ArrowLeft') prev()
    else return
    e.preventDefault()
  }

  const isSaved = onStage ? saved.includes(onStage.id) : false
  const empty = inCategory.length === 0

  const { dx, zoom, resetZoom, handlers } = useStageGestures({
    enabled: Boolean(onStage) && !empty && !rotating,
    onSwipe: (dir) => {
      if (!onStage) return
      if (dir === 'pass') next()
      else toggleSave(onStage.id)
    },
  })

  // Zoom is a property of the object being looked at, so it resets when the
  // object changes rather than carrying over to the next one.
  useEffect(() => {
    resetZoom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStage?.id])

  // Keep the URL in step with the view so a reload, a share, or the back button
  // lands on the same filters instead of resetting to All.
  useEffect(() => {
    const params = new URLSearchParams()
    if (category !== 'all') params.set('category', category)
    if (mode !== 'discover') params.set('view', mode)
    if (query.trim()) params.set('q', query.trim())
    if (sort !== 'featured') params.set('sort', sort)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [category, mode, query, sort])

  return (
    <div className="showroom">
      {/* LAYER 1 — locked environment. Background only, from the `showroom`
          entry of the scene manifest, through the shared SceneBackground. */}
      <div className="showroom-bg" aria-hidden="true">
        <SceneBackground
          desktopVideo={scene?.desktopVideo ?? undefined}
          mobileVideo={scene?.mobileVideo ?? undefined}
          webmVideo={scene?.webmVideo ?? undefined}
          posterImage={scene?.posterImage ?? '/images/showroom-poster.png'}
          posterMotion={scene?.posterMotion ?? 'push-in'}
        />
        <RealismLayer />
        <span className="showroom-bg-scrim" />
      </div>

      {/* LAYER 2 — real interface, never part of the background. */}
      <div className="showroom-ui">
        {/* The showroom is deliberately chrome-less, so its only visible
            heading is the object currently on the stage — which changes as you
            swipe. That left the page with no stable top-level heading at all:
            the outline began at h2 with a product name. This names the page for
            a screen reader and a crawler without putting type on the stage. */}
        <h1 className="sr-only">The Collection</h1>

        <nav className="showroom-categories" aria-label="Showroom categories">
          <button
            type="button"
            data-active={category === 'all' ? 'true' : undefined}
            onClick={() => setCategory('all')}
          >
            All
          </button>
          {SHOWROOM_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              data-active={category === c ? 'true' : undefined}
              onClick={() => setCategory(c)}
            >
              {categoryLabel(c)}
            </button>
          ))}
        </nav>

        <div className="showroom-modes" role="tablist" aria-label="Showroom view">
          <button
            role="tab"
            aria-selected={mode === 'discover'}
            onClick={() => setMode('discover')}
          >
            Discover
          </button>
          <button
            role="tab"
            aria-selected={mode === 'browse'}
            onClick={() => setMode('browse')}
          >
            Browse All
          </button>
        </div>

        {mode === 'discover' ? (
          <section
            className="showroom-stage"
            id="showroom-stage"
            tabIndex={0}
            onKeyDown={onKeyDown}
            aria-label="Product stage"
            {...handlers}
          >
            {/* LAYER 3 */}
            <StageProduct product={empty ? null : onStage} rotating={rotating} zoom={zoom} dx={dx} />

            <div className="showroom-panel">
              {onStage && !empty ? (
                <>
                  <p className="showroom-progress">
                    {String(inCategory.indexOf(onStage) + 1).padStart(2, '0')} /{' '}
                    {String(inCategory.length).padStart(2, '0')}
                  </p>
                  <h2 className="showroom-name">{onStage.name}</h2>
                  <p className="showroom-desc">{onStage.description}</p>
                  <p className="showroom-price">
                    {onStage.price ? `$${onStage.price}` : 'Price to be confirmed'}
                  </p>

                  <div className="showroom-actions">
                    {onStage.purchaseType === 'affiliate' ? (
                      onStage.affiliateUrl ? (
                        <a
                          className="add-to-cart-btn"
                          href={onStage.affiliateUrl}
                          target="_blank"
                          rel="sponsored noopener noreferrer"
                          onClick={() => track('amazon_outbound', { slug: onStage.id })}
                        >
                          VIEW AT PARTNER ↗
                        </a>
                      ) : (
                        <button className="add-to-cart-btn" disabled>
                          LINK COMING SOON
                        </button>
                      )
                    ) : (
                      <AddToCartButton
                        disabled={onStage.stockStatus !== 'in_stock'}
                        item={{
                          slug: onStage.id,
                          name: onStage.name,
                          price: onStage.price ?? 0,
                          heroImage: onStage.productImage ?? undefined,
                        }}
                      />
                    )}
                    <Link className="showroom-details" href={`/shop/${onStage.id}/`}>
                      View Details
                    </Link>
                  </div>

                  <div className="showroom-view-controls">
                    <button
                      type="button"
                      aria-pressed={rotating}
                      disabled={onStage.rotationSequence.length < 2}
                      onClick={() => setRotating((r) => !r)}
                      title={
                        onStage.rotationSequence.length < 2
                          ? 'No rotation sequence for this product yet'
                          : undefined
                      }
                    >
                      360 View
                    </button>
                    <button type="button" onClick={resetZoom} disabled={zoom === 1}>
                      Reset zoom
                    </button>
                  </div>

                  <div className="showroom-deck">
                    <button type="button" onClick={next} className="showroom-pass">
                      Pass
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSave(onStage.id)}
                      className="showroom-save"
                      aria-pressed={isSaved}
                    >
                      {isSaved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                  <p className="showroom-note">
                    Swipe left to pass, right to save — or use the buttons and arrow keys.
                    Pass moves on; nothing is removed. Saved items are kept on this device.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="showroom-name">Select a product to begin.</h2>
                  <p className="showroom-desc">
                    Nothing is listed in this category yet.
                  </p>
                  <div className="showroom-actions">
                    <button className="add-to-cart-btn" disabled>
                      ADD TO BAG
                    </button>
                    <span className="showroom-details" aria-disabled="true" data-disabled="true">
                      View Details
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="showroom-browse" aria-label="Full catalogue">
            <div className="showroom-filters">
              <label>
                <span>Search</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Candle, tote, book…"
                />
              </label>
              <label>
                <span>Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price · low to high</option>
                  <option value="price-desc">Price · high to low</option>
                  <option value="name">A–Z</option>
                </select>
              </label>
              <p className="showroom-count" role="status" aria-live="polite">
                {catalogue.length} {catalogue.length === 1 ? 'item' : 'items'}
              </p>
            </div>

            {catalogue.length > 0 ? (
              <ul className="showroom-grid">
                {catalogue.map((p) => (
                  <li key={p.id}>
                    <article className="showroom-card">
                      <button
                        type="button"
                        className="showroom-card-media"
                        onClick={() => selectForStage(p.id)}
                        aria-label={`Show ${p.name} on the stage`}
                      >
                        {p.productImage ? (
                          <img src={p.productImage} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span className="showroom-card-blank" aria-hidden="true" />
                        )}
                      </button>
                      <h3>{p.name}</h3>
                      <p className="showroom-card-price">
                        {p.price ? `$${p.price}` : 'Coming soon'}
                      </p>
                      <div className="showroom-card-actions">
                        <Link href={`/shop/${p.id}/`}>Details</Link>
                        <button
                          type="button"
                          onClick={() => toggleSave(p.id)}
                          aria-pressed={saved.includes(p.id)}
                        >
                          {saved.includes(p.id) ? 'Saved' : 'Save'}
                        </button>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            ) : (
              // Empty shells rather than invented products.
              <ul className="showroom-grid" aria-label="No products yet">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i}>
                    <article className="showroom-card" data-empty="true">
                      <span className="showroom-card-blank" aria-hidden="true" />
                      <h3>—</h3>
                      <p className="showroom-card-price">Nothing listed yet</p>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="showroom-escape">
          <Link href="/shop/">View All Products →</Link>
        </p>
      </div>
    </div>
  )
}
