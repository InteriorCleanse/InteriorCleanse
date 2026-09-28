import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SearchExperience } from '@/components/SearchExperience'

export const metadata: Metadata = {
  title: 'Search cars',
  description: 'Every car on a live map with all-in prices. Filter by dates, type, power, seats and delivery.',
}

export default function SearchPage() {
  return (
    <>
      <h1 className="sr-only">Search cars</h1>
      <Suspense fallback={<div className="wrap page"><div className="skeleton" /></div>}>
        <SearchExperience />
      </Suspense>
    </>
  )
}
