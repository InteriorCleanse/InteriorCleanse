import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TripDetail } from '@/components/drive/Trips'

export const metadata: Metadata = {
  title: 'Trip',
  description: 'Your trip: dates, pickup, check-in checklist, receipt and host.',
  robots: { index: false, follow: false },
}

export default function TripPage({ params }: { params: { id: string } }) {
  return (
    <div className="dr-container dr-page">
      <Suspense fallback={<div className="dr-skeleton dr-skeleton-block" aria-busy="true" />}>
        <TripDetail id={params.id} />
      </Suspense>
    </div>
  )
}
