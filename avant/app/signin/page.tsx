import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthForm } from '@/components/AuthForm'

export const metadata: Metadata = { title: 'Sign in' }

export default function SignInPage() {
  return (
    <div className="wrap page">
      <Suspense fallback={<div className="skeleton" />}>
        <AuthForm />
      </Suspense>
    </div>
  )
}
