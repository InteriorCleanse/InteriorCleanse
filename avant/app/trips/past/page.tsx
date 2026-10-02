import type { Metadata } from 'next'
import { PastTrips } from '@/components/Trips'
import { Breadcrumbs } from '@/components/ui'

export const metadata: Metadata = { title: 'Past trips', robots: { index: false } }

export default function PastTripsPage() {
  return (
    <div className="wrap page" style={{ maxWidth: 880 }}>
      <Breadcrumbs items={[{ label: 'Trips', href: '/trips' }, { label: 'Past trips' }]} />
      <h1 className="app-title">Past trips</h1>
      <PastTrips />
    </div>
  )
}
