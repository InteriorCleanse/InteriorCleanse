/**
 * Bookings, holds and trips.
 *
 * A booking takes a per-car lock inside a transaction and is refused if its
 * dates overlap any booking that still holds the car, so two guests can
 * never pay for the same days. Real listings get a message thread between
 * guest and host and notifications for both; sample listings do not (there
 * is nobody on the other side).
 */

import { randomId } from '../security/crypto.ts'
import type { Car, Quote } from '../types.ts'
import type { TripRequest } from '../checkout.ts'
import { getUser, publicProfile, type PublicProfile } from './accounts.ts'
import { db, type Db } from './db.ts'

export type BookingStatus = 'pending_payment' | 'requested' | 'confirmed' | 'declined' | 'cancelled'

/** An unpaid checkout holds the car for 30 minutes, then lets it go. */
export const HOLDS_CAR = `(status in ('requested','confirmed') or (status = 'pending_payment' and created_at > now() - interval '30 minutes'))`

/** What the trip screens need about the car, frozen at booking time. */
export interface CarSnapshot {
  slug: string
  title: string
  body: Car['body']
  colorHex: string
  photo: string | null
  city: string
  neighborhood: string
  sample: boolean
  instantBook: boolean
}

export interface TripView {
  id: string
  status: BookingStatus
  start: string
  end: string
  request: TripRequest
  quote: Quote
  car: CarSnapshot
  paid: 'demo' | 'stripe'
  createdAt: string
  role: 'guest' | 'host'
  guest: PublicProfile | null
  host: PublicProfile | null
  threadId: string | null
}

export class DatesTaken extends Error {}

interface BookingRow {
  id: string
  listing_slug: string
  guest_id: string
  host_id: string | null
  start_date: string | Date
  end_date: string | Date
  status: BookingStatus
  paid: 'demo' | 'stripe'
  request: TripRequest
  quote: Quote
  car: CarSnapshot
  created_at: string | Date
  thread_id?: string | null
}

const day = (d: string | Date) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

export function snapshot(car: Car, cityName: string): CarSnapshot {
  return {
    slug: car.slug,
    title: `${car.year} ${car.make} ${car.model}`,
    body: car.body,
    colorHex: car.color.hex,
    photo: car.photos[0] ?? null,
    city: cityName,
    neighborhood: car.neighborhood,
    sample: Boolean(car.sample),
    instantBook: car.instantBook,
  }
}

export async function notify(q: Db, userId: string, title: string, body: string, href: string): Promise<void> {
  await q.query(`insert into notifications (id, user_id, title, body, href) values ($1, $2, $3, $4, $5)`, [randomId(12), userId, title, body, href])
}

/** Bookings that currently hold the car, for availability. */
export async function heldRanges(slugs: string[]): Promise<Map<string, { start: string; end: string }[]>> {
  const out = new Map<string, { start: string; end: string }[]>()
  if (!slugs.length) return out
  const rows = await (await db()).query<{ listing_slug: string; start_date: string | Date; end_date: string | Date }>(
    `select listing_slug, start_date, end_date from bookings where listing_slug = any($1::text[]) and ${HOLDS_CAR} and end_date >= current_date`,
    [slugs],
  )
  for (const r of rows) out.set(r.listing_slug, [...(out.get(r.listing_slug) ?? []), { start: day(r.start_date), end: day(r.end_date) }])
  return out
}

export async function createBooking(input: {
  guestId: string
  car: Car
  cityName: string
  request: TripRequest
  quote: Quote
  paid: 'demo' | 'stripe'
}): Promise<{ id: string; status: BookingStatus }> {
  const { car, request } = input
  const hostId = car.sample ? null : car.hostId
  if (hostId === input.guestId) throw new DatesTaken('You can’t book your own car.')
  const status: BookingStatus = input.paid === 'stripe' ? 'pending_payment' : car.instantBook ? 'confirmed' : 'requested'
  const id = randomId(12)
  await (await db()).tx(async (t) => {
    // One booking at a time per car, so the overlap check below is reliable.
    await t.query(`select pg_advisory_xact_lock(hashtext($1))`, [car.slug])
    const [clash] = await t.query(
      `select 1 from bookings where listing_slug = $1 and ${HOLDS_CAR} and start_date <= $3::date and end_date >= $2::date`,
      [car.slug, request.start, request.end],
    )
    if (clash) throw new DatesTaken('Those dates were just taken. Try others.')
    await t.query(
      `insert into bookings (id, listing_slug, guest_id, host_id, start_date, end_date, status, paid, request, quote, car)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, car.slug, input.guestId, hostId, request.start, request.end, status, input.paid, JSON.stringify(request), JSON.stringify(input.quote), JSON.stringify(snapshot(car, input.cityName))],
    )
    if (hostId) {
      await t.query(`insert into threads (id, booking_id, guest_id, host_id) values ($1, $2, $3, $4)`, [randomId(12), id, input.guestId, hostId])
      if (status !== 'pending_payment') await announce(t, id, status, hostId, input.guestId, `${car.year} ${car.make} ${car.model}`, request)
    }
  })
  return { id, status }
}

async function announce(t: Db, id: string, status: BookingStatus, hostId: string, guestId: string, title: string, r: TripRequest) {
  const guest = await getUser(guestId, t)
  const when = `${r.start} to ${r.end}`
  if (status === 'requested') {
    await notify(t, hostId, 'New trip request', `${guest?.name.split(' ')[0] ?? 'A guest'} would like your ${title}, ${when}. Approve or decline within 8 hours.`, `/trips/${id}`)
    await notify(t, guestId, 'Request sent', `Your request for the ${title} is with the host. You’ll hear back within 8 hours.`, `/trips/${id}`)
  } else {
    await notify(t, hostId, 'New booking', `${guest?.name.split(' ')[0] ?? 'A guest'} booked your ${title}, ${when}.`, `/trips/${id}`)
    await notify(t, guestId, 'You’re booked', `Your ${title} is confirmed for ${when}.`, `/trips/${id}`)
  }
}

/** After Stripe confirms payment. Idempotent. */
export async function markPaid(id: string, paymentRef: string): Promise<BookingStatus | null> {
  return (await db()).tx(async (t) => {
    const [b] = await t.query<BookingRow>(`select * from bookings where id = $1 for update`, [id])
    if (!b) return null
    if (b.status !== 'pending_payment') return b.status
    // Paid up front; a request-to-book car still waits for the host.
    const next: BookingStatus = b.car.instantBook || !b.host_id ? 'confirmed' : 'requested'
    await t.query(`update bookings set status = $2, payment_ref = $3, updated_at = now() where id = $1`, [id, next, paymentRef])
    if (b.host_id) await announce(t, id, next, b.host_id, b.guest_id, b.car.title, b.request)
    return next
  })
}

async function profileOf(id: string | null, q: Db): Promise<PublicProfile | null> {
  if (!id) return null
  const u = await getUser(id, q)
  return u ? publicProfile(u) : null
}

async function toView(r: BookingRow, userId: string, q: Db): Promise<TripView> {
  return {
    id: r.id,
    status: r.status,
    start: day(r.start_date),
    end: day(r.end_date),
    request: r.request,
    quote: r.quote,
    car: r.car,
    paid: r.paid,
    createdAt: new Date(r.created_at).toISOString(),
    role: r.guest_id === userId ? 'guest' : 'host',
    guest: await profileOf(r.guest_id, q),
    host: await profileOf(r.host_id, q),
    threadId: r.thread_id ?? null,
  }
}

const WITH_THREAD = `select b.*, t.id as thread_id from bookings b left join threads t on t.booking_id = b.id`

/** Every trip the user is part of, as guest or host, newest pickup first. */
export async function tripsFor(userId: string): Promise<TripView[]> {
  const q = await db()
  const rows = await q.query<BookingRow>(`${WITH_THREAD} where (b.guest_id = $1 or b.host_id = $1) and b.status <> 'pending_payment' order by b.start_date desc`, [userId])
  return Promise.all(rows.map((r) => toView(r, userId, q)))
}

export async function tripFor(userId: string, id: string): Promise<TripView | null> {
  const q = await db()
  const [r] = await q.query<BookingRow>(`${WITH_THREAD} where b.id = $1 and (b.guest_id = $2 or b.host_id = $2)`, [id, userId])
  return r ? toView(r, userId, q) : null
}

export async function bookingOwner(id: string): Promise<{ guestId: string; status: BookingStatus } | null> {
  const [r] = await (await db()).query<{ guest_id: string; status: BookingStatus }>(`select guest_id, status from bookings where id = $1`, [id])
  return r ? { guestId: r.guest_id, status: r.status } : null
}

export type ChangeResult = 'ok' | 'not-found' | 'not-allowed'

/** The host approves or declines a request. */
export async function respond(hostId: string, id: string, approve: boolean): Promise<ChangeResult> {
  return (await db()).tx(async (t) => {
    const [b] = await t.query<BookingRow>(`select * from bookings where id = $1 and host_id = $2 for update`, [id, hostId])
    if (!b) return 'not-found'
    if (b.status !== 'requested') return 'not-allowed'
    await t.query(`update bookings set status = $2, updated_at = now() where id = $1`, [id, approve ? 'confirmed' : 'declined'])
    await notify(
      t,
      b.guest_id,
      approve ? 'Request approved' : 'Request declined',
      approve ? `You’re booked: ${b.car.title}, ${day(b.start_date)} to ${day(b.end_date)}.` : `The host couldn’t take this one. Nothing was charged; try another ${b.car.title.split(' ').slice(1).join(' ')} nearby.`,
      `/trips/${id}`,
    )
    return 'ok'
  })
}

/** Guest or host cancels an upcoming trip. */
export async function cancel(userId: string, id: string): Promise<ChangeResult> {
  return (await db()).tx(async (t) => {
    const [b] = await t.query<BookingRow>(`select * from bookings where id = $1 and (guest_id = $2 or host_id = $2) for update`, [id, userId])
    if (!b) return 'not-found'
    if (!['requested', 'confirmed'].includes(b.status) || day(b.end_date) < new Date().toISOString().slice(0, 10)) return 'not-allowed'
    await t.query(`update bookings set status = 'cancelled', updated_at = now() where id = $1`, [id])
    const other = b.guest_id === userId ? b.host_id : b.guest_id
    if (other) await notify(t, other, 'Trip cancelled', `The ${b.car.title} trip for ${day(b.start_date)} was cancelled.`, `/trips/${id}`)
    return 'ok'
  })
}
