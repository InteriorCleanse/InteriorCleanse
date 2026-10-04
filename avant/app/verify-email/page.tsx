import type { Metadata } from 'next'
import { VerifyEmail } from '@/components/Recovery'

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false }, referrer: 'no-referrer' }

export default function VerifyEmailPage() {
  return (
    <div className="wrap page">
      <VerifyEmail />
    </div>
  )
}
