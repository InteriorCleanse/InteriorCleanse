/**
 * Two-way reviews after a trip: the guest reviews the car and its host, the
 * host reviews the guest. Only the two people on a finished trip, once each,
 * within REVIEW_DAYS of the end. Ratings feed the car card, the car page and
 * what a host sees about a guest asking to book.
 */

import { randomId } from '../security/crypto.ts'
import { REVIEW_DAYS } from '../policy.ts'
import type { Review } from '../types.ts'
import { notify } from './bookings.ts'
import { db } from './db.ts'

export const MAX_REVIEW = 1000

export type ReviewResult = 'ok' | 'not-found' | 'not-allowed' | 'duplicate'

export async function leaveReview(userId: string, bookingId: string, rating: number, body: string): Promise<ReviewResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'not-allowed'
  const text = body.trim().slice(0, MAX_REVIEW)
  return (await db()).tx(async (t) => {
    const [b] = await t.query<{ guest_id: string; host_id: string; listing_slug: string; status: string; ended: boolean; recent: boolean; title: string }>(
      `select guest_id, host_id, listing_slug, status, end_date < current_date as ended,
              end_date >= current_date - ($3 || ' days')::interval as recent, car->>'title' as title
       from bookings where id = $1 and host_id is not null and (guest_id = $2 or host_id = $2)`,
      [bookingId, userId, String(REVIEW_DAYS)],
    )
    if (!b) return 'not-found'
    if (b.status !== 'confirmed' || !b.ended || !b.recent) return 'not-allowed'
    const asGuest = b.guest_id === userId
    const other = asGuest ? b.host_id : b.guest_id
    const rows = await t.query(
      `insert into reviews (id, booking_id, author_id, subject, subject_user_id, listing_slug, rating, body)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (booking_id, author_id) do nothing returning id`,
      [randomId(12), bookingId, userId, asGuest ? 'car' : 'guest', other, b.listing_slug, rating, text],
    )
    if (!rows.length) return 'duplicate'
    const [author] = await t.query<{ name: string }>(`select name from users where id = $1`, [userId])
    await notify(
      t,
      other,
      'New review',
      `${author?.name.split(/\s+/)[0] ?? 'Your ' + (asGuest ? 'guest' : 'host')} left a ${rating}-star review ${asGuest ? `of your ${b.title}` : 'of your trip together'}.`,
      `/trips/${bookingId}`,
    )
    return 'ok'
  })
}

/** Reviews of a car, newest first, as the car page shows them. */
export async function reviewsForListing(slug: string, limit = 50): Promise<Review[]> {
  const rows = await (await db()).query<{ id: string; name: string; rating: number; body: string; created_at: string | Date }>(
    `select r.id, u.name, r.rating, r.body, r.created_at from reviews r join users u on u.id = r.author_id
     where r.listing_slug = $1 and r.subject = 'car' order by r.created_at desc limit $2`,
    [slug, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    author: r.name.split(/\s+/)[0],
    date: new Date(r.created_at).toISOString().slice(0, 10),
    rating: r.rating,
    text: r.body,
  }))
}
