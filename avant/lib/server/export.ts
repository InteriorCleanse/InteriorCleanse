/**
 * Everything AVANT holds about one person, in one file: the right of access
 * (CCPA/CPRA "right to know", GDPR articles 15 and 20). Sealed fields are
 * opened for their owner; other people appear only as they would in the app.
 */

import { getUser, ownProfile } from './accounts.ts'
import { tripsFor } from './bookings.ts'
import { consentsFor } from './consent.ts'
import { creditHistory } from './credit.ts'
import { db } from './db.ts'
import { favoritesFor, notificationsFor, threadsFor, messagesIn } from './inbox.ts'
import { listingForHost } from './listings.ts'
import { openText } from './sealed.ts'

export async function exportAccount(userId: string): Promise<Record<string, unknown> | null> {
  const user = await getUser(userId)
  if (!user) return null
  const d = await db()
  const listingRows = await d.query<{ id: string; data: { vinSealed?: string; vin?: string } }>(`select id, data from listings where host_id = $1`, [userId])
  const listings = await Promise.all(
    listingRows.map(async (l) => ({ ...(await listingForHost(userId, l.id)), vin: l.data.vin ?? (await openText(l.data.vinSealed, `listing:${l.id}:vin`)) })),
  )
  const threads = await threadsFor(userId)
  const conversations = await Promise.all(threads.map(async (t) => ({ with: t.other?.name ?? null, trip: t.bookingId, messages: await messagesIn(userId, t.id) })))
  const reviews = await d.query(
    `select booking_id, subject, rating, body, created_at, author_id = $1 as written_by_you from reviews where author_id = $1 or subject_user_id = $1 order by created_at`,
    [userId],
  )
  return {
    exportedAt: new Date().toISOString(),
    account: { ...ownProfile(user), bio: user.bio },
    agreements: await consentsFor(userId),
    trips: await tripsFor(userId),
    listings,
    conversations,
    reviews,
    favorites: await favoritesFor(userId),
    credit: await creditHistory(userId),
    notifications: await notificationsFor(userId),
    devices: await d.query(`select platform, created_at, last_seen_at from push_devices where user_id = $1`, [userId]),
  }
}
