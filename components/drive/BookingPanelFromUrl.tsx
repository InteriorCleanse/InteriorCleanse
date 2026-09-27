'use client'

import { useSearchParams } from 'next/navigation'
import type { Car } from '@/lib/drive/types'
import { BookingPanel } from './BookingPanel'

/** The panel, pre-filled from ?start=&end= when the visitor came from a dated search. */
export function BookingPanelFromUrl({ car }: { car: Car }) {
  const params = useSearchParams()
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  return <BookingPanel car={car} initialStart={iso(params.get('start'))} initialEnd={iso(params.get('end'))} />
}
