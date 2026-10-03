import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@/components/Icons'
import { MyListings } from '@/components/ListingWizard'
import { Breadcrumbs } from '@/components/ui'

export const metadata: Metadata = { title: 'My listings', robots: { index: false } }

export default function ListingsPage() {
  return (
    <div className="wrap page">
      <Breadcrumbs items={[{ label: 'Host', href: '/host' }, { label: 'My listings' }]} />
      <div className="between" style={{ marginBottom: 28 }}>
        <h1 className="page-title">
          Your listings.
        </h1>
        <div className="row">
          <Link href="/host/earnings" className="btn btn-secondary btn-md">
            Earnings
          </Link>
          <Link href="/host/new" className="btn btn-primary btn-md">
            <Icon name="plus" size={16} /> Add a car
          </Link>
        </div>
      </div>
      <MyListings />
    </div>
  )
}
