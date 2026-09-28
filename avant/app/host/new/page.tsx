import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ListingWizard } from '@/components/ListingWizard'

export const metadata: Metadata = {
  title: 'List your car',
  description: 'List your car on AVANT in five short steps: the car, where guests pick it up, your price and a safety check.',
  robots: { index: false },
}

export default function NewListingPage() {
  return (
    <div className="wrap page">
      <Suspense fallback={<div className="skeleton" />}>
        <ListingWizard />
      </Suspense>
    </div>
  )
}
