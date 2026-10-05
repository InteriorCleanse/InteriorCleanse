'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message, Notification, ThreadSummary } from '@/lib/server/inbox'
import { Icon } from './Icons'
import { useSession } from './Session'
import { SafetyMenu } from './SafetyMenu'
import { useToast } from './Toast'
import { Avatar, Breadcrumbs, ButtonLink, Empty } from './ui'

function when(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })
}

function SignIn() {
  return <Empty icon="chat" title="Sign in to see your messages" body="Conversations with your hosts and guests live in your account." action={<ButtonLink href="/signin?next=/inbox">Sign in</ButtonLink>} />
}

export function Inbox() {
  const { user, loaded, refresh } = useSession()
  const [tab, setTab] = useState<'messages' | 'notifications'>('messages')
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [notes, setNotes] = useState<Notification[] | null>(null)
  const [unread, setUnread] = useState({ messages: 0, notifications: 0 })

  const load = useCallback(async () => {
    const res = await fetch('/api/inbox', { cache: 'no-store' })
    if (!res.ok) return
    const json = await res.json()
    setThreads(json.threads)
    setUnread(json.unread)
  }, [])

  useEffect(() => {
    if (!loaded || !user) return
    void load()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), 8000)
    return () => window.clearInterval(t)
  }, [loaded, user, load])

  useEffect(() => {
    if (tab !== 'notifications' || !user) return
    void (async () => {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (res.ok) setNotes((await res.json()).notifications)
      await fetch('/api/notifications', { method: 'POST' })
      setUnread((u) => ({ ...u, notifications: 0 }))
      void refresh()
    })()
  }, [tab, user, refresh])

  if (!loaded) return <div className="skeleton" />
  if (!user) return <SignIn />

  return (
    <div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'messages'} onClick={() => setTab('messages')}>
          Messages{unread.messages ? <span className="count">{unread.messages}</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'notifications'} onClick={() => setTab('notifications')}>
          Notifications{unread.notifications ? <span className="count">{unread.notifications}</span> : null}
        </button>
      </div>

      {tab === 'messages' ? (
        threads === null ? (
          <div className="skeleton" style={{ marginTop: 16 }} />
        ) : threads.length === 0 ? (
          <Empty icon="chat" title="No messages yet" body="When you book a car, you and your host can talk here." action={<ButtonLink href="/">Find a car</ButtonLink>} />
        ) : (
          <ul className="threads">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/inbox/${t.id}`} className="thread" data-unread={t.unread ? 'true' : undefined}>
                  <span className="avatar-wrap">
                    {t.other ? <Avatar name={t.other.name} photo={t.other.photo} size={56} /> : null}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="top">
                      <span>
                        {t.tripEnded ? 'Past trip' : 'Trip'} with {t.carTitle}
                      </span>
                      <span>{t.last ? when(t.last.at) : ''}</span>
                    </span>
                    <strong>{t.other?.firstName ?? 'Guest'}</strong>
                    <p>{t.last ? `${t.last.mine ? 'You: ' : ''}${t.last.body}` : 'Say hello and share pickup details.'}</p>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : notes === null ? (
        <div className="skeleton" style={{ marginTop: 16 }} />
      ) : notes.length === 0 ? (
        <Empty icon="sparkle" title="You’re all caught up" body="Booking updates and reminders appear here." />
      ) : (
        <ul className="threads">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={n.href} className="thread" style={{ gridTemplateColumns: '40px 1fr' }} data-unread={n.read ? undefined : 'true'}>
                <Icon name={n.title.includes('cancel') || n.title.includes('declin') ? 'x' : n.title.includes('request') || n.title.includes('Request') ? 'clock' : 'check'} size={22} />
                <span style={{ minWidth: 0 }}>
                  <span className="top">
                    <strong style={{ fontSize: '1rem', margin: 0, color: 'var(--text)' }}>{n.title}</strong>
                    <span>{when(n.at)}</span>
                  </span>
                  <p style={{ whiteSpace: 'normal' }}>{n.body}</p>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Thread({ id }: { id: string }) {
  const { user, loaded, refresh } = useSession()
  const toast = useToast()
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [summary, setSummary] = useState<ThreadSummary | null>(null)
  const [missing, setMissing] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [open, setOpen] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  const last = useRef<string | undefined>(undefined)

  const poll = useCallback(async () => {
    const res = await fetch(`/api/threads/${encodeURIComponent(id)}/messages${last.current ? `?after=${encodeURIComponent(last.current)}` : ''}`, { cache: 'no-store' })
    if (res.status === 404) return setMissing(true)
    if (!res.ok) return
    const json = await res.json()
    const fresh: Message[] = json.messages
    setOpen(json.open !== false)
    if (fresh.length) {
      last.current = fresh[fresh.length - 1].at
      setMessages((m) => {
        const seen = new Set((m ?? []).map((x) => x.id))
        return [...(m ?? []), ...fresh.filter((x) => !seen.has(x.id))]
      })
    } else setMessages((m) => m ?? [])
  }, [id])

  useEffect(() => {
    if (!loaded || !user) return
    void poll().then(() => refresh())
    void fetch('/api/inbox', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setSummary(j.threads.find((t: ThreadSummary) => t.id === id) ?? null))
    const t = window.setInterval(() => document.visibilityState === 'visible' && void poll(), 4000)
    return () => window.clearInterval(t)
  }, [loaded, user, poll, refresh, id])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length])

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const res = await fetch(`/api/threads/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    setSending(false)
    if (!res.ok) return toast((await res.json().catch(() => ({}))).error ?? 'Message not sent. Try again.')
    const { message } = (await res.json()) as { message: Message }
    last.current = message.at
    setMessages((m) => [...(m ?? []), message])
    setDraft('')
  }

  if (!loaded) return <div className="skeleton" />
  if (!user) return <SignIn />
  if (missing) return <Empty icon="chat" title="Conversation not found" body="It may belong to another account." action={<ButtonLink href="/inbox">Inbox</ButtonLink>} />

  return (
    <div className="chat">
      <Breadcrumbs items={[{ label: 'Inbox', href: '/inbox' }, { label: summary?.other?.firstName ?? 'Conversation' }]} />
      <div className="chat-head">
        {summary?.other ? <Avatar name={summary.other.name} photo={summary.other.photo} size={48} /> : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: '1.1rem' }}>{summary?.other?.firstName ?? ''}</strong>
          <div className="small muted">{summary ? `Trip with ${summary.carTitle}` : ''}</div>
        </div>
        {summary ? (
          <Link href={`/trips/${summary.bookingId}`} className="btn btn-secondary btn-sm">
            View trip
          </Link>
        ) : null}
      </div>
      {summary?.other ? (
        <div className="chat-safety">
          <SafetyMenu context="trip" subjectId={summary.bookingId} name={summary.other.firstName} />
        </div>
      ) : null}
      <div className="chat-log" aria-live="polite">
        {messages === null ? <div className="skeleton" /> : null}
        {messages?.length === 0 ? (
          <p className="center muted" style={{ margin: 'auto 0' }}>
            Say hello{summary?.other ? ` to ${summary.other.firstName}` : ''}. Share timing, questions or anything that helps the handover.
          </p>
        ) : null}
        {messages?.map((m) => (
          <div key={m.id} style={{ display: 'contents' }}>
            <div className="bubble" data-mine={m.mine}>
              {m.body}
            </div>
            <span className="bubble-time" data-mine={m.mine}>
              {when(m.at)}
            </span>
          </div>
        ))}
        <div ref={end} />
      </div>
      {!open ? (
        <p className="small muted center" style={{ padding: '14px 0' }}>
          This conversation has closed now that the trip is over. For anything about it, ask AVANT support.
        </p>
      ) : (
      <form method="post" className="composer" onSubmit={send}>
        <label className="sr-only" htmlFor="msg">
          Message
        </label>
        <textarea
          id="msg"
          rows={1}
          value={draft}
          maxLength={2000}
          placeholder="Write a message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button type="submit" className="btn btn-primary btn-md" disabled={sending || !draft.trim()} aria-label="Send">
          <Icon name="send" size={17} />
        </button>
      </form>
      )}
    </div>
  )
}
