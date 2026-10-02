'use client'

import { useEffect } from 'react'
import { actions } from '@/lib/store'

/** Records a car page visit for "Recently viewed". Renders nothing. */
export function Viewed({ slug }: { slug: string }) {
  useEffect(() => actions.viewed(slug), [slug])
  return null
}
