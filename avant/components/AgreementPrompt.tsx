'use client'

import Link from 'next/link'
import { useState } from 'react'
import { LEGAL_VERSIONS } from '@/lib/legal'
import { useSession } from './Session'

/** When the terms or privacy notice change, signed-in people see what changed and accept the new version. */
export function AgreementPrompt() {
  const { user, agreements, refresh } = useSession()
  const [busy, setBusy] = useState(false)
  if (!user || !agreements.length) return null
  const names = agreements.map((d) => (d === 'terms' ? 'Terms' : 'Privacy notice'))

  const accept = async () => {
    setBusy(true)
    await fetch('/api/me/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documents: agreements, versions: Object.fromEntries(agreements.map((d) => [d, LEGAL_VERSIONS[d]])) }),
    }).catch(() => undefined)
    await refresh()
    setBusy(false)
  }

  return (
    <aside className="agreement" aria-label="Updated terms">
      <p className="small">
        We&apos;ve updated our {names.join(' and ')}.{' '}
        {agreements.map((d, i) => (
          <span key={d}>
            {i ? ' · ' : ''}
            <Link className="link" href={d === 'terms' ? '/legal/terms' : '/legal/privacy'}>
              Read the {d === 'terms' ? 'terms' : 'privacy notice'}
            </Link>
          </span>
        ))}
      </p>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void accept()}>
        {busy ? 'Saving…' : 'I agree'}
      </button>
    </aside>
  )
}
