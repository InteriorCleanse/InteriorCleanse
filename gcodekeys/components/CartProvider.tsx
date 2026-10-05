'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const STORE_KEY = 'gck-cart-v1'

export type CartItem = {
  key: string
  name: string
  price: number
  qty: number
  meta?: string
}

type CartCtx = {
  items: CartItem[]
  count: number
  total: number
  add: (item: Omit<CartItem, 'qty'>, toastMsg?: string) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  clear: () => void
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  toast: string
  pop: (msg: string) => void
}

const Ctx = createContext<CartCtx | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [toast, setToast] = useState('')
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guard writes until the cart has been hydrated from storage, so the initial
  // empty state never clobbers a saved bag before we've read it.
  const hydrated = useRef(false)

  // Load the saved bag once on mount. Done in an effect (not a lazy useState
  // initializer) so server and first client render both start empty — no
  // hydration mismatch on the header cart count.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const clean = parsed.filter(
            (x): x is CartItem =>
              x && typeof x.key === 'string' && typeof x.name === 'string' &&
              typeof x.price === 'number' && typeof x.qty === 'number',
          )
          if (clean.length) setItems(clean)
        }
      }
    } catch {
      /* storage unavailable or corrupt — start with an empty bag */
    }
    hydrated.current = true
  }, [])

  // Persist on every change, but not before the initial load has run.
  useEffect(() => {
    if (!hydrated.current) return
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(items))
    } catch {
      /* storage unavailable (private mode, quota) — cart stays in memory */
    }
  }, [items])

  const pop = useCallback((msg: string) => {
    setToast(msg)
    if (tRef.current) clearTimeout(tRef.current)
    tRef.current = setTimeout(() => setToast(''), 1600)
  }, [])

  const add: CartCtx['add'] = useCallback((item, toastMsg) => {
    setItems((xs) => {
      const i = xs.findIndex((x) => x.key === item.key)
      if (i >= 0) {
        const next = xs.slice()
        next[i] = { ...next[i], qty: next[i].qty + 1 }
        return next
      }
      return [...xs, { ...item, qty: 1 }]
    })
    pop(toastMsg ?? 'Added to cart')
  }, [pop])

  const setQty = useCallback((key: string, qty: number) => {
    setItems((xs) => xs.flatMap((x) => (x.key === key ? (qty <= 0 ? [] : [{ ...x, qty }]) : [x])))
  }, [])
  const remove = useCallback((key: string) => setItems((xs) => xs.filter((x) => x.key !== key)), [])
  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartCtx>(() => {
    const count = items.reduce((n, x) => n + x.qty, 0)
    const total = items.reduce((n, x) => n + x.qty * x.price, 0)
    return {
      items, count, total, add, setQty, remove, clear,
      drawerOpen, openDrawer: () => setDrawerOpen(true), closeDrawer: () => setDrawerOpen(false),
      toast, pop,
    }
  }, [items, add, setQty, remove, clear, drawerOpen, toast, pop])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCart must be used within CartProvider')
  return c
}
