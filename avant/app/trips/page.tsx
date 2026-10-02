import type { Metadata } from 'next'
import { TripsList } from '@/components/Trips'

export const metadata: Metadata = { title: 'Trips' }

export default function TripsPage() {
  return (
    <div className="wrap page">
      <h1 className="page-title" style={{ marginBottom: 28 }}>
        Your trips.
      </h1>
      <TripsList />
    </div>
  )
}
