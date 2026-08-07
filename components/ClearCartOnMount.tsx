'use client'

import { useEffect } from 'react'
import { useCart } from './cart'

/**
 * Empties the bag once the visitor lands on the success page.
 *
 * Stripe redirects here only after payment succeeds, so this is the point at
 * which the local cart is definitively stale.
 */
export function ClearCartOnMount() {
  const { clear } = useCart()
  useEffect(() => {
    clear()
  }, [clear])
  return null
}
