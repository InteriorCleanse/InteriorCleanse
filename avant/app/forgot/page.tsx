import type { Metadata } from 'next'
import { ForgotForm } from '@/components/Recovery'

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } }

export default function ForgotPage() {
  return (
    <div className="wrap page">
      <ForgotForm />
    </div>
  )
}
