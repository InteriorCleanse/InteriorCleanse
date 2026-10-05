/**
 * Messages between a guest and a host, one thread per booking, and the
 * notifications feed. Every read and write checks that the user is one of
 * the two people in the thread.
 */

import { randomId } from '../security/crypto.ts'
import { getUser, publicProfile, type PublicProfile } from './accounts.ts'
import { blockedBetween } from './safety.ts'
import { db } from './db.ts'
import { openText, sealText } from './sealed.ts'

/** Messages are sealed at rest with the message id as associated data. */
const ctx = (messageId: string) => `message:${messageId}`

export const MAX_MESSAGE = 2000

export interface ThreadSummary {
  id: string
  bookingId: string
  carTitle: string
  tripStatus: string
  tripEnded: boolean
  other: PublicProfile | null
  last: { body: string; at: string; mine: boolean } | null
  unread: number
}

export interface Message {
  id: string
  body: string
  at: string
  mine: boolean
}

export interface Notification {
  id: string
  title: string
  body: string
  href: string
  at: string
  read: boolean
}

interface ThreadRow {
  id: string
  booking_id: string
  guest_id: string
  host_id: string
  car: { title: string }
  status: string
  end_date: string | Date
  last_id: string | null
  last_body: string | null
  last_at: string | Date | null
  last_sender: string | null
  unread: string
}

export async function threadsFor(userId: string): Promise<ThreadSummary[]> {
  const q = await db()
  const rows = await q.query<ThreadRow>(
    `select t.*, b.car, b.status, b.end_date,
       m.id as last_id, m.body as last_body, m.created_at as last_at, m.sender_id as last_sender,
       (select count(*) from messages x where x.thread_id = t.id and x.sender_id <> $1
          and x.created_at > coalesce((select read_at from thread_reads r where r.thread_id = t.id and r.user_id = $1), 'epoch')) as unread
     from threads t
     join bookings b on b.id = t.booking_id
     left join lateral (select id, body, created_at, sender_id from messages where thread_id = t.id order by created_at desc limit 1) m on true
     where t.guest_id = $1 or t.host_id = $1
     order by coalesce(m.created_at, t.last_message_at) desc`,
    [userId],
  )
  const today = new Date().toISOString().slice(0, 10)
  return Promise.all(
    rows.map(async (r) => {
      const otherId = r.guest_id === userId ? r.host_id : r.guest_id
      const other = await getUser(otherId, q)
      const end = typeof r.end_date === 'string' ? r.end_date.slice(0, 10) : r.end_date.toISOString().slice(0, 10)
      return {
        id: r.id,
        bookingId: r.booking_id,
        carTitle: r.car.title,
        tripStatus: r.status,
        tripEnded: end < today,
        other: other ? publicProfile(other) : null,
        last: r.last_body ? { body: await openText(r.last_body, ctx(r.last_id!)), at: new Date(r.last_at as string).toISOString(), mine: r.last_sender === userId } : null,
        unread: Number(r.unread),
      }
    }),
  )
}

interface Member {
  guest_id: string
  host_id: string
  /** Whether new messages can still be sent. */
  open: boolean
}

/**
 * A thread stays open while its trip is live, and for 14 days after it ends
 * (or 3 days after a decline or cancellation), then becomes read-only.
 */
async function member(userId: string, threadId: string): Promise<Member | null> {
  const [t] = await (await db()).query<Member>(
    `select t.guest_id, t.host_id,
       case when b.status in ('requested', 'confirmed') then b.end_date >= current_date - 14
            else b.updated_at > now() - interval '3 days' end as open
     from threads t join bookings b on b.id = t.booking_id
     where t.id = $1 and (t.guest_id = $2 or t.host_id = $2)`,
    [threadId, userId],
  )
  return t ?? null
}

/** Whether this user can still write in the thread (null when not a member). */
export async function threadOpen(userId: string, threadId: string): Promise<boolean | null> {
  const m = await member(userId, threadId)
  return m ? m.open : null
}

/** Messages in a thread, oldest first; marks the thread read for this user. */
export async function messagesIn(userId: string, threadId: string, after?: string): Promise<Message[] | null> {
  if (!(await member(userId, threadId))) return null
  const q = await db()
  const rows = await q.query<{ id: string; body: string; created_at: string | Date; sender_id: string }>(
    `select id, body, created_at, sender_id from messages where thread_id = $1 ${after ? 'and created_at > $2::timestamptz' : ''} order by created_at asc limit 500`,
    after ? [threadId, after] : [threadId],
  )
  await q.query(
    `insert into thread_reads (thread_id, user_id, read_at) values ($1, $2, now()) on conflict (thread_id, user_id) do update set read_at = now()`,
    [threadId, userId],
  )
  return Promise.all(rows.map(async (r) => ({ id: r.id, body: await openText(r.body, ctx(r.id)), at: new Date(r.created_at).toISOString(), mine: r.sender_id === userId })))
}

export class BlockedError extends Error {}

/** Sends a message; null if the thread isn't yours or has closed. Throws BlockedError if either person blocked the other. */
export async function sendMessage(userId: string, threadId: string, body: string): Promise<Message | null> {
  const text = body.trim().slice(0, MAX_MESSAGE)
  const t = text ? await member(userId, threadId) : null
  if (!t || !t.open) return null
  const q = await db()
  const id = randomId(12)
  const to = t.guest_id === userId ? t.host_id : t.guest_id
  if (await blockedBetween(userId, to, q)) throw new BlockedError('blocked')
  // Email the other person only for the first unread message, not every line.
  const [waiting] = await q.query(
    `select 1 from messages x where x.thread_id = $1 and x.sender_id = $2
       and x.created_at > coalesce((select read_at from thread_reads r where r.thread_id = $1 and r.user_id = $3), 'epoch') limit 1`,
    [threadId, userId, to],
  )
  const [row] = await q.query<{ created_at: string | Date }>(
    `insert into messages (id, thread_id, sender_id, body) values ($1, $2, $3, $4) returning created_at`,
    [id, threadId, userId, await sealText(text, ctx(id))],
  )
  await q.query(`update threads set last_message_at = $2 where id = $1`, [threadId, row.created_at])
  if (!waiting) {
    const sender = await getUser(userId, q)
    // Born read: it exists to be emailed; the inbox already shows the message.
    // The text itself is never copied here or into the email: it stays sealed.
    await q.query(`insert into notifications (id, user_id, title, body, href, read_at, category) values ($1, $2, $3, $4, $5, now(), 'messages')`, [
      randomId(12),
      to,
      `New message from ${sender?.name.split(/\s+/)[0] ?? 'your trip'}`,
      'Open AVANT to read and reply.',
      `/inbox/${threadId}`,
    ])
  }
  await q.query(
    `insert into thread_reads (thread_id, user_id, read_at) values ($1, $2, now()) on conflict (thread_id, user_id) do update set read_at = now()`,
    [threadId, userId],
  )
  return { id, body: text, at: new Date(row.created_at).toISOString(), mine: true }
}

export async function unreadCounts(userId: string): Promise<{ messages: number; notifications: number }> {
  const q = await db()
  const [m] = await q.query<{ n: string }>(
    `select count(*) as n from messages x join threads t on t.id = x.thread_id
     where (t.guest_id = $1 or t.host_id = $1) and x.sender_id <> $1
       and x.created_at > coalesce((select read_at from thread_reads r where r.thread_id = t.id and r.user_id = $1), 'epoch')`,
    [userId],
  )
  const [n] = await q.query<{ n: string }>(`select count(*) as n from notifications where user_id = $1 and read_at is null`, [userId])
  return { messages: Number(m.n), notifications: Number(n.n) }
}

export async function notificationsFor(userId: string): Promise<Notification[]> {
  const rows = await (await db()).query<{ id: string; title: string; body: string; href: string; created_at: string | Date; read_at: string | null }>(
    `select * from notifications where user_id = $1 and href not like '/inbox/%' order by created_at desc limit 100`,
    [userId],
  )
  return rows.map((r) => ({ id: r.id, title: r.title, body: r.body, href: r.href, at: new Date(r.created_at).toISOString(), read: Boolean(r.read_at) }))
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await (await db()).query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [userId])
}

// ── Favorites ───────────────────────────────────────────────────────────

export async function favoritesFor(userId: string): Promise<string[]> {
  const rows = await (await db()).query<{ listing_slug: string }>(`select listing_slug from favorites where user_id = $1 order by created_at desc`, [userId])
  return rows.map((r) => r.listing_slug)
}

export async function setFavorite(userId: string, slug: string, on: boolean): Promise<void> {
  const q = await db()
  if (on) await q.query(`insert into favorites (user_id, listing_slug) values ($1, $2) on conflict do nothing`, [userId, slug])
  else await q.query(`delete from favorites where user_id = $1 and listing_slug = $2`, [userId, slug])
}
