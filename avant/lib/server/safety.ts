/**
 * Reporting and blocking, as App Store guideline 1.2 expects of any app
 * with user content (messages, reviews, listings).
 *
 * Reports name a thing (a message, a review, a trip, a listing), never a
 * raw account id: the server works out who is behind it, and only if the
 * reporter can see that thing. Every report is stored and emailed to the
 * support inbox (AVANT_SUPPORT_EMAIL) for a person to act on.
 *
 * Blocking is mutual in effect: neither person can message the other or
 * book the other's car. Past trips and their history stay intact.
 */

import { randomId } from '../security/crypto.ts'
import { shortName } from './accounts.ts'
import { db, type Db } from './db.ts'
import { sendEmail } from './email.ts'
import { openText, sealText } from './sealed.ts'

export type ReportContext = 'profile' | 'message' | 'review' | 'listing' | 'trip'

export const REPORT_REASONS = [
  'Harassment or threats',
  'Discrimination or hate',
  'Spam or a scam',
  'Asking to pay outside AVANT',
  'Inappropriate content',
  'Unsafe car or driving',
  'Something else',
] as const

/** Who is behind a reported thing, if the reporter can see it. Null otherwise. */
async function subjectOf(q: Db, reporterId: string, context: ReportContext, subjectId: string): Promise<string | null> {
  if (context === 'message') {
    const [m] = await q.query<{ sender_id: string }>(
      `select m.sender_id from messages m join threads t on t.id = m.thread_id where m.id = $1 and (t.guest_id = $2 or t.host_id = $2)`,
      [subjectId, reporterId],
    )
    return m?.sender_id ?? null
  }
  if (context === 'review') {
    // Car reviews are public; guest reviews are visible to the people on that trip.
    const [r] = await q.query<{ author_id: string }>(
      `select r.author_id from reviews r join bookings b on b.id = r.booking_id
       where r.id = $1 and (r.subject = 'car' or b.guest_id = $2 or b.host_id = $2)`,
      [subjectId, reporterId],
    )
    return r?.author_id ?? null
  }
  if (context === 'trip' || context === 'profile') {
    // A trip (or the other person on it, from their profile card).
    const [b] = await q.query<{ guest_id: string; host_id: string | null }>(`select guest_id, host_id from bookings where id = $1 and (guest_id = $2 or host_id = $2)`, [
      subjectId,
      reporterId,
    ])
    if (!b) return null
    return b.guest_id === reporterId ? b.host_id : b.guest_id
  }
  const [l] = await q.query<{ host_id: string }>(`select host_id from listings where slug = $1 and status = 'live'`, [subjectId])
  return l?.host_id ?? null
}

export async function blockedBetween(a: string, b: string, q?: Db): Promise<boolean> {
  const [row] = await (q ?? (await db())).query(
    `select 1 from user_blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1) limit 1`,
    [a, b],
  )
  return Boolean(row)
}

export type SafetyResult = 'ok' | 'not-found' | 'self'

export async function block(userId: string, context: ReportContext, subjectId: string, on: boolean): Promise<SafetyResult> {
  const d = await db()
  const other = await subjectOf(d, userId, context, subjectId)
  if (!other) return 'not-found'
  if (other === userId) return 'self'
  if (on) await d.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [userId, other])
  else await d.query(`delete from user_blocks where blocker_id = $1 and blocked_id = $2`, [userId, other])
  return 'ok'
}

/** The people someone has blocked, for Profile, by an opaque handle (not the account id). */
export async function blocksFor(userId: string): Promise<{ handle: string; name: string; since: string }[]> {
  const rows = await (await db()).query<{ blocked_id: string; name: string; created_at: string | Date }>(
    `select b.blocked_id, u.name, b.created_at from user_blocks b join users u on u.id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc`,
    [userId],
  )
  return Promise.all(rows.map(async (r) => ({ handle: await sealText(r.blocked_id, `block:${userId}`), name: shortName(r.name), since: new Date(r.created_at).toISOString() })))
}

export async function unblockHandle(userId: string, handle: string): Promise<boolean> {
  const other = await openText(handle, `block:${userId}`)
  if (!other) return false
  const done = await (await db()).query(`delete from user_blocks where blocker_id = $1 and blocked_id = $2 returning blocked_id`, [userId, other])
  return done.length > 0
}

export async function report(
  userId: string,
  input: { context: ReportContext; subjectId: string; reason: string; details: string; alsoBlock: boolean },
): Promise<SafetyResult> {
  const d = await db()
  const subject = await subjectOf(d, userId, input.context, input.subjectId)
  if (!subject) return 'not-found'
  if (subject === userId) return 'self'
  const id = randomId(12)
  await d.query(
    `insert into reports (id, reporter_id, subject_user_id, context, subject_id, reason, details) values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, subject, input.context, input.subjectId, input.reason, input.details ? await sealText(input.details, `report:${id}`) : ''],
  )
  if (input.alsoBlock) await d.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [userId, subject])
  const to = process.env.AVANT_SUPPORT_EMAIL?.trim()
  if (to) {
    await sendEmail({
      to,
      subject: `[AVANT report] ${input.reason}`,
      text: [
        `Report ${id}`,
        `Reason: ${input.reason}`,
        `About: account ${subject}, via ${input.context} ${input.subjectId}`,
        `From: account ${userId}`,
        input.alsoBlock ? 'The reporter also blocked this person.' : '',
        '',
        input.details || '(no details)',
        '',
        'Review within 24 hours. App Store guideline 1.2 expects objectionable content to be acted on promptly.',
      ]
        .filter(Boolean)
        .join('\n'),
      idempotencyKey: `report-${id}`,
    }).catch(() => console.error('report email failed'))
  }
  return 'ok'
}
