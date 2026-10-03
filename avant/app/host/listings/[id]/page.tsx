import type { Metadata } from 'next'
import { ListingEditor } from '@/components/ListingEditor'

export const metadata: Metadata = { title: 'Edit listing', robots: { index: false } }

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="wrap page" style={{ maxWidth: 880 }}>
      <ListingEditor id={(await params).id} />
    </div>
  )
}
