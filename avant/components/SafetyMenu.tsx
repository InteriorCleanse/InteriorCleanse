'use client'

/**
 * Report someone (and optionally block them), or block them outright. Takes
 * the thing the person can see (a trip, a message, a review); the server
 * works out who is behind it. Reports reach AVANT's support team.
 */

import { useState } from 'react'
import { useSession } from './Session'
import { useToast } from './Toast'

const REASONS = [
  'Harassment or threats',
  'Discrimination or hate',
  'Spam or a scam',
  'Asking to pay outside AVANT',
  'Inappropriate content',
  'Unsafe car or driving',
  'Something else',
] as const

type Context = 'profile' | 'message' | 'review' | 'listing' | 'trip'

export function SafetyMenu({ context, subjectId, name, canBlock = true }: { context: Context; subjectId: string; name: string; canBlock?: boolean }) {
  const toast = useToast()
  const { user } = useSession()
  const [mode, setMode] = useState<'closed' | 'report' | 'block'>('closed')
  const [reason, setReason] = useState<(typeof REASONS)[number]>(REASONS[0])
  const [details, setDetails] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!user) return null

  const send = async (url: string, body: unknown, done: string) => {
    setBusy(true)
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    toast(res.ok ? done : (json.error ?? 'That didn’t go through. Try again.'))
    if (res.ok) setMode('closed')
  }

  if (mode === 'closed') {
    return (
      <span className="safety-links">
        <button type="button" className="text-btn" onClick={() => setMode('report')}>
          Report
        </button>
        {canBlock ? (
          <button type="button" className="text-btn" onClick={() => setMode('block')}>
            Block
          </button>
        ) : null}
      </span>
    )
  }

  if (mode === 'block') {
    return (
      <div className="panel stack safety-panel" style={{ gap: 10 }}>
        <strong>Block {name}?</strong>
        <p className="small muted">
          They won&apos;t be able to message you or book with you, and you won&apos;t be able to with them. Trips already confirmed stay as they are;
          contact support if you need help with one. You can unblock from your Profile.
        </p>
        <div className="row">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void send('/api/safety/block', { context, subjectId, on: true }, `${name} is blocked`)}>
            Block
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('closed')}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      method="post"
      className="panel stack safety-panel"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault()
        void send('/api/safety/report', { context, subjectId, reason, details, alsoBlock: canBlock && alsoBlock }, 'Thanks. Our team will look at it within 24 hours.')
      }}
    >
      <strong>Report {context === 'review' ? 'this review' : context === 'message' ? 'this message' : name}</strong>
      <label className="field">
        <span className="label">What&apos;s wrong</span>
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}>
          {REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Anything we should know (optional)</span>
        <textarea className="textarea" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      {canBlock ? (
        <label className="check">
          <input type="checkbox" checked={alsoBlock} onChange={() => setAlsoBlock((b) => !b)} />
          <span className="small">Also block {name}</span>
        </label>
      ) : null}
      <p className="small muted">If you&apos;re in danger, call 911 first.</p>
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('closed')}>
          Cancel
        </button>
      </div>
    </form>
  )
}
