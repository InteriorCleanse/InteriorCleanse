/**
 * Bookings, holds, trips and the money that follows them.
 *
 * A booking takes a per-car lock inside a transaction and is refused if its
 * dates overlap any booking that still holds the car, or days the host has
 * blocked, so two guests can never pay for the same days. Real listings get
 * a message thread between guest and host and notifications for both;
 * sample listings do not (there is nobody on the other side).
 *
 * Refunds are decided inside the transaction (lib/policy.ts) and recorded as
 * owed; `settleRefund` then asks Stripe for them with an idempotency key,
 * and the cron retries anything Stripe did not confirm.
 */

import { randomId } from '../security/crypto.ts'
import type { Car, Quote } from '../types.ts'
import type { TripRequest } from '../checkout.ts'
import { cancellationOutcome, REVIEW_DAYS, REQUEST_HOURS, zonedTime, type CancelOutcome } from '../policy.ts'
import { getUser, publicProfile, type PublicProfile } from './accounts.ts'
import { db, type Db } from './db.ts'
import { stripe } from './stripe.ts'

export type BookingStatus = 'pending_payment' | 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'expired'
export type RefundStatus = 'none' | 'pending' | 'done' | 'demo'

/** An unpaid checkout holds the car for 30 minutes, then lets it go. */
export const HOLDS_CAR = `(status in ('requested','confirmed') or (status = 'pending_payment' and created_at > now() - interval '30 minutes'))`

/** Days the host blocked on the listing with this slug ($1), overlapping $2..$3. */
const BLOCKED = `exists (select 1 from listing_blocks lb join listings l on l.id = lb.listing_id where l.slug = $1 and lb.start_date <= $3::date and lb.end_date >= $2::date)`

const DEFAULT_TZ = 'America/Los_Angeles'

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
  /** The city's time zone; pickup times are local. */
  tz?: string
}

export interface ReviewView {
  rating: number
  body: string
  at: string
}

export interface PersonStats {
  rating: number | null
  reviews: number
  trips: number
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
  refund: { cents: number; status: RefundStatus }
  cancelledBy: 'guest' | 'host' | 'system' | null
  /** What cancelling now would refund the guest; null when it can't be cancelled. */
  cancelPreview: CancelOutcome | null
  /** When a pending request expires unanswered. */
  respondBy: string | null
  reviews: { mine: ReviewView | null; theirs: ReviewView | null }
  canReview: boolean
  /** The other person's record on AVANT, so a host can see who is asking. */
  otherStats: PersonStats | null
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
  payment_ref: string | null
  request: TripRequest
  quote: Quote
  car: CarSnapshot
  created_at: string | Date
  refund_cents: number
  refund_status: RefundStatus
  cancelled_by: 'guest' | 'host' | 'system' | null
  thread_id?: string | null
}

const day = (d: string | Date) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const todayUtc = () => new Date().toISOString().slice(0, 10)

export function snapshot(car: Car, cityName: string, tz = DEFAULT_TZ): CarSnapshot {
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
    tz,
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

async function clashes(t: Db, slug: string, start: string, end: string, except = ''): Promise<boolean> {
  const [row] = await t.query(
    `select 1 where exists (select 1 from bookings where listing_slug = $1 and id <> $4 and ${HOLDS_CAR} and start_date <= $3::date and end_date >= $2::date) or ${BLOCKED}`,
    [slug, start, end, except],
  )
  return Boolean(row)
}

export async function createBooking(input: {
  guestId: string
  car: Car
  cityName: string
  tz?: string
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
    if (await clashes(t, car.slug, request.start, request.end)) throw new DatesTaken('Those dates were just taken. Try others.')
    await t.query(
      `insert into bookings (id, listing_slug, guest_id, host_id, start_date, end_date, status, paid, request, quote, car)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, car.slug, input.guestId, hostId, request.start, request.end, status, input.paid, JSON.stringify(request), JSON.stringify(input.quote), JSON.stringify(snapshot(car, input.cityName, input.tz))],
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
    await notify(t, hostId, 'New trip request', `${guest?.name.split(' ')[0] ?? 'A guest'} would like your ${title}, ${when}. Approve or decline within ${REQUEST_HOURS} hours.`, `/trips/${id}`)
    await notify(t, guestId, 'Request sent', `Your request for the ${title} is with the host. You’ll hear back within ${REQUEST_HOURS} hours.`, `/trips/${id}`)
  } else {
    await notify(t, hostId, 'New booking', `${guest?.name.split(' ')[0] ?? 'A guest'} booked your ${title}, ${when}.`, `/trips/${id}`)
    await notify(t, guestId, 'You’re booked', `Your ${title} is confirmed for ${when}.`, `/trips/${id}`)
  }
}

/** Marks a refund as owed: real for Stripe payments, recorded only in preview. */
const owed = (b: BookingRow, cents: number): RefundStatus => (cents <= 0 ? 'none' : b.paid === 'stripe' ? 'pending' : 'demo')

/** After Stripe confirms payment. Idempotent. */
export async function markPaid(id: string, paymentRef: string): Promise<BookingStatus | null> {
  return (await db()).tx(async (t) => {
    const [b] = await t.query<BookingRow>(`select * from bookings where id = $1 for update`, [id])
    if (!b) return null
    if (b.status !== 'pending_payment') return b.status
    await t.query(`select pg_advisory_xact_lock(hashtext($1))`, [b.listing_slug])
    // A hold older than 30 minutes no longer protects the dates. If someone
    // else took them meanwhile, refund in full rather than double-book.
    if (await clashes(t, b.listing_slug, day(b.start_date), day(b.end_date), b.id)) {
      await t.query(
        `update bookings set status = 'cancelled', cancelled_by = 'system', payment_ref = $2, refund_cents = $3, refund_status = 'pending', updated_at = now() where id = $1`,
        [id, paymentRef, b.quote.totalCents],
      )
      await notify(t, b.guest_id, 'Dates no longer available', `Your payment for the ${b.car.title} arrived after the hold ended and the dates were taken. You’ll be refunded in full.`, `/trips/${id}`)
      return 'cancelled'
    }
    // Paid up front; a request-to-book car still waits for the host.
    const next: BookingStatus = b.car.instantBook || !b.host_id ? 'confirmed' : 'requested'
    // created_at restarts at payment so the host's answer window starts now.
    await t.query(`update bookings set status = $2, payment_ref = $3, created_at = now(), updated_at = now() where id = $1`, [id, next, paymentRef])
    if (b.host_id) await announce(t, id, next, b.host_id, b.guest_id, b.car.title, b.request)
    return next
  })
}

/** Stripe gave up on an unpaid checkout: release the dates now. */
export async function expirePending(id: string): Promise<void> {
  await (await db()).query(`update bookings set status = 'expired', updated_at = now() where id = $1 and status = 'pending_payment'`, [id])
}

async function profileOf(id: string | null, q: Db): Promise<PublicProfile | null> {
  if (!id) return null
  const u = await getUser(id, q)
  return u ? publicProfile(u) : null
}

export async function personStats(userId: string, as: 'guest' | 'host', q?: Db): Promise<PersonStats> {
  const d = q ?? (await db())
  const [r] = await d.query<{ rating: string | null; reviews: string; trips: string }>(
    `select (select avg(rating) from reviews where subject_user_id = $1 and subject = $2) as rating,
            (select count(*) from reviews where subject_user_id = $1 and subject = $2) as reviews,
            (select count(*) from bookings where ${as === 'guest' ? 'guest_id' : 'host_id'} = $1 and status = 'confirmed' and end_date < current_date) as trips`,
    [userId, as === 'guest' ? 'guest' : 'car'],
  )
  return { rating: r.rating == null ? null : Math.round(Number(r.rating) * 100) / 100, reviews: Number(r.reviews), trips: Number(r.trips) }
}

function pickupMs(r: BookingRow): number {
  return zonedTime(day(r.start_date), r.request.startTime ?? '10:00', r.car.tz ?? DEFAULT_TZ)
}

async function toView(r: BookingRow, userId: string, q: Db): Promise<TripView> {
  const role = r.guest_id === userId ? 'guest' : 'host'
  const end = day(r.end_date)
  const today = todayUtc()
  const active = (r.status === 'requested' || r.status === 'confirmed') && end >= today
  const reviews = await q.query<{ author_id: string; rating: number; body: string; created_at: string | Date }>(
    `select author_id, rating, body, created_at from reviews where booking_id = $1`,
    [r.id],
  )
  const asView = (x?: (typeof reviews)[number]): ReviewView | null => (x ? { rating: x.rating, body: x.body, at: new Date(x.created_at).toISOString() } : null)
  const mine = reviews.find((x) => x.author_id === userId)
  const theirs = reviews.find((x) => x.author_id !== userId)
  const ended = r.status === 'confirmed' && end < today
  const withinWindow = Date.now() - Date.parse(`${end}T23:59:59Z`) < REVIEW_DAYS * 86_400_000
  const otherId = role === 'guest' ? r.host_id : r.guest_id
  return {
    id: r.id,
    status: r.status,
    start: day(r.start_date),
    end,
    request: r.request,
    quote: r.quote,
    car: r.car,
    paid: r.paid,
    createdAt: new Date(r.created_at).toISOString(),
    role,
    guest: await profileOf(r.guest_id, q),
    host: await profileOf(r.host_id, q),
    threadId: r.thread_id ?? null,
    refund: { cents: r.refund_cents, status: r.refund_status },
    cancelledBy: r.cancelled_by,
    cancelPreview: active ? cancellationOutcome(r.quote, pickupMs(r), Date.now(), role) : null,
    respondBy: r.status === 'requested' ? new Date(new Date(r.created_at).getTime() + REQUEST_HOURS * 3_600_000).toISOString() : null,
    reviews: { mine: asView(mine), theirs: asView(theirs) },
    canReview: Boolean(r.host_id) && ended && withinWindow && !mine,
    otherStats: otherId ? await personStats(otherId, role === 'guest' ? 'host' : 'guest', q) : null,
  }
}

const WITH_THREAD = `select b.*, t.id as thread_id from bookings b left join threads t on t.booking_id = b.id`

/** Every trip the user is part of, as guest or host, newest pickup first. */
export async function tripsFor(userId: string): Promise<TripView[]> {
  const q = await db()
  const rows = await q.query<BookingRow>(
    `${WITH_THREAD} where (b.guest_id = $1 or b.host_id = $1) and b.status not in ('pending_payment', 'expired') order by b.start_date desc`,
    [userId],
  )
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

/** The host approves or declines a request. A decline refunds in full. */
export async function respond(hostId: string, id: string, approve: boolean): Promise<ChangeResult> {
  await expireRequests()
  return (await db()).tx(async (t) => {
    const [b] = await t.query<BookingRow>(`select * from bookings where id = $1 and host_id = $2 for update`, [id, hostId])
    if (!b) return 'not-found'
    if (b.status !== 'requested') return 'not-allowed'
    if (approve) {
      await t.query(`update bookings set status = 'confirmed', updated_at = now() where id = $1`, [id])
    } else {
      await t.query(`update bookings set status = 'declined', refund_cents = $2, refund_status = $3, updated_at = now() where id = $1`, [
        id,
        b.quote.totalCents,
        owed(b, b.quote.totalCents),
      ])
    }
    await notify(
      t,
      b.guest_id,
      approve ? 'Request approved' : 'Request declined',
      approve
        ? `You’re booked: ${b.car.title}, ${day(b.start_date)} to ${day(b.end_date)}.`
        : `The host couldn’t take this one. ${b.paid === 'stripe' ? 'Your payment is being refunded in full.' : 'Nothing was charged.'} Try another ${b.car.title.split(' ').slice(1).join(' ')} nearby.`,
      `/trips/${id}`,
    )
    return 'ok'
  })
}

/** Guest or host cancels an upcoming trip, refunding per the policy. */
export async function cancel(userId: string, id: string): Promise<{ result: ChangeResult; refundCents: number }> {
  return (await db()).tx(async (t) => {
    const [b] = await t.query<BookingRow>(`select * from bookings where id = $1 and (guest_id = $2 or host_id = $2) for update`, [id, userId])
    if (!b) return { result: 'not-found', refundCents: 0 }
    if (!['requested', 'confirmed'].includes(b.status) || day(b.end_date) < todayUtc()) return { result: 'not-allowed', refundCents: 0 }
    const by = b.guest_id === userId ? 'guest' : 'host'
    // An unanswered request was never accepted, so it always refunds in full.
    const out = b.status === 'requested' ? cancellationOutcome(b.quote, 0, 0, 'host') : cancellationOutcome(b.quote, pickupMs(b), Date.now(), by)
    await t.query(`update bookings set status = 'cancelled', cancelled_by = $2, refund_cents = $3, refund_status = $4, updated_at = now() where id = $1`, [
      id,
      by,
      out.refundCents,
      owed(b, out.refundCents),
    ])
    const other = by === 'guest' ? b.host_id : b.guest_id
    if (other) await notify(t, other, 'Trip cancelled', `The ${b.car.title} trip for ${day(b.start_date)} was cancelled by the ${by}.${by === 'host' ? ' You’ll be refunded in full.' : ''}`, `/trips/${id}`)
    return { result: 'ok', refundCents: out.refundCents }
  })
}

/** Requests the host did not answer in time expire, refunded in full. */
export async function expireRequests(): Promise<string[]> {
  const d = await db()
  const stale = await d.query<{ id: string }>(`select id from bookings where status = 'requested' and created_at < now() - ($1 || ' hours')::interval`, [String(REQUEST_HOURS)])
  const done: string[] = []
  for (const { id } of stale) {
    await d.tx(async (t) => {
      const [b] = await t.query<BookingRow>(`select * from bookings where id = $1 and status = 'requested' for update`, [id])
      if (!b) return
      await t.query(`update bookings set status = 'expired', cancelled_by = 'system', refund_cents = $2, refund_status = $3, updated_at = now() where id = $1`, [
        id,
        b.quote.totalCents,
        owed(b, b.quote.totalCents),
      ])
      await notify(t, b.guest_id, 'Request expired', `The host didn’t answer in time. ${b.paid === 'stripe' ? 'You’re being refunded in full.' : 'Nothing was charged.'}`, `/trips/${id}`)
      if (b.host_id) await notify(t, b.host_id, 'Request expired', `A request for your ${b.car.title} expired unanswered. Answer within ${REQUEST_HOURS} hours to keep your listing ranked well.`, `/trips/${id}`)
      done.push(id)
    })
  }
  return done
}

/** Sends an owed refund to Stripe. Safe to call repeatedly. */
export async function settleRefund(id: string): Promise<boolean> {
  const d = await db()
  const [b] = await d.query<BookingRow>(`select * from bookings where id = $1`, [id])
  if (!b || b.refund_status !== 'pending' || b.refund_cents <= 0) return false
  if (!b.payment_ref?.startsWith('pi_')) {
    console.error(`refund ${id}: no payment intent`)
    return false
  }
  try {
    const refund = await stripe<{ id: string; status: string }>('refunds', {
      form: { payment_intent: b.payment_ref, amount: String(b.refund_cents), 'metadata[booking]': id },
      idempotencyKey: `refund-${id}`,
    })
    await d.query(`update bookings set refund_status = 'done', refund_ref = $2, updated_at = now() where id = $1 and refund_status = 'pending'`, [id, refund.id])
    return true
  } catch (err) {
    console.error(`refund ${id}: ${err instanceof Error ? err.message : 'failed'}`)
    return false
  }
}

export async function settlePendingRefunds(): Promise<number> {
  const rows = await (await db()).query<{ id: string }>(`select id from bookings where refund_status = 'pending' order by updated_at limit 50`)
  let n = 0
  for (const r of rows) if (await settleRefund(r.id)) n += 1
  return n
}
