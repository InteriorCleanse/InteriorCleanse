import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SearchResults } from '@/components/drive/SearchResults'
import { cars, cities } from '@/lib/drive/data'
import { DRIVE } from '@/lib/drive/routes'

export const metadata: Metadata = {
  title: 'Explore cars',
  description: `Search ${cars.length} cars across ${cities.length} cities by dates, price, body type, fuel and features. Every search is a link.`,
  alternates: { canonical: DRIVE.cars },
}

export default function CarsPage() {
  return (
    <div className="dr-container">
      <h1 className="dr-visually-hidden">Explore cars</h1>
      <Suspense fallback={<div className="dr-skeleton dr-skeleton-block" aria-busy="true" />}>
        <SearchResults />
      </Suspense>
    </div>
  )
}
