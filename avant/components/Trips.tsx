'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { FREE_CANCEL_HOURS, getPlan } from '@/lib/catalog'
import { carTitle, cityName, getCar, getCarById, getHost } from '@/lib/data'
import { formatDate, formatRange, formatTime, minutesOf, parseIso, todayIso } from '@/lib/dates'
import { moneyExact, shortId } from '@/lib/format'
import { actions, useLocal } from '@/lib/store'
import type { Trip } from '@/lib/types'
import { CarImage } from './CarImage'
import { EvidenceCapture } from './EvidenceCapture'
import { useConcierge } from './Concierge'
import { Icon } from './Icons'
import { PriceBreakdown } from './PriceBreakdown'
import { useToast } from './Toast'
import { Avatar, Breadcrumbs, ButtonLink, Empty, Notice } from './ui'

function status(t: Trip, today: string) {
  if (t.status === 'cancelled') return { label: 'Cancelled', cls: 'badge' }
  if (t.status === 'completed' || t.end < today) return { label: 'Completed', cls: 'badge' }
  if (t.start <= today) return { label: 'In progress', cls: 'badge badge-ok' }
  return { label: 'Upcoming', cls: 'badge badge-lime' }
}

export function TripsList() {
  const { trips, hydrated } = useLocal()
  const [today, setToday] = useState('')
  useEffect(() => setToday(todayIso()), [])
  if (!hydrated || !today) return <div className="skeleton" />
  if (!trips.length)
    return <Empty icon="trips" title="No trips yet" body="Book a car and it lands here with your check-in list, receipt and host." action={<ButtonLink href="/search" iconAfter="arrow-right">Find a car</ButtonLink>} />
  const sorted = [...trips].sort((a, b) => a.start.localeCompare(b.start))
  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {sorted.map((t) => {
        const car = getCarById(t.carId)
        if (!car) return null
        const s = status(t, today)
        return (
          <li key={t.id}>
            <Link href={`/trips/${t.id}`} className="panel row" style={{ gap: 18, alignItems: 'center' }}>
              <div style={{ width: 140, borderRadius: 14, overflow: 'hidden', flex: 'none' }}>
                <CarImage body={car.body} color={car.color.hex} alt="" />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div className="row">
                  <strong style={{ fontSize: '1.05rem' }}>{carTitle(car)}</strong>
                  <span className={s.cls}>{s.label}</span>
                </div>
                <p className="muted small" style={{ marginTop: 4 }}>
                  {formatRange(t.start, t.end)} · {car.neighborhood}, {cityName(car.city)} · {moneyExact(t.quote.totalCents)}
                </p>
              </div>
              <Icon name="chevron-right" size={18} className="dim" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function TripDetail({ id }: { id: string }) {
  const { trips, hydrated } = useLocal()
  const params = useSearchParams()
  const toast = useToast()
  const { ask } = useConcierge()
  const [today, setToday] = useState('')
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setToday(todayIso()), [])
  const trip = trips.find((t) => t.id === id)
  if (!hydrated || !today) return <div className="skeleton" />
  if (!trip) return <Empty icon="trips" title="Trip not found" body="Trips are kept in the browser they were booked in." action={<ButtonLink href="/trips">All trips</ButtonLink>} />
  const car = getCarById(trip.carId)
  if (!car) return null
  const host = getHost(car.hostId)
  const s = status(trip, today)
  const active = trip.status === 'booked'
  const pickupMs = parseIso(trip.start) + minutesOf(trip.startTime) * 60_000
  const freeCancel = Date.now() < pickupMs - FREE_CANCEL_HOURS * 3_600_000
  const done = trip.checkIn.filter((c) => c.done).length

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Trips', href: '/trips' }, { label: carTitle(car) }]} />
      {params.get('new') === '1' ? (
        <Notice tone="ok" icon="check">
          <strong>You&apos;re booked.</strong> {host.name.split(' ')[0]} has been notified. The exact pickup spot and unlock instructions appear here 24 hours before pickup.
        </Notice>
      ) : null}
      <div className="car-layout" style={{ marginTop: 20 }}>
        <div>
          <div className="car-hero" style={{ aspectRatio: '16/7' }}>
            <CarImage body={car.body} color={car.color.hex} alt="" />
          </div>
          <div className="row" style={{ marginTop: 20 }}>
            <span className={s.cls}>{s.label}</span>
            {trip.paid === 'demo' ? <span className="badge badge-warn">Preview booking</span> : null}
          </div>
          <h1 style={{ marginTop: 10 }}>{carTitle(car)}</h1>
          <p className="lead" style={{ marginTop: 8 }}>
            {formatDate(trip.start, true)}, {formatTime(trip.startTime)} → {formatDate(trip.end, true)}, {formatTime(trip.endTime)}
          </p>
          <p className="muted small" style={{ marginTop: 4 }}>
            {trip.delivery ? `Delivered to ${trip.deliveryAddress}` : `Pickup in ${car.neighborhood}, ${cityName(car.city)}`} · {getPlan(trip.plan).name} coverage
          </p>

          {trip.status !== 'cancelled' ? (
            <section className="car-section" aria-labelledby="evidence">
              <h2 id="evidence">Photo evidence</h2>
              <p className="small muted" style={{ marginBottom: 14 }}>
                Six photos at pickup and six at return. If a host ever reports damage, these settle it in minutes instead of weeks.
              </p>
              <EvidenceCapture tripId={trip.id} defaultPhase={trip.end <= today ? 'check-out' : 'check-in'} />
            </section>
          ) : null}

          {active ? (
            <section className="car-section" aria-labelledby="checkin">
              <h2 id="checkin">Check-in · {done}/{trip.checkIn.length}</h2>
              <p className="small muted" style={{ marginBottom: 12 }}>
                Timestamped photos protect you if anything is disputed later. Do these at pickup.
              </p>
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>
                {trip.checkIn.map((c) => (
                  <li key={c.id}>
                    <label className="check">
                      <input type="checkbox" checked={c.done} onChange={() => actions.toggleCheck(trip.id, c.id)} />
                      <span style={c.done ? { textDecoration: 'line-through', color: 'var(--dim)' } : undefined}>{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="car-section" aria-labelledby="host">
            <h2 id="host">Your host</h2>
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={host.name} size={48} />
              <div>
                <strong>{host.name}</strong>
                <div className="small muted">Replies in ~{host.responseMinutes} min · {host.trips} trips</div>
              </div>
            </div>
          </section>

          <section className="car-section" aria-labelledby="help">
            <h2 id="help">Help</h2>
            <div className="row">
              <button type="button" className="btn btn-secondary btn-md" onClick={() => ask(`I have a question about my trip in the ${carTitle(car)} from ${trip.start} to ${trip.end}.`)}>
                <Icon name="chat" size={16} /> Ask the concierge
              </button>
              <a className="btn btn-secondary btn-md" href="tel:911">
                Emergency: 911
              </a>
              <button type="button" className="btn btn-secondary btn-md" onClick={() => ask('I need to report an incident or damage on my trip. What do I do?')}>
                Report an incident
              </button>
            </div>
          </section>

          {active ? (
            <section className="car-section" aria-labelledby="change">
              <h2 id="change">Changes</h2>
              <p className="small muted" style={{ marginBottom: 12 }}>
                {freeCancel ? `Free cancellation until ${FREE_CANCEL_HOURS} hours before pickup.` : 'Inside 24 hours of pickup the first day is kept.'}
              </p>
              {!confirm ? (
                <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm(true)}>
                  Cancel trip
                </button>
              ) : (
                <div className="row">
                  <button type="button" className="btn btn-danger btn-md" onClick={() => { actions.cancelTrip(trip.id); toast('Trip cancelled'); setConfirm(false) }}>
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

/** Return from Stripe Checkout: confirm on the server, then record the trip. */
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
        const car = j.trip
        const t = actions.addTrip({
          id: `trip_${(id ?? shortId('x')).slice(-16)}`,
          carId: getCar(car.slug)?.id ?? '',
          start: car.start,
          end: car.end,
          startTime: car.startTime,
          endTime: car.endTime,
          plan: car.coverage,
          delivery: car.delivery,
          deliveryAddress: car.deliveryAddress,
          extras: car.extras,
          quote: j.quote,
          paid: 'stripe',
        })
        router.replace(`/trips/${t.id}?new=1`)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not confirm.'))
  }, [params, router])
  return error ? <p className="error-block">{error}</p> : <div className="skeleton" aria-busy="true" />
}
