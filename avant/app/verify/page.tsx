import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Icon } from '@/components/Icons'
import { VerifyFlow } from '@/components/VerifyFlow'

export const metadata: Metadata = { title: 'Driver Pass', description: 'Verify your licence once and book any car you qualify for with one tap.' }

const KEPT = ['Your age in whole years', 'Years licensed', 'Licence expiry month and issuing state', 'Whether your record is clean', 'How and when you were verified']
const NEVER = ['Your name or date of birth', 'Your licence number or address', 'Photos of your licence or face', 'Your card number']

export default function VerifyPage() {
  return (
    <div className="page page-narrow">
      <p className="eyebrow">Driver Pass</p>
      <h1 className="page-title" style={{ margin: '10px 0 14px' }}>
        Verify once. <em>Book forever.</em>
      </h1>
      <p className="lead" style={{ marginBottom: 28 }}>
        A photo of your licence and a quick selfie, about two minutes. After that every car you qualify for is one tap away.
      </p>
      <Suspense fallback={<div className="skeleton" />}>
        <VerifyFlow />
      </Suspense>
      <div className="grid-2" style={{ marginTop: 40 }}>
        <div className="panel">
          <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>What AVANT keeps</h2>
          <ul className="stack small muted" style={{ listStyle: 'none', padding: 0, gap: 8 }}>
            {KEPT.map((k) => (
              <li key={k} className="row">
                <Icon name="check" size={15} /> {k}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>What AVANT never keeps</h2>
          <ul className="stack small muted" style={{ listStyle: 'none', padding: 0, gap: 8 }}>
            {NEVER.map((k) => (
              <li key={k} className="row">
                <Icon name="eye-off" size={15} /> {k}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="small dim" style={{ marginTop: 16 }}>
        Your record is encrypted before it is stored, and our verification partner is asked to delete the images as soon as the check completes. Delete
        everything any time from Account.
      </p>
    </div>
  )
}
