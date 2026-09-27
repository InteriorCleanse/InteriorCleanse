import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ListingWizard } from '@/components/drive/Host'
import { DRIVE } from '@/lib/drive/routes'

export const metadata: Metadata = {
  title: 'List your car',
  description: 'Add your car in four short steps. Drafts stay on this device until you publish.',
  alternates: { canonical: DRIVE.hostNew },
}

export default function NewListingPage() {
  return (
    <div className="dr-container dr-page">
      <h1 className="dr-visually-hidden">List your car</h1>
      <Suspense fallback={<div className="dr-skeleton dr-skeleton-block" aria-busy="true" />}>
        <ListingWizard />
      </Suspense>
    </div>
  )
}
