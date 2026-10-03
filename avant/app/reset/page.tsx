import type { Metadata } from 'next'
import { ResetForm } from '@/components/Recovery'

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false }, referrer: 'no-referrer' }

export default function ResetPage() {
  return (
    <div className="wrap page">
      <ResetForm />
    </div>
  )
}
