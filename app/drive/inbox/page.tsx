import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Inbox } from '@/components/drive/Inbox'
import { DRIVE } from '@/lib/drive/routes'

export const metadata: Metadata = {
  title: 'Inbox',
  description: 'Your conversations with hosts, one thread per car or trip.',
  alternates: { canonical: DRIVE.inbox },
}

export default function InboxPage() {
  return (
    <div className="dr-container dr-page">
      <h1 className="dr-h1">Inbox</h1>
      <Suspense fallback={<div className="dr-skeleton dr-skeleton-block" aria-busy="true" />}>
        <Inbox />
      </Suspense>
    </div>
  )
}
