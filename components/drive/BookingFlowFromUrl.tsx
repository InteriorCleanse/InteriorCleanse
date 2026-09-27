'use client'

import { useSearchParams } from 'next/navigation'
import type { Car } from '@/lib/drive/types'
import { BookingFlow } from './BookingFlow'

export function BookingFlowFromUrl({ car }: { car: Car }) {
  const params = useSearchParams()
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
  return <BookingFlow car={car} initialStart={iso(params.get('start'))} initialEnd={iso(params.get('end'))} />
}
