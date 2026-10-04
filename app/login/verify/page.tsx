'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Button, Field, Panel, inputClass } from '@/components/ui'
import { normaliseCode } from '@/lib/security/mfa'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * The second half of signing in.
 *
 * A person with an authenticator enrolled lands here after their password.
 * Until they present a code, the server treats them as not signed in: every
 * protected page redirects here, every API route answers 401. There is no
 * "skip" and no "remember this device" — a second factor that can be waived
 * is a first factor with extra steps.
 */
export default function VerifyPage() {
  return (
    <main className="field-bg flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Suspense fallback={null}>
          <VerifyForm />
        </Suspense>
      </div>
    </main>
  )
}

function VerifyForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/app/command-center'

  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'working' | 'none'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const supabase = supabaseBrowser()
      const { data } = await supabase.auth.mfa.listFactors()
      const verified = data?.totp.find((f) => f.status === 'verified')
      if (cancelled) return
      if (!verified) {
        // Nothing to verify against: either no factor, or already at the top level.
        setState('none')
        router.replace(next.startsWith('/') ? next : '/app/command-center')
        return
      }
      setFactorId(verified.id)
      setState('ready')
    })()
    return () => {
      cancelled = true
    }
  }, [router, next])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const digits = normaliseCode(code)
    if (!digits || !factorId) {
      setError('Enter the six-digit code from your authenticator app.')
      return
    }
    setState('working')
    setError(null)
    const supabase = supabaseBrowser()
    const challenge = await supabase.auth.mfa.challenge({ factorId })
    if (challenge.error || !challenge.data) {
      setError('The check could not be started. Try again.')
      setState('ready')
      return
    }
    const verify = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: digits,
    })
    if (verify.error) {
      // Generic on purpose: the difference between "wrong code" and "expired
      // challenge" is not worth handing to someone guessing.
      setError('That code did not match. Codes change every thirty seconds.')
      setCode('')
      setState('ready')
      return
    }
    router.replace(next.startsWith('/') ? next : '/app/command-center')
    router.refresh()
  }

  return (
    <Panel>
      <h1 className="text-2xl font-semibold">One more step</h1>
      <p className="mt-1.5 text-sm text-muted">
        Enter the code from your authenticator app. Your account has a second factor, so a
        password alone does not sign you in.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Six-digit code">
          <input
            className={`${inputClass} tabular text-lg tracking-[0.4em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={state !== 'ready'}
            autoFocus
            required
          />
        </Field>
        <Button type="submit" className="w-full" disabled={state !== 'ready'}>
          {state === 'working' ? 'Checking…' : 'Continue'}
        </Button>
      </form>

      <p className="mt-6 text-xs text-muted">
        Lost the device?{' '}
        <Link href="/auth/signout" className="text-signal hover:underline">
          Sign out
        </Link>{' '}
        and use a recovery method you set up, or contact the person who runs this deployment.
      </p>
    </Panel>
  )
}
