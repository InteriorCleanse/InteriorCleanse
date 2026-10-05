import type { Metadata } from 'next'
import { ConfirmEmailChange } from '@/components/Recovery'

export const metadata: Metadata = { title: 'Confirm your new email', robots: { index: false }, referrer: 'no-referrer' }

export default function ConfirmEmailPage() {
  return (
    <div className="wrap page">
      <ConfirmEmailChange />
    </div>
  )
}
