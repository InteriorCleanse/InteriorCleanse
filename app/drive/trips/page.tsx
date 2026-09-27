import type { Metadata } from 'next'
import { TripsList } from '@/components/drive/Trips'
import { DRIVE } from '@/lib/drive/routes'

export const metadata: Metadata = {
  title: 'Trips',
  description: 'Upcoming, past and cancelled trips, each with its check-in list, receipt, calendar file and host thread.',
  alternates: { canonical: DRIVE.trips },
}

export default function TripsPage() {
  return (
    <div className="dr-container dr-page">
      <h1 className="dr-h1">Trips</h1>
      <TripsList />
    </div>
  )
}
