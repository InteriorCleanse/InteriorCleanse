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
import { formatDate, formatTime, parseIso, todayIso } from '@/lib/dates'
import { moneyExact } from '@/lib/format'
import { REQUEST_HOURS } from '@/lib/policy'
import type { PersonStats, TripView } from '@/lib/server/bookings'
import { actions, useLocal } from '@/lib/store'
import { CarImage } from './CarImage'
import { useConcierge } from './Concierge'
import { EvidenceCapture } from './EvidenceCapture'
import { Icon } from './Icons'
import { PriceBreakdown } from './PriceBreakdown'
import { useSession } from './Session'
import { useToast } from './Toast'
import { Avatar, Breadcrumbs, ButtonLink, Empty, Notice, Stars } from './ui'

const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function daysBetween(a: string, b: string) {
  return Math.round((parseIso(b) - parseIso(a)) / 86_400_000)
}

/** The short status line on a trip card, in plain words. */
export function tripStatus(t: TripView, today: string): { label: string; tone: 'ink' | 'quiet' | 'gold' | 'bad' } {
  if (t.status === 'cancelled') return { label: 'Cancelled', tone: 'bad' }
  if (t.status === 'declined') return { label: 'Declined', tone: 'bad' }
  if (t.status === 'expired') return { label: 'Expired', tone: 'quiet' }
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

const isPast = (t: TripView, today: string) => t.end < today || t.status === 'cancelled' || t.status === 'declined' || t.status === 'expired'

function statsLine(s: PersonStats | null, as: 'guest' | 'host'): string {
  if (!s || (!s.trips && !s.reviews)) return as === 'guest' ? 'New to AVANT' : 'New host'
  const parts = [s.rating != null ? `★ ${s.rating.toFixed(1)}` : null, s.reviews ? `${s.reviews} review${s.reviews === 1 ? '' : 's'}` : null, `${s.trips} trip${s.trips === 1 ? '' : 's'}`]
  return parts.filter(Boolean).join(' · ')
}

const until = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

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
  const preview = trip.cancelPreview
  const upcoming = Boolean(preview)
  const moneyBack = trip.paid === 'demo' ? ' (preview: nothing was charged)' : ''
  const done = checks[trip.id] ?? []

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Trips', href: '/trips' }, { label: trip.car.title }]} />
      {params.get('new') === '1' ? (
        <Notice tone="ok" icon="check">
          {trip.status === 'requested' ? (
            <>
              <strong>Request sent.</strong> {other?.firstName ?? 'Your host'} has {REQUEST_HOURS} hours to answer. If they decline or don&apos;t answer, you&apos;re
              refunded in full.
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
                  <div className="small muted">
                    {statsLine(trip.otherStats, trip.role === 'guest' ? 'host' : 'guest')} · on AVANT since {new Date(other.joined).getFullYear()}
                  </div>
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

          {trip.hostNote ? (
            <section className="car-section host-note" aria-labelledby="note">
              <h2 id="note">From {trip.host?.firstName ?? 'your host'}</h2>
              {trip.hostNote.welcome ? <p className="welcome">{trip.hostNote.welcome}</p> : null}
              {trip.hostNote.pickup ? (
                <div className="pickup">
                  <strong>Pickup</strong>
                  <p className="muted" style={{ whiteSpace: 'pre-line', marginTop: 4 }}>
                    {trip.hostNote.pickup}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          {trip.role === 'host' && trip.status === 'requested' ? (
            <section className="car-section" aria-labelledby="answer">
              <h2 id="answer">Answer {trip.guest?.firstName ?? 'the guest'}</h2>
              <p className="muted" style={{ marginBottom: 14 }}>
                Their licence is verified and they&apos;ve paid. Approving confirms the trip; declining releases the dates and refunds them in full.
                {trip.respondBy ? ` Answer by ${until(trip.respondBy)}, or the request expires.` : ''}
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

          {trip.refund.cents > 0 ? (
            <section className="car-section" aria-labelledby="refund">
              <h2 id="refund">Refund</h2>
              <p className="muted">
                {moneyExact(trip.refund.cents)}{' '}
                {trip.refund.status === 'done'
                  ? 'refunded to the original card. Banks take 5–10 business days to show it.'
                  : trip.refund.status === 'pending'
                    ? 'is on its way back to the original card.'
                    : 'refunded'}
                {moneyBack}
                {trip.refund.creditCents > 0 ? ` ${moneyExact(trip.refund.creditCents)} of it went back to your AVANT credit.` : ''}
                {trip.refund.cents < trip.quote.totalCents ? ` The first day (${moneyExact(trip.quote.totalCents - trip.refund.cents)}) was kept, per the cancellation policy.` : ''}
              </p>
            </section>
          ) : null}

          <ReviewSection trip={trip} onDone={load} />

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
                  ? `Cancelling as a host refunds ${trip.guest?.firstName ?? 'the guest'} in full and hurts your listing’s ranking. Only if you must.`
                  : trip.status === 'requested'
                    ? 'The host hasn’t answered yet, so cancelling refunds everything.'
                    : preview?.free
                      ? `Free cancellation until ${FREE_CANCEL_HOURS} hours before pickup. Cancel now and get the full ${moneyExact(preview.refundCents)} back.`
                      : `You’re inside ${FREE_CANCEL_HOURS} hours of pickup: cancelling now refunds ${moneyExact(preview?.refundCents ?? 0)} and keeps the first day (${moneyExact(preview?.keptCents ?? 0)}).`}
              </p>
              {!confirm ? (
                <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm(true)}>
                  Cancel trip
                </button>
              ) : (
                <div className="row">
                  <button type="button" className="btn btn-danger btn-md" disabled={busy} onClick={() => act('cancel', undefined, 'Trip cancelled')}>
                    {preview && trip.role === 'guest' ? `Cancel and refund ${moneyExact(preview.refundCents)}` : 'Yes, cancel'}
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
            <PriceBreakdown quote={trip.quote} credit={trip.creditUsedCents} />
            <p className="small dim">Ref {trip.id}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="star-input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} data-on={n <= value} onClick={() => onChange(n)}>
          <Icon name="star" size={26} />
        </button>
      ))}
    </div>
  )
}

function ReviewSection({ trip, onDone }: { trip: TripView; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const { mine, theirs } = trip.reviews
  const otherName = (trip.role === 'guest' ? trip.host : trip.guest)?.firstName ?? (trip.role === 'guest' ? 'your host' : 'your guest')
  if (!trip.canReview && !mine && !theirs) return null

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rating) return toast('Choose 1 to 5 stars.')
    setBusy(true)
    const res = await fetch(`/api/trips/${encodeURIComponent(trip.id)}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating, body }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast(json.error ?? 'Couldn’t post that. Try again.')
    toast('Thank you for your review')
    await onDone()
  }

  return (
    <section className="car-section" aria-labelledby="review">
      <h2 id="review">{trip.role === 'guest' ? `How was the ${trip.car.title.replace(/^\d{4} /, '')}?` : `How was ${otherName} as a guest?`}</h2>
      {trip.canReview ? (
        <form method="post" onSubmit={send} className="stack" style={{ gap: 12 }}>
          <StarInput value={rating} onChange={setRating} />
          <label className="field">
            <span className="label">{trip.role === 'guest' ? 'A few words for future guests (and your host)' : 'A few words for other hosts'}</span>
            <textarea className="textarea" rows={4} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div>
            <button type="submit" className="btn btn-primary btn-md" disabled={busy || !rating}>
              {busy ? 'Posting…' : 'Post review'}
            </button>
          </div>
        </form>
      ) : null}
      {mine ? (
        <div className="review">
          <div className="between">
            <strong>Your review</strong>
            <Stars value={mine.rating} />
          </div>
          {mine.body ? <p className="muted" style={{ marginTop: 8 }}>{mine.body}</p> : null}
        </div>
      ) : null}
      {theirs ? (
        <div className="review" style={{ marginTop: 12 }}>
          <div className="between">
            <strong>{otherName.charAt(0).toUpperCase() + otherName.slice(1)}&apos;s review of you</strong>
            <Stars value={theirs.rating} />
          </div>
          {theirs.body ? <p className="muted" style={{ marginTop: 8 }}>{theirs.body}</p> : null}
        </div>
      ) : null}
    </section>
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
