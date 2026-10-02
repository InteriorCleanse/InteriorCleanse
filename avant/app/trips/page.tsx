import type { Metadata } from 'next'
import { TripsHome } from '@/components/Trips'

export const metadata: Metadata = { title: 'Trips', robots: { index: false } }

export default function TripsPage() {
  return (
    <div className="wrap page" style={{ maxWidth: 880 }}>
      <h1 className="app-title">Trips</h1>
      <TripsHome />
    </div>
  )
}
