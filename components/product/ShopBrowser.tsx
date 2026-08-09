'use client'

import { useMemo, useState } from 'react'
import { ProductCard } from '@/components/cards'
import type { Product } from '@/lib/types'

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'name'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price · low to high' },
  { value: 'price-desc', label: 'Price · high to low' },
  { value: 'name', label: 'A–Z' },
]

/**
 * Search, filter, and sort over the catalogue.
 *
 * Everything runs client-side over the already-rendered product list — there
 * are six products, so a round-trip per keystroke would be pure latency. The
 * controls are ordinary form elements at readable sizes: the brief is explicit
 * that motion belongs to the object, never to a price or a control.
 */
export function ShopBrowser({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [sort, setSort] = useState<Sort>('featured')

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()

    const filtered = products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      )
    })

    // Sorting a copy — the prop array belongs to the caller.
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return a.price - b.price
        case 'price-desc':
          return b.price - a.price
        case 'name':
          return a.name.localeCompare(b.name)
        default:
          return Number(b.featured) - Number(a.featured)
      }
    })
  }, [products, query, category, sort])

  return (
    <>
      <div className="shop-controls">
        <label className="shop-field">
          <span className="shop-field-label">Search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Candle, tote, print…"
          />
        </label>

        <label className="shop-field">
          <span className="shop-field-label">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All categories' : c}
              </option>
            ))}
          </select>
        </label>

        <label className="shop-field">
          <span className="shop-field-label">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="shop-count" role="status" aria-live="polite">
        {visible.length} {visible.length === 1 ? 'object' : 'objects'}
      </p>

      {visible.length > 0 ? (
        <div className="product-grid" style={{ marginTop: '2rem' }}>
          {visible.map((p, i) => (
            <ProductCard product={p} index={i} key={p.slug} />
          ))}
        </div>
      ) : (
        <div className="collection-empty">
          <p className="collection-empty-copy">
            Nothing matches that. Try a different word, or clear the filters.
          </p>
          <button
            className="btn-ghost"
            onClick={() => {
              setQuery('')
              setCategory('all')
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  )
}
