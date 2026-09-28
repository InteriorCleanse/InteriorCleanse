import { Suspense } from 'react'
import { TripConfirm } from '@/components/Trips'

export const metadata = { title: 'Confirming', robots: { index: false } }

export default function ConfirmPage() {
  return (
    <div className="wrap page">
      <h1 className="page-title" style={{ marginBottom: 20 }}>
        Confirming <em>payment…</em>
      </h1>
      <Suspense fallback={<div className="skeleton" />}>
        <TripConfirm />
      </Suspense>
    </div>
  )
}
