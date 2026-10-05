'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { reencodePhoto } from '@/lib/photo'
import { clearEvidence } from '@/lib/evidence-db'
import { clearListingPhotos } from '@/lib/listing-photos-db'
import { actions, useLocal } from '@/lib/store'
import { useDriver } from './DriverProvider'
import { Icon } from './Icons'
import { BlockedPeople, NotificationSettings, SecuritySettings } from './Settings'
import { useToast } from './Toast'
import { useSession } from './Session'
import { Avatar, ButtonLink, Empty, Notice } from './ui'

/** Name, photo and a few words: what hosts and guests see about you. */
function Profile() {
  const { user, refresh } = useSession()
  const toast = useToast()
  const [name, setName] = useState(user?.name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  if (!user) return null

  const save = async () => {
    setBusy(true)
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, bio }) })
    setBusy(false)
    toast(res.ok ? 'Profile saved' : 'Couldn’t save. Check your name.')
    if (res.ok) await refresh()
  }

  const upload = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    try {
      const { blob } = await reencodePhoto(f, 800)
      const res = await fetch('/api/me/avatar', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob })
      const json = await res.json().catch(() => ({}))
      toast(res.ok ? 'Photo updated' : json.error ?? 'Couldn’t use that photo.')
      if (res.ok) await refresh()
    } catch {
      toast('Couldn’t read that photo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="profile">
      <div className="profile-head" style={{ paddingTop: 0 }}>
        <Avatar name={user.name} photo={user.photo} size={84} />
        <div className="stack" style={{ gap: 6 }}>
          <h2 id="profile" style={{ fontSize: '1.4rem', fontWeight: 300 }}>
            {user.name}
          </h2>
          <span className="small dim">Signed in as {user.email}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => file.current?.click()} disabled={busy}>
            {user.photo ? 'Change photo' : 'Add a photo of you'}
          </button>
          <input ref={file} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
      </div>
      <p className="small muted" style={{ marginBottom: 16 }}>
        Hosts and guests see your first name and initial, your photo and these few words. A real, friendly photo builds trust on both sides. Location data is removed from it first.
      </p>
      <div className="stack" style={{ gap: 14 }}>
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
        </label>
        <label className="field">
          <span className="label">About you</span>
          <textarea className="textarea" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={600} placeholder="Where you’re from, what you love to drive, anything that helps a host or guest know you." />
        </label>
        <div className="row">
          <button type="button" className="btn btn-primary btn-md" onClick={save} disabled={busy}>
            Save profile
          </button>
        </div>
      </div>
    </section>
  )
}

export function Account() {
  const { facts, method, verifiedAt, loaded, refresh, modes } = useDriver()
  const session = useSession()
  const { saved } = useLocal()
  const toast = useToast()
  const [confirm, setConfirm] = useState<'driver' | 'local' | null>(null)
  if (session.loaded && !session.user)
    return <Empty icon="user" title="Sign in to see your profile" body="Your profile, Driver Pass and privacy controls live in your account." action={<ButtonLink href="/signin?next=/account">Sign in</ButtonLink>} />
  if (!session.loaded) return <div className="skeleton" />

  const downloadLocal = () => {
    const blob = new Blob([actions.export()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'avant-device-data.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const deleteDriver = async () => {
    const res = await fetch('/api/driver', { method: 'DELETE' })
    if (res.ok) {
      await refresh()
      toast('Driver record deleted')
    } else toast('Could not delete. Try again.')
    setConfirm(null)
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Profile />
      <section className="panel" aria-labelledby="pass">
        <div className="between">
          <h2 id="pass" style={{ fontSize: '1.2rem' }}>Driver Pass</h2>
          {facts.verified ? <span className="badge badge-lime">Verified</span> : <span className="badge">Not verified</span>}
        </div>
        {!loaded ? (
          <div className="skeleton" style={{ minHeight: 80, marginTop: 12 }} />
        ) : facts.verified ? (
          <dl className="kv" style={{ marginTop: 12 }}>
            <div><dt>Age</dt><dd>{facts.age}</dd></div>
            <div><dt>Years licensed</dt><dd>{facts.licenceYears}</dd></div>
            <div><dt>Licence valid to</dt><dd>{facts.licenceExpires}{facts.licenceState ? ` · ${facts.licenceState}` : ''}</dd></div>
            <div><dt>Driving record</dt><dd>{facts.cleanRecord ? 'Clean (young driver fee halved)' : 'Not checked'}</dd></div>
            <div><dt>Verified</dt><dd>{method === 'demo' ? 'Preview (no document checked)' : 'Licence + selfie'} · {verifiedAt ? new Date(verifiedAt).toLocaleDateString() : ''}</dd></div>
          </dl>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>
            Verify once to book. <Link href="/verify" className="link">Start</Link>
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="data">
        <h2 id="data" style={{ fontSize: '1.2rem' }}>Your data</h2>
        <p className="muted small" style={{ marginTop: 6, marginBottom: 16 }}>
          Your Driver Pass is encrypted before it is stored{modes?.vault ? ', in the privacy vault' : ''}; we keep facts like your age, never your licence images. Favorites ({saved.length}) are
          saved to your account; recently viewed cars and listing drafts stay in this browser.
        </p>
        <div className="row">
          <a href="/api/driver/export" className="btn btn-secondary btn-md"><Icon name="download" size={16} /> Export Driver Pass</a>
          <button type="button" className="btn btn-secondary btn-md" onClick={downloadLocal}><Icon name="download" size={16} /> Export this device&apos;s data</button>
        </div>
        <hr className="hairline" />
        {confirm === 'driver' ? (
          <div className="row">
            <button type="button" className="btn btn-danger btn-md" onClick={deleteDriver}>Delete Driver Pass for good</button>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm(null)}>Keep it</button>
          </div>
        ) : confirm === 'local' ? (
          <div className="row">
            <button type="button" className="btn btn-danger btn-md" onClick={async () => { actions.clear(); await clearEvidence(); await clearListingPhotos(); toast('Cleared from this device'); setConfirm(null) }}>Clear this device</button>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm(null)}>Keep them</button>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm('driver')} disabled={!facts.verified}><Icon name="trash" size={16} /> Delete Driver Pass</button>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm('local')}><Icon name="trash" size={16} /> Clear this device</button>
          </div>
        )}
      </section>
      <Notice icon="lock">
        Deleting the Driver Pass also asks our verification partner to redact anything it still holds. <Link href="/security" className="link">How we protect your data</Link>
      </Notice>
      <NotificationSettings />
      <SecuritySettings />
      <BlockedPeople />
      <CloseAccount />
    </div>
  )
}

function CloseAccount() {
  const session = useSession()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/me/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(json.error ?? 'Couldn’t close the account. Try again.')
    actions.clear()
    await session.refresh()
    toast('Your account is closed')
    window.location.assign('/')
  }

  return (
    <section className="panel" aria-labelledby="close">
      <h2 id="close" style={{ fontSize: '1.2rem' }}>Close your account</h2>
      <p className="muted small" style={{ marginTop: 6 }}>
        Deletes your profile, photo, listings, favorites and Driver Pass, and signs you out everywhere. Past trips stay in the other person&apos;s
        history under &ldquo;Former member&rdquo;. You can&apos;t close an account with trips still ahead.
      </p>
      {open ? (
        <form method="post" onSubmit={close} className="stack" style={{ gap: 12, marginTop: 14, maxWidth: 420 }}>
          <label className="field">
            <span className="label">Your password, to confirm</span>
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <p className="error-block" role="alert">{error}</p> : null}
          <div className="row">
            <button type="submit" className="btn btn-danger btn-md" disabled={busy || !password}>{busy ? 'Closing…' : 'Close my account for good'}</button>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setOpen(false)}>Keep it</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-md" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
          <Icon name="trash" size={16} /> Close account
        </button>
      )}
    </section>
  )
}
