'use client'

/**
 * Trips, from the server: the guest's trips and, for hosts, trips on their
 * cars. Manage trip covers the receipt, changes, check-in photos and help;
 * Message opens the conversation with the other person.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CHECK_IN_ITEMS, FREE_CANCEL_HOURS, getPlan } from '@/lib/catalog'
import { addDays, formatDate, formatTime, minutesOf, parseIso, todayIso } from '@/lib/dates'
import type { TripView } from '@/lib/server/bookings'
import { actions, useLocal } from '@/lib/store'
import { CarImage } from './CarImage'
import { useConcierge } from './Concierge'
import { EvidenceCapture } from './EvidenceCapture'
import { Icon } from './Icons'
import { PriceBreakdown } from './PriceBreakdown'
import { useSession } from './Session'
import { useToast } from './Toast'
import { Avatar, Breadcrumbs, ButtonLink, Empty, Notice } from './ui'

const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function daysBetween(a: string, b: string) {
  return Math.round((parseIso(b) - parseIso(a)) / 86_400_000)
}

/** The short status line on a trip card, in plain words. */
export function tripStatus(t: TripView, today: string): { label: string; tone: 'ink' | 'quiet' | 'gold' | 'bad' } {
  if (t.status === 'cancelled') return { label: 'Cancelled', tone: 'bad' }
  if (t.status === 'declined') return { label: 'Declined', tone: 'bad' }
  if (t.status === 'requested') return t.role === 'host' ? { label: 'Needs your answer', tone: 'gold' } : { label: 'Request sent', tone: 'gold' }
  if (t.end < today) {
    const ago = daysBetween(t.end, today)
    return { label: ago === 1 ? 'Ended yesterday' : `Ended ${short(t.end)}`, tone: 'quiet' }
  }
  if (t.start <= today) {
    const left = daysBetween(today, t.end)
    return { label: left === 0 ? 'Ends today' : left === 1 ? 'Ends tomorrow' : 'In progress', tone: 'ink' }
  }
  const until = daysBetween(today, t.start)
  return { label: until === 1 ? 'Starts tomorrow' : `Starts in ${until} days`, tone: 'ink' }
}

const isPast = (t: TripView, today: string) => t.end < today || t.status === 'cancelled' || t.status === 'declined'

function useTrips() {
  const { user, loaded } = useSession()
  const [trips, setTrips] = useState<TripView[] | null>(null)
  const load = useCallback(async () => {
    const res = await fetch('/api/trips', { cache: 'no-store' })
    setTrips(res.ok ? (await res.json()).trips : [])
  }, [])
  useEffect(() => {
    if (loaded && user) void load()
  }, [loaded, user, load])
  return { trips, user, loaded, reload: load }
}

function SignInFirst({ what }: { what: string }) {
  return (
    <Empty
      icon="user"
      title="Sign in to see your trips"
      body={`Your ${what} live in your account, so they’re on every device.`}
      action={<ButtonLink href="/signin?next=/trips">Sign in</ButtonLink>}
    />
  )
}

export function TripCard({ trip, today }: { trip: TripView; today: string }) {
  const s = tripStatus(trip, today)
  const other = trip.role === 'guest' ? trip.host : trip.guest
  return (
    <article className="trip-card">
      <div>
        <span className="status-pill" data-tone={s.tone === 'ink' ? undefined : s.tone}>
          {s.label}
        </span>
        <p className="when">
          {short(trip.start)} – {short(trip.end)}
        </p>
        <h2>{trip.car.title.replace(/^(\d{4}) (.*)$/, '$2 $1')}</h2>
        <p className="where">
          {trip.car.neighborhood}, {trip.car.city}
        </p>
        {trip.role === 'host' && trip.guest ? <p className="small muted">Guest: {trip.guest.firstName}</p> : null}
      </div>
      <Link href={`/trips/${trip.id}`} className="thumb" aria-hidden="true" tabIndex={-1}>
        <CarImage body={trip.car.body} color={trip.car.colorHex} photo={trip.car.photo} sample={trip.car.sample} alt="" />
      </Link>
      <div className="actions">
        <Link href={`/trips/${trip.id}`} className="btn btn-secondary btn-md">
          Manage trip
        </Link>
        {trip.threadId ? (
          <Link href={`/inbox/${trip.threadId}`} className="btn btn-secondary btn-md">
            Message {trip.role === 'guest' ? 'host' : other?.firstName ?? 'guest'}
          </Link>
        ) : (
          <span className="btn btn-secondary btn-md" aria-disabled="true" style={{ opacity: 0.5 }} title="Sample listings have no host to message">
            Message host
          </span>
        )}
      </div>
    </article>
  )
}

export function TripsHome() {
  const { trips, user, loaded } = useTrips()
  const [today, setToday] = useState('')
  useEffect(() => setToday(todayIso()), [])
  if (!loaded || !today) return <div className="skeleton" />
  if (!user) return <SignInFirst what="trips" />
  if (!trips) return <div className="skeleton" />

  const mine = trips.filter((t) => t.role === 'guest' && !isPast(t, today)).sort((a, b) => a.start.localeCompare(b.start))
  const hosting = trips.filter((t) => t.role === 'host' && !isPast(t, today)).sort((a, b) => (a.status === 'requested' ? -1 : 0) - (b.status === 'requested' ? -1 : 0) || a.start.localeCompare(b.start))
  const recentEnded = trips.filter((t) => t.role === 'guest' && t.status === 'confirmed' && t.end < today && daysBetween(t.end, today) <= 3)
  const pastCount = trips.filter((t) => isPast(t, today)).length

  return (
    <div>
      {mine.length + recentEnded.length === 0 && hosting.length === 0 ? (
        <Empty
          icon="trips"
          title="No trips booked… yet"
          body="When you book a car it shows up here, with your host, check-in and receipt."
          action={<ButtonLink href="/">Find a car</ButtonLink>}
        />
      ) : null}
      {[...mine, ...recentEnded].map((t) => (
        <TripCard key={t.id} trip={t} today={today} />
      ))}
      {hosting.length ? (
        <section style={{ marginTop: 34 }} aria-labelledby="hosting">
          <p className="eyebrow" id="hosting">
            Hosting
          </p>
          {hosting.map((t) => (
            <TripCard key={t.id} trip={t} today={today} />
          ))}
        </section>
      ) : null}
      <Link href="/trips/past" className="row-link">
        <Icon name="calendar" size={26} />
        View past trips{pastCount ? ` (${pastCount})` : ''}
        <Icon name="chevron-right" size={20} />
      </Link>
    </div>
  )
}

export function PastTrips() {
  const { trips, user, loaded } = useTrips()
  const [today, setToday] = useState('')
  useEffect(() => setToday(todayIso()), [])
  if (!loaded || !today) return <div className="skeleton" />
  if (!user) return <SignInFirst what="past trips" />
  if (!trips) return <div className="skeleton" />
  const past = trips.filter((t) => isPast(t, today))
  if (!past.length) return <Empty icon="calendar" title="No past trips" body="Finished and cancelled trips collect here." action={<ButtonLink href="/trips">Back to trips</ButtonLink>} />
  return (
    <div>
      {past.map((t) => (
        <TripCard key={t.id} trip={t} today={today} />
      ))}
    </div>
  )
}

export function TripDetail({ id }: { id: string }) {
  const params = useSearchParams()
  const toast = useToast()
  const { ask } = useConcierge()
  const { user, loaded } = useSession()
  const { checks } = useLocal()
  const [trip, setTrip] = useState<TripView | null | undefined>(undefined)
  const [today, setToday] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/trips/${encodeURIComponent(id)}`, { cache: 'no-store' })
    setTrip(res.ok ? (await res.json()).trip : null)
  }, [id])

  useEffect(() => setToday(todayIso()), [])
  useEffect(() => {
    if (loaded && user) void load()
  }, [loaded, user, load])

  const act = async (path: string, body?: unknown, done?: string) => {
    setBusy(true)
    const res = await fetch(`/api/trips/${encodeURIComponent(id)}/${path}`, {
      method: 'POST',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    setConfirm(false)
    if (!res.ok) return toast(json.error ?? 'That didn’t work. Try again.')
    if (done) toast(done)
    await load()
  }

  if (!loaded || !today || (user && trip === undefined)) return <div className="skeleton" />
  if (!user) return <SignInFirst what="trips" />
  if (!trip) return <Empty icon="trips" title="Trip not found" body="It may belong to another account." action={<ButtonLink href="/trips">All trips</ButtonLink>} />

  const s = tripStatus(trip, today)
  const other = trip.role === 'guest' ? trip.host : trip.guest
  const r = trip.request
  const pickupMs = parseIso(trip.start) + minutesOf(r.startTime) * 60_000
  const freeCancel = Date.now() < pickupMs - FREE_CANCEL_HOURS * 3_600_000
  const upcoming = (trip.status === 'confirmed' || trip.status === 'requested') && trip.end >= today
  const done = checks[trip.id] ?? []

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Trips', href: '/trips' }, { label: trip.car.title }]} />
      {params.get('new') === '1' ? (
        <Notice tone="ok" icon="check">
          {trip.status === 'requested' ? (
            <>
              <strong>Request sent.</strong> {other?.firstName ?? 'Your host'} has 8 hours to answer. Nothing is final until they approve.
            </>
          ) : (
            <>
              <strong>You&apos;re booked.</strong> {other ? `${other.firstName} has been told.` : ''} Pickup details appear here 24 hours before your trip.
            </>
          )}
        </Notice>
      ) : null}
      <div className="car-layout" style={{ marginTop: 20 }}>
        <div>
          <div className="car-hero" style={{ aspectRatio: '16/8' }}>
            <CarImage body={trip.car.body} color={trip.car.colorHex} photo={trip.car.photo} sample={trip.car.sample} alt="" />
          </div>
          <div className="row" style={{ marginTop: 20 }}>
            <span className="status-pill" data-tone={s.tone === 'ink' ? undefined : s.tone}>
              {s.label}
            </span>
            {trip.paid === 'demo' ? <span className="badge badge-warn">Preview booking, nothing charged</span> : null}
          </div>
          <h1 style={{ marginTop: 12 }}>{trip.car.title}</h1>
          <p className="lead" style={{ marginTop: 8 }}>
            {formatDate(trip.start, true)}, {formatTime(r.startTime)} → {formatDate(trip.end, true)}, {formatTime(r.endTime)}
          </p>
          <p className="muted" style={{ marginTop: 4 }}>
            {r.delivery ? `Delivered to ${r.deliveryAddress}` : `Pickup in ${trip.car.neighborhood}, ${trip.car.city}`} · {getPlan(r.coverage).name} protection
          </p>

          {other ? (
            <section className="car-section" aria-labelledby="person">
              <h2 id="person">{trip.role === 'guest' ? 'Your host' : 'Your guest'}</h2>
              <div className="host-card">
                <Avatar name={other.name} photo={other.photo} size={64} />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '1.1rem' }}>{other.firstName}</strong>
                  <div className="small muted">On AVANT since {new Date(other.joined).getFullYear()}</div>
                </div>
                {trip.threadId ? (
                  <Link href={`/inbox/${trip.threadId}`} className="btn btn-secondary btn-md">
                    <Icon name="chat" size={16} /> Message
                  </Link>
                ) : null}
              </div>
            </section>
          ) : trip.car.sample ? (
            <section className="car-section">
              <Notice tone="warn">This is a sample listing, so there is no real host to message.</Notice>
            </section>
          ) : null}

          {trip.role === 'host' && trip.status === 'requested' ? (
            <section className="car-section" aria-labelledby="answer">
              <h2 id="answer">Answer {trip.guest?.firstName ?? 'the guest'}</h2>
              <p className="muted" style={{ marginBottom: 14 }}>
                They&apos;re verified and waiting. Approving confirms the trip; declining releases the dates.
              </p>
              <div className="row">
                <button type="button" className="btn btn-primary btn-md" disabled={busy} onClick={() => act('respond', { approve: true }, 'Trip approved')}>
                  Approve
                </button>
                <button type="button" className="btn btn-secondary btn-md" disabled={busy} onClick={() => act('respond', { approve: false }, 'Request declined')}>
                  Decline
                </button>
              </div>
            </section>
          ) : null}

          {trip.role === 'guest' && trip.status === 'confirmed' ? (
            <>
              <section className="car-section" aria-labelledby="evidence">
                <h2 id="evidence">Photo check-in</h2>
                <p className="small muted" style={{ marginBottom: 14 }}>
                  Six photos at pickup and six at return. If anything is ever questioned, these settle it in minutes.
                </p>
                <EvidenceCapture tripId={trip.id} defaultPhase={trip.end <= today ? 'check-out' : 'check-in'} />
              </section>
              <section className="car-section" aria-labelledby="checkin">
                <h2 id="checkin">
                  At pickup · {done.length}/{CHECK_IN_ITEMS.length}
                </h2>
                <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>
                  {CHECK_IN_ITEMS.map((c) => (
                    <li key={c.id}>
                      <label className="check">
                        <input type="checkbox" checked={done.includes(c.id)} onChange={() => actions.toggleCheck(trip.id, c.id)} />
                        <span style={done.includes(c.id) ? { textDecoration: 'line-through', color: 'var(--dim)' } : undefined}>{c.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}

          <section className="car-section" aria-labelledby="help">
            <h2 id="help">Help</h2>
            <div className="row">
              <button type="button" className="btn btn-secondary btn-md" onClick={() => ask(`I have a question about my trip in the ${trip.car.title} from ${trip.start} to ${trip.end}.`)}>
                <Icon name="sparkle" size={16} /> Ask AVANT
              </button>
              <a className="btn btn-secondary btn-md" href="tel:911">
                Emergency: 911
              </a>
              <button type="button" className="btn btn-secondary btn-md" onClick={() => ask('I need to report an incident or damage on my trip. What do I do?')}>
                Report an incident
              </button>
            </div>
          </section>

          {upcoming ? (
            <section className="car-section" aria-labelledby="change">
              <h2 id="change">Changes</h2>
              <p className="small muted" style={{ marginBottom: 12 }}>
                {trip.role === 'host'
                  ? 'Cancelling as a host hurts your listing and the guest’s plans. Only if you must.'
                  : freeCancel
                    ? `Free cancellation until ${FREE_CANCEL_HOURS} hours before pickup (${formatDate(addDays(trip.start, 0), true)}).`
                    : 'Inside 24 hours of pickup the first day is kept.'}
              </p>
              {!confirm ? (
                <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm(true)}>
                  Cancel trip
                </button>
              ) : (
                <div className="row">
                  <button type="button" className="btn btn-danger btn-md" disabled={busy} onClick={() => act('cancel', undefined, 'Trip cancelled')}>
                    Yes, cancel
                  </button>
                  <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm(false)}>
                    Keep it
                  </button>
                </div>
              )}
            </section>
          ) : null}
        </div>
        <aside>
          <div className="bookcard sticky">
            <h2 style={{ fontSize: '1.1rem' }}>Receipt</h2>
            <PriceBreakdown quote={trip.quote} />
            <p className="small dim">Ref {trip.id}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Return from Stripe Checkout: confirm on the server, then open the trip. */
export function TripConfirm() {
  const params = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const id = params.get('session_id')
    fetch(`/api/checkout/confirm?session_id=${encodeURIComponent(id ?? '')}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error)
        router.replace(`/trips/${j.bookingId}?new=1`)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not confirm.'))
  }, [params, router])
  return error ? <p className="error-block">{error}</p> : <div className="skeleton" aria-busy="true" />
}
