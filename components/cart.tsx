'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { track } from '@/lib/analytics'
import { isInternalCheckout } from '@/lib/category-experience'
import { getProduct } from '@/lib/content'

export type CartItem = {
  slug: string
  name: string
  price: number
  quantity: number
  heroImage?: string
  printfulVariantId?: string
  printifyVariantId?: string
}

type CartContextValue = {
  items: CartItem[]
  count: number
  total: number
  open: boolean
  setOpen: (open: boolean) => void
  add: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  remove: (slug: string) => void
  clear: () => void
  checkout: () => Promise<void>
}

const CartContext = createContext<CartContextValue | null>(null)
const STORAGE_KEY = 'ic_cart'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Load after mount: reading localStorage during render would make the server
  // and client markup disagree and trigger a hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setItems(JSON.parse(raw))
    } catch {
      /* Corrupt cart data shouldn't break the storefront. */
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items, hydrated])

  const add: CartContextValue['add'] = useCallback((item, quantity = 1) => {
    // An Amazon or TikTok item is bought on someone else's checkout, so it can
    // never sit in this cart. Enforced here at the single choke point rather
    // than trusted to every caller, and resolved from the catalogue rather
    // than from the argument — a caller cannot talk its way past it.
    const product = getProduct(item.slug)
    if (product && !isInternalCheckout(product)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[cart] Refused "${item.slug}": checkoutMode "${product.checkoutMode}" is external. Use PurchaseAction, which renders the outbound CTA instead.`
        )
      }
      return
    }

    track('add_to_cart', { slug: item.slug, quantity })

    setItems((prev) => {
      const existing = prev.find((i) => i.slug === item.slug)
      if (existing) {
        return prev.map((i) =>
          i.slug === item.slug ? { ...i, quantity: i.quantity + quantity } : i
        )
      }
      return [...prev, { ...item, quantity }]
    })
    setOpen(true)
  }, [])

  const remove = useCallback((slug: string) => {
    setItems((prev) => prev.filter((i) => i.slug !== slug))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const checkout = useCallback(async () => {
    if (items.length === 0) return
    track('checkout_started', { lines: items.length })
    // Send slugs and quantities only. Prices shown here are for display; the
    // server resolves the real Stripe Price for each slug, so nothing the
    // browser sends can change what the customer is charged.
    const res = await fetch('/api/checkout/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((i) => ({ slug: i.slug, quantity: i.quantity })),
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.url) {
      throw new Error(data.error ?? 'Could not start checkout.')
    }
    window.location.href = data.url
  }, [items])

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      total: items.reduce((n, i) => n + i.price * i.quantity, 0),
      open,
      setOpen,
      add,
      remove,
      clear,
      checkout,
    }),
    [items, open, add, remove, clear, checkout]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}

export function AddToCartButton({
  item,
  disabled,
}: {
  item: Omit<CartItem, 'quantity'>
  disabled?: boolean
}) {
  const { add } = useCart()

  if (disabled) {
    return (
      <button className="add-to-cart-btn" disabled>
        COMING SOON <span>◇</span>
      </button>
    )
  }

  return (
    <button className="add-to-cart-btn" onClick={() => add(item)}>
      ADD TO CART <span>→</span>
    </button>
  )
}

export function CartDrawer() {
  const { items, total, open, setOpen, remove, checkout } = useCart()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const go = async () => {
    setBusy(true)
    setError('')
    try {
      await checkout()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed.')
      setBusy(false)
    }
  }

  return (
    <div
      className="popup-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="popup-box" role="dialog" aria-modal="true" aria-label="Cart">
        <button className="popup-close" onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
        <p className="eyebrow popup-eyebrow">Your bag</p>

        {items.length === 0 ? (
          <p className="popup-copy">Nothing here yet.</p>
        ) : (
          <>
            <ul className="cart-lines">
              {items.map((i) => (
                <li key={i.slug}>
                  <span>
                    {i.name}
                    {i.quantity > 1 ? ` × ${i.quantity}` : ''}
                  </span>
                  <span className="cart-line-price">
                    ${(i.price * i.quantity).toFixed(2)}
                  </span>
                  <button onClick={() => remove(i.slug)} aria-label={`Remove ${i.name}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            <div className="cart-total">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>

            {error ? <p className="admin-error">{error}</p> : null}

            <button className="popup-submit" onClick={go} disabled={busy}>
              {busy ? 'Redirecting…' : 'Checkout →'}
            </button>
            <p className="popup-privacy">
              Payment is completed securely on Stripe. Shipping and tax are calculated at
              checkout.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export function CartButton() {
  const { count, setOpen } = useCart()
  return (
    <button className="nav-cta" onClick={() => setOpen(true)}>
      Bag{count > 0 ? ` (${count})` : ''}
    </button>
  )
}
