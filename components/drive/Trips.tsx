'use client'

/**
 * Trips: the list (upcoming, past, cancelled) and a single trip with its
 * check-in checklist, receipt, calendar export and cancellation.
 */

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { getPlan } from '@/lib/drive/catalog'
import { FREE_CANCEL_HOURS } from '@/lib/drive/config'
import { carTitle, cityName, getCarById, getHost } from '@/lib/drive/data'
import { formatDate, formatRange, formatTime, minutesOf, parseIso, todayIso } from '@/lib/drive/dates'
import { moneyExact, plural } from '@/lib/drive/format'
import { DRIVE } from '@/lib/drive/routes'
import { useDriveActions, useDriveState } from '@/lib/drive/store'
import type { Trip } from '@/lib/drive/types'
import { CarArt } from './CarArt'
import { Icon } from './Icons'
import { PriceBreakdown } from './PriceBreakdown'
import { useToast } from './Toast'
import { Badge, Breadcrumbs, Button, EmptyState, Avatar, Card } from './ui'

function tripTone(trip: Trip, today: string) {
  if (trip.status === 'cancelled') return { label: 'Cancelled', tone: 'neutral' as const }
  if (trip.status === 'completed' || trip.end < today) return { label: 'Completed', tone: 'neutral' as const }
  if (trip.start <= today) return { label: 'In progress', tone: 'success' as const }
  return { label: 'Upcoming', tone: 'accent' as const }
}

export function TripCard({ trip, today }: { trip: Trip; today: string }) {
  const car = getCarById(trip.carId)
  if (!car) return null
  const { label, tone } = tripTone(trip, today)
  return (
    <Card as="li" className="dr-tripcard">
      <Link href={DRIVE.trip(trip.id)} className="dr-tripcard-link">
        <div className="dr-tripcard-art" style={{ color: car.color.hex }}>
          <CarArt body={car.body} color={car.color.hex} />
        </div>
        <div className="dr-tripcard-body">
          <div className="dr-tripcard-head">
            <h3>{carTitle(car)}</h3>
            <Badge tone={tone}>{label}</Badge>
          </div>
          <p>
            {formatRange(trip.start, trip.end)} · {plural(trip.quote.days, 'day')}
          </p>
          <p className="dr-muted">
            {trip.delivery ? 'Delivered' : car.neighborhood}, {cityName(car.city)} · {moneyExact(trip.quote.totalCents)}
          </p>
        </div>
        <Icon name="chevron-right" size={18} className="dr-tripcard-chev" />
      </Link>
    </Card>
  )
}

export function TripsList() {
  const { trips, hydrated } = useDriveState()
  const [today, setToday] = useState('')
  useEffect(() => setToday(todayIso()), [])

  const groups = useMemo(() => {
    const upcoming = trips.filter((t) => t.status === 'booked' && t.end >= today).sort((a, b) => a.start.localeCompare(b.start))
    const past = trips.filter((t) => t.status === 'completed' || (t.status === 'booked' && t.end < today)).sort((a, b) => b.start.localeCompare(a.start))
    const cancelled = trips.filter((t) => t.status === 'cancelled').sort((a, b) => b.start.localeCompare(a.start))
    return { upcoming, past, cancelled }
  }, [trips, today])

  if (!hydrated || !today) return <div className="dr-skeleton dr-skeleton-block" aria-busy="true" />

  if (trips.length === 0) {
    return (
      <EmptyState
        icon="trips"
        title="No trips yet"
        body="Book a car and it appears here with its check-in list, receipt and host thread. Trips are kept on this device."
        action={<Button href={DRIVE.cars} iconAfter="arrow-right">Find a car</Button>}
      />
    )
  }

  return (
    <div className="dr-trips">
      {(['upcoming', 'past', 'cancelled'] as const).map((key) =>
        groups[key].length ? (
          <section key={key} aria-labelledby={`dr-trips-${key}`}>
            <h2 id={`dr-trips-${key}`} className="dr-h2">
              {key === 'upcoming' ? 'Upcoming' : key === 'past' ? 'Past' : 'Cancelled'} <span className="dr-muted">({groups[key].length})</span>
            </h2>
            <ul className="dr-triplist">
              {groups[key].map((t) => (
                <TripCard key={t.id} trip={t} today={today} />
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  )
}

function icsFor(trip: Trip, title: string, location: string): string {
  const stamp = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//InteriorCleanse//Drive//EN',
    'BEGIN:VEVENT',
    `UID:${trip.id}@interiorcleanse.com`,
    `DTSTAMP:${new Date(trip.bookedAt).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${stamp(trip.start, trip.startTime)}`,
    `DTEND:${stamp(trip.end, trip.endTime)}`,
    `SUMMARY:Drive: ${title}`,
    `LOCATION:${location}`,
    `DESCRIPTION:Trip ${trip.id}. Total ${moneyExact(trip.quote.totalCents)}.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export function TripDetail({ id }: { id: string }) {
  const { trips, hydrated } = useDriveState()
  const { cancelTrip, completeTrip, toggleCheckIn } = useDriveActions()
  const params = useSearchParams()
  const toast = useToast()
  const [today, setToday] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  useEffect(() => setToday(todayIso()), [])

  const trip = trips.find((t) => t.id === id)
  const justBooked = params.get('new') === '1'

  if (!hydrated || !today) return <div className="dr-skeleton dr-skeleton-block" aria-busy="true" />
  if (!trip) {
    return (
      <EmptyState
        icon="trips"
        title="Trip not found"
        body="It may have been booked on another device or browser. Trips live only where they were made."
        action={<Button href={DRIVE.trips}>All trips</Button>}
      />
    )
  }
  const car = getCarById(trip.carId)
  if (!car) return null
  const host = getHost(car.hostId)
  const { label, tone } = tripTone(trip, today)
  const pickupMs = parseIso(trip.start) + minutesOf(trip.startTime) * 60_000
  const freeCancel = Date.now() < pickupMs - FREE_CANCEL_HOURS * 3_600_000
  const active = trip.status === 'booked'
  const done = trip.checkIn.filter((c) => c.done).length
  const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(trip, carTitle(car), trip.delivery ? trip.deliveryAddress : `${car.neighborhood}, ${cityName(car.city)}`))}`

  return (
    <div className="dr-trip">
      <Breadcrumbs items={[{ label: 'Trips', href: DRIVE.trips }, { label: carTitle(car) }]} />
      {justBooked ? (
        <div className="dr-banner dr-banner-success" role="status">
          <Icon name="check" size={18} />
          <div>
            <strong>{car.instantBook ? 'You’re booked.' : 'Request sent.'}</strong> {host.name.split(' ')[0]} has a message waiting for you in
            your inbox. {car.instantBook ? '' : `Hosts usually reply within ${host.responseMinutes} minutes.`}
          </div>
        </div>
      ) : null}

      <div className="dr-trip-head">
        <div className="dr-trip-art" style={{ color: car.color.hex }}>
          <CarArt body={car.body} color={car.color.hex} />
        </div>
        <div>
          <Badge tone={tone}>{label}</Badge>
          <h1 className="dr-h1">{carTitle(car)}</h1>
          <p className="dr-lead">
            {formatDate(trip.start, true)} {formatTime(trip.startTime)} → {formatDate(trip.end, true)} {formatTime(trip.endTime)}
          </p>
          <p className="dr-muted">
            {trip.delivery ? `Delivered to ${trip.deliveryAddress}` : `Pickup in ${car.neighborhood}, ${cityName(car.city)}`} · {getPlan(trip.plan).name}{' '}
            protection · driver {trip.driverName}
          </p>
          <div className="dr-row dr-trip-actions">
            <Button variant="secondary" size="sm" icon="calendar" href={ics} download={`drive-${trip.id}.ics`}>
              Add to calendar
            </Button>
            <Button variant="secondary" size="sm" icon="inbox" href={DRIVE.inbox}>
              Message {host.name.split(' ')[0]}
            </Button>
            <Button variant="secondary" size="sm" icon="chevron-right" href={DRIVE.car(car.slug)}>
              Car page
            </Button>
          </div>
        </div>
      </div>

      <div className="dr-trip-layout">
        <div className="dr-trip-main">
          {active ? (
            <section className="dr-panel" aria-labelledby="dr-checkin">
              <div className="dr-section-title">
                <div>
                  <h2 id="dr-checkin">Check-in</h2>
                  <p>
                    {done} of {trip.checkIn.length} done. Do these at pickup; they protect you if anything is disputed later.
                  </p>
                </div>
              </div>
              <ul className="dr-checklist">
                {trip.checkIn.map((item) => (
                  <li key={item.id}>
                    <label className="dr-check dr-check-row">
                      <input type="checkbox" checked={item.done} onChange={() => toggleCheckIn(trip.id, item.id)} />
                      <span data-done={item.done ? 'true' : undefined}>{item.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="dr-panel" aria-labelledby="dr-host">
            <h2 id="dr-host" className="dr-h2">
              Your host
            </h2>
            <div className="dr-hostrow">
              <Avatar name={host.name} size={48} />
              <div>
                <strong>{host.name}</strong>
                <p className="dr-muted">
                  {host.allStar ? 'All-star host · ' : ''}
                  {plural(host.trips, 'trip')} · replies in about {host.responseMinutes} min
                </p>
              </div>
            </div>
            <ul className="dr-guidelines">
              {car.guidelines.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </section>

          {active ? (
            <section className="dr-panel" aria-labelledby="dr-changes">
              <h2 id="dr-changes" className="dr-h2">
                Changes
              </h2>
              <p className="dr-muted">
                {freeCancel
                  ? `Free cancellation until ${FREE_CANCEL_HOURS} hours before pickup.`
                  : `Inside ${FREE_CANCEL_HOURS} hours of pickup: cancelling forfeits one day.`}
              </p>
              <div className="dr-row">
                <Button variant="secondary" href={`${DRIVE.book(car.slug)}?start=${trip.start}&end=${trip.end}`}>
                  Rebook with new dates
                </Button>
                {trip.end < today ? (
                  <Button variant="secondary" onClick={() => completeTrip(trip.id)}>
                    Mark completed
                  </Button>
                ) : null}
                {!confirmCancel ? (
                  <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                    Cancel trip
                  </Button>
                ) : (
                  <span className="dr-row">
                    <Button
                      variant="danger"
                      onClick={() => {
                        cancelTrip(trip.id)
                        setConfirmCancel(false)
                        toast('Trip cancelled')
                      }}
                    >
                      Yes, cancel it
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                      Keep it
                    </Button>
                  </span>
                )}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="dr-trip-side" aria-label="Receipt">
          <div className="dr-panel">
            <h2 className="dr-h2">Receipt</h2>
            <PriceBreakdown quote={trip.quote} />
            <p className="dr-muted dr-small">
              Booked {new Date(trip.bookedAt).toLocaleString()} · ref {trip.id}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
