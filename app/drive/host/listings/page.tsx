import type { Metadata } from 'next'
import { ListingsList } from '@/components/drive/Host'
import { Breadcrumbs, Button } from '@/components/drive/ui'
import { DRIVE } from '@/lib/drive/routes'

export const metadata: Metadata = {
  title: 'My listings',
  description: 'Your cars on Drive: drafts and published listings, with pause, edit and delete.',
  alternates: { canonical: DRIVE.hostListings },
}

export default function ListingsPage() {
  return (
    <div className="dr-container dr-page">
      <Breadcrumbs items={[{ label: 'Host', href: DRIVE.host }, { label: 'My listings' }]} />
      <div className="dr-page-head">
        <h1 className="dr-h1">My listings</h1>
        <Button href={DRIVE.hostNew} icon="plus">
          Add a car
        </Button>
      </div>
      <ListingsList />
    </div>
  )
}
