'use client'

/**
 * Profile settings: notifications (email and, in the iOS app, push),
 * security (password, email address, where you're signed in, your data)
 * and the people you've blocked.
 */

import { useCallback, useEffect, useState } from 'react'
import { disablePush, enablePush, inApp, pushState, refreshPushRegistration, shareFile, type PushState } from '@/lib/native'
import type { SessionInfo } from '@/lib/server/account-settings'
import type { NotifyPrefs } from '@/lib/server/prefs'
import { Icon } from './Icons'
import { useSession } from './Session'
import { useToast } from './Toast'

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: res.ok, json: await res.json().catch(() => ({})) }
}

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

function Switch({ label, note, on, disabled, onChange }: { label: string; note?: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch-row">
      <span>
        <span className="switch-label">{label}</span>
        {note ? <span className="small muted">{note}</span> : null}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function NotificationSettings() {
  const toast = useToast()
  const { user } = useSession()
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null)
  const [push, setPush] = useState<PushState | null>(null)

  useEffect(() => {
    void fetch('/api/me/prefs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setPrefs(j.prefs))
    void pushState().then(setPush)
  }, [])

  const save = async (next: NotifyPrefs) => {
    setPrefs(next)
    const { ok, json } = await post('/api/me/prefs', { prefs: next })
    if (ok) setPrefs(json.prefs as NotifyPrefs)
    else toast('Couldn’t save that. Try again.')
  }
  const set = (channel: 'email' | 'push', key: 'messages' | 'offers', v: boolean) => prefs && void save({ ...prefs, [channel]: { ...prefs[channel], [key]: v } })

  const turnOn = async () => {
    if (!user) return
    const next = await enablePush(user.id)
    setPush(next)
    if (next === 'on') toast('Notifications are on for this iPhone')
  }
  const turnOff = async () => {
    await disablePush()
    setPush('off')
    toast('Notifications are off for this iPhone')
  }

  return (
    <section className="panel" aria-labelledby="notifications-title" id="notifications">
      <h2 id="notifications-title" style={{ fontSize: '1.2rem' }}>
        Notifications
      </h2>
      <p className="muted small" style={{ marginTop: 6 }}>
        Booking, payment, trip, claim and security notices always reach you: you need them to use AVANT. Choose the rest.
      </p>
      {prefs ? (
        <div className="switches">
          <p className="menu-title">By email</p>
          <Switch label="Messages" note="When your host or guest writes. Never the message itself." on={prefs.email.messages} onChange={(v) => set('email', 'messages', v)} />
          <Switch label="Offers and reminders" note="Price drops on cars you saved, Circle and referral news, review reminders." on={prefs.email.offers} onChange={(v) => set('email', 'offers', v)} />
          {push && push !== 'unavailable' ? (
            <>
              <p className="menu-title">On this iPhone</p>
              {push === 'on' ? (
                <>
                  <Switch label="Messages" on={prefs.push.messages} onChange={(v) => set('push', 'messages', v)} />
                  <Switch label="Offers and reminders" on={prefs.push.offers} onChange={(v) => set('push', 'offers', v)} />
                  <p className="small muted">The lock screen shows only the headline, never trip details or amounts.</p>
                  <div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void turnOff()}>
                      Turn off notifications on this iPhone
                    </button>
                  </div>
                </>
              ) : push === 'denied' ? (
                <p className="small muted">Notifications are off in iOS Settings. Open Settings, then AVANT, then Notifications to allow them.</p>
              ) : (
                <div>
                  <button type="button" className="btn btn-primary btn-md" onClick={() => void turnOn()}>
                    Turn on notifications
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export function SecuritySettings() {
  const toast = useToast()
  const { user, refresh } = useSession()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inside, setInside] = useState(false)
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null)
  const [emailForm, setEmailForm] = useState({ open: false, email: '', password: '', error: '', sent: false })

  const loadSessions = useCallback(async () => {
    const res = await fetch('/api/me/sessions', { cache: 'no-store' })
    if (res.ok) setSessions((await res.json()).sessions)
  }, [])
  useEffect(() => {
    setInside(inApp())
    void loadSessions()
  }, [loadSessions])

  const change = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { ok, json } = await post('/api/me/password', { current, next })
    setBusy(false)
    if (!ok) return setError((json.error as string) ?? 'Couldn’t change it. Try again.')
    setCurrent('')
    setNext('')
    toast('Password changed. Other devices are signed out.')
    // This iPhone has a new session now; its notifications follow it.
    if (user) void refreshPushRegistration(user.id)
    void loadSessions()
  }

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { ok, json } = await post('/api/me/email', { email: emailForm.email, password: emailForm.password })
    setBusy(false)
    if (!ok) return setEmailForm((f) => ({ ...f, error: (json.error as string) ?? 'Couldn’t start the change. Try again.' }))
    setEmailForm({ open: true, email: emailForm.email, password: '', error: '', sent: true })
    void refresh()
  }

  const endSession = async (id: string) => {
    const { ok } = await post('/api/me/sessions', { end: id })
    toast(ok ? 'Signed out on that device' : 'That device is already signed out')
    void loadSessions()
  }

  const signOutEverywhere = async () => {
    const res = await fetch('/api/auth/logout-all', { method: 'POST' })
    if (res.ok) window.location.assign('/signin')
    else toast('Couldn’t sign out everywhere. Try again.')
  }

  // The app has no downloads folder: the export goes to the share sheet as a file.
  const exportInApp = async (e: React.MouseEvent) => {
    e.preventDefault()
    const res = await fetch('/api/me/export')
    if (!res.ok) return toast('Couldn’t prepare your data. Try again shortly.')
    const shared = await shareFile('Your AVANT data', 'avant-data.json', await res.text())
    if (!shared) toast('Couldn’t open the share sheet. Try again.')
  }

  return (
    <section className="panel" aria-labelledby="security-title" id="security">
      <h2 id="security-title" style={{ fontSize: '1.2rem' }}>
        Security and your data
      </h2>

      <form method="post" onSubmit={change} className="stack" style={{ gap: 12, marginTop: 14, maxWidth: 420 }}>
        <p className="menu-title">Password</p>
        <label className="field">
          <span className="label">Current password</span>
          <input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">New password</span>
          <input className="input" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
          <span className="hint">At least 10 characters. Passwords found in public data breaches are refused.</span>
        </label>
        {error ? (
          <p className="error-block" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <button type="submit" className="btn btn-secondary btn-md" disabled={busy || !current || next.length < 10}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>

      <hr className="hairline" />
      <p className="menu-title">Email</p>
      <p className="small">{user?.email}</p>
      {emailForm.sent ? (
        <p className="small muted" style={{ marginTop: 8 }}>
          Check {emailForm.email} for a link to confirm it. Your email stays the same until you do.
        </p>
      ) : emailForm.open ? (
        <form method="post" onSubmit={changeEmail} className="stack" style={{ gap: 12, marginTop: 10, maxWidth: 420 }}>
          <label className="field">
            <span className="label">New email</span>
            <input className="input" type="email" autoComplete="email" required value={emailForm.email} onChange={(e) => setEmailForm((f) => ({ ...f, email: e.target.value, error: '' }))} />
          </label>
          <label className="field">
            <span className="label">Your password, to confirm</span>
            <input className="input" type="password" autoComplete="current-password" required value={emailForm.password} onChange={(e) => setEmailForm((f) => ({ ...f, password: e.target.value, error: '' }))} />
          </label>
          {emailForm.error ? (
            <p className="error-block" role="alert">
              {emailForm.error}
            </p>
          ) : null}
          <div className="row">
            <button type="submit" className="btn btn-secondary btn-md" disabled={busy || !emailForm.email || !emailForm.password}>
              Send confirmation link
            </button>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setEmailForm({ open: false, email: '', password: '', error: '', sent: false })}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setEmailForm((f) => ({ ...f, open: true }))}>
          Change email
        </button>
      )}

      <hr className="hairline" />
      <p className="menu-title">Where you&apos;re signed in</p>
      {sessions ? (
        <ul className="sessions">
          {sessions.map((s) => (
            <li key={s.id} className="between">
              <span>
                <span className="switch-label">{s.current ? 'This device' : 'Another device'}</span>
                <span className="small muted">
                  Signed in {new Date(s.signedInAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · active {ago(s.lastActiveAt)}
                </span>
              </span>
              {s.current ? null : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void endSession(s.id)}>
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOutEverywhere()}>
        Sign out on every device
      </button>

      <hr className="hairline" />
      <p className="menu-title">Your data</p>
      <div className="row">
        <a href="/api/me/export" className="btn btn-secondary btn-md" onClick={inside ? (e) => void exportInApp(e) : undefined}>
          <Icon name="download" size={16} /> Download all my data
        </a>
      </div>
      <p className="small dim" style={{ marginTop: 10 }}>
        Your profile, trips, trip records, reports, messages, listings, reviews, credit and the agreements you accepted.
      </p>
    </section>
  )
}

export function BlockedPeople() {
  const toast = useToast()
  const [list, setList] = useState<{ handle: string; name: string; since: string }[] | null>(null)
  const load = useCallback(async () => {
    const res = await fetch('/api/safety/block', { cache: 'no-store' })
    if (res.ok) setList((await res.json()).blocked)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  if (!list) return null

  const unblock = async (handle: string) => {
    const { ok } = await post('/api/safety/block', { unblock: handle })
    toast(ok ? 'Unblocked' : 'Couldn’t unblock. Try again.')
    void load()
  }

  return (
    <section className="panel" aria-labelledby="blocked-title" id="blocked">
      <h2 id="blocked-title" style={{ fontSize: '1.2rem' }}>
        Blocked people
      </h2>
      {list.length ? (
        <ul className="sessions">
          {list.map((b) => (
            <li key={b.handle} className="between">
              <span>
                <span className="switch-label">{b.name}</span>
                <span className="small muted">Blocked {new Date(b.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void unblock(b.handle)}>
                Unblock
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted" style={{ marginTop: 6 }}>
          No one. You can block someone from a trip or a conversation; they can&apos;t message you or book with you after that.
        </p>
      )}
    </section>
  )
}
