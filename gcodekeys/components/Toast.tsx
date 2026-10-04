'use client'

import { useCart } from './CartProvider'

export function Toast() {
  const { toast } = useCart()
  return (
    <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
      {toast}
    </div>
  )
}
