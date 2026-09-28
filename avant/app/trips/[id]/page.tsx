import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TripDetail } from '@/components/Trips'

export const metadata: Metadata = { title: 'Trip', robots: { index: false } }

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="wrap page">
      <Suspense fallback={<div className="skeleton" />}>
        <TripDetail id={id} />
      </Suspense>
    </div>
  )
}
