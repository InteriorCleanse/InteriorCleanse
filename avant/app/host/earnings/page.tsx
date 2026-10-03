import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Earnings } from '@/components/Earnings'
import { Breadcrumbs } from '@/components/ui'

export const metadata: Metadata = { title: 'Earnings', robots: { index: false } }

export default function EarningsPage() {
  return (
    <div className="wrap page" style={{ maxWidth: 880 }}>
      <Breadcrumbs items={[{ label: 'Host', href: '/host' }, { label: 'Earnings' }]} />
      <h1 className="page-title" style={{ marginBottom: 28 }}>
        Earnings.
      </h1>
      <Suspense fallback={<div className="skeleton" />}>
        <Earnings />
      </Suspense>
    </div>
  )
}
