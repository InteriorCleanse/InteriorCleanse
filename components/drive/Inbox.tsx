'use client'

/**
 * Messages with hosts. Threads are created when a trip is booked or when
 * "Message host" is pressed on a car. The host side is a demonstration: it
 * answers automatically, and the screen says so.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { carTitle, getCarById, getHost } from '@/lib/drive/data'
import { formatRange } from '@/lib/drive/dates'
import { DRIVE } from '@/lib/drive/routes'
import { useDriveActions, useDriveState } from '@/lib/drive/store'
import type { Thread } from '@/lib/drive/types'
import { Icon } from './Icons'
import { Avatar, Badge, Button, EmptyState } from './ui'

function autoReply(text: string, hostFirst: string, neighborhood: string): string {
  const t = text.toLowerCase()
  if (/airport|flight|terminal/.test(t)) return `Airport pickups are easy. Send me the flight number and I'll meet you at arrivals, or deliver to the terminal if the listing offers it.`
  if (/charg|range|battery/.test(t)) return `It'll be at a full charge for you. The cable is in the trunk and I'll text you the nearest fast chargers on your route.`
  if (/pet|dog|cat/.test(t)) return `Pets are fine in a carrier or on a blanket, just give it a quick vacuum before you drop it back.`
  if (/early|late|time|hour/.test(t)) return `Timing is flexible. Tell me the hour that works and I'll have it ready in ${neighborhood}.`
  if (/cancel|change|date/.test(t)) return `No problem. You can rebook with new dates from the trip page, free up to 24 hours before pickup.`
  if (/thank/.test(t)) return `Any time. Safe travels!`
  return `Thanks for the note. I'm ${hostFirst}; the car is kept in ${neighborhood} and I'll share the exact spot the day before. Anything else, just ask.`
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function Inbox() {
  const { threads, trips, hydrated } = useDriveState()
  const { sendMessage } = useDriveActions()
  const params = useSearchParams()
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [threads])
  const selectedId = params.get('thread') ?? sorted[0]?.id ?? null
  const thread = sorted.find((t) => t.id === selectedId) ?? null

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [thread?.messages.length, thread?.id])

  if (!hydrated) return <div className="dr-skeleton dr-skeleton-block" aria-busy="true" />

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon="inbox"
        title="No conversations yet"
        body="Booking a car starts a thread with its host, and any car page has a “Message host” button."
        action={<Button href={DRIVE.cars} iconAfter="arrow-right">Explore cars</Button>}
      />
    )
  }

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    if (!thread || !draft.trim()) return
    const car = getCarById(thread.carId)
    const host = getHost(thread.hostId)
    sendMessage(thread.id, draft.trim(), autoReply(draft, host.name.split(' ')[0], car?.neighborhood ?? 'the neighbourhood'))
    setDraft('')
  }

  const describe = (t: Thread) => {
    const car = getCarById(t.carId)
    const trip = t.tripId ? trips.find((x) => x.id === t.tripId) : null
    return { car, trip, host: getHost(t.hostId) }
  }

  return (
    <div className="dr-inbox" data-open={thread ? 'true' : undefined}>
      <aside className="dr-threads" aria-label="Conversations">
        <ul>
          {sorted.map((t) => {
            const { car, host, trip } = describe(t)
            const last = t.messages[t.messages.length - 1]
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className="dr-thread"
                  aria-current={t.id === thread?.id ? 'true' : undefined}
                  onClick={() => router.replace(DRIVE.thread(t.id), { scroll: false })}
                >
                  <Avatar name={host.name} size={40} />
                  <span className="dr-thread-text">
                    <strong>{host.name}</strong>
                    <span>{car ? carTitle(car) : 'Car'}{trip ? ` · ${formatRange(trip.start, trip.end)}` : ''}</span>
                    <small>{last ? `${last.from === 'you' ? 'You: ' : ''}${last.text}` : 'No messages yet'}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {thread ? (
        <section className="dr-convo" aria-label="Conversation">
          {(() => {
            const { car, host, trip } = describe(thread)
            return (
              <>
                <header className="dr-convo-head">
                  <button type="button" className="dr-icon-btn dr-convo-back" aria-label="All conversations" onClick={() => router.replace(DRIVE.inbox)}>
                    <Icon name="chevron-left" size={18} />
                  </button>
                  <Avatar name={host.name} size={36} />
                  <div>
                    <strong>{host.name}</strong>
                    <span className="dr-muted">
                      {car ? carTitle(car) : ''} {trip ? `· ${formatRange(trip.start, trip.end)}` : ''}
                    </span>
                  </div>
                  <Badge tone="warn">Demo host: replies are automatic</Badge>
                  {trip ? (
                    <Button size="sm" variant="secondary" href={DRIVE.trip(trip.id)}>
                      Trip
                    </Button>
                  ) : car ? (
                    <Button size="sm" variant="secondary" href={DRIVE.car(car.slug)}>
                      Car
                    </Button>
                  ) : null}
                </header>
                <div className="dr-msgs">
                  {thread.messages.length === 0 ? <p className="dr-muted dr-msgs-empty">Say hello, ask about pickup, or check a detail.</p> : null}
                  {thread.messages.map((m) => (
                    <div key={m.id} className="dr-msg" data-from={m.from}>
                      <p>{m.text}</p>
                      <time dateTime={m.sentAt}>{timeLabel(m.sentAt)}</time>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                <form className="dr-composer" onSubmit={send}>
                  <label htmlFor="dr-composer-input" className="dr-visually-hidden">
                    Message
                  </label>
                  <textarea
                    id="dr-composer-input"
                    rows={1}
                    value={draft}
                    placeholder={`Message ${host.name.split(' ')[0]}…`}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        ;(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
                      }
                    }}
                  />
                  <Button type="submit" icon="send" aria-label="Send">
                    Send
                  </Button>
                </form>
              </>
            )
          })()}
        </section>
      ) : null}
    </div>
  )
}
