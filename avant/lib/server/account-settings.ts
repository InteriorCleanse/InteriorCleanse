/**
 * Account settings beyond the profile: where you're signed in (and signing
 * out of one device), and changing your email address.
 *
 * Sessions are listed by a short prefix of their stored hash, which says
 * nothing about the token itself. A new email address must confirm itself
 * with a single-use, 24-hour link before it replaces the old one, and the
 * old address is told, so a stolen session can't quietly take the account.
 */

import { createHash, randomBytes } from 'node:crypto'
import { normaliseEmail, tokenHash, verifyPassword } from './accounts.ts'
import { notify } from './bookings.ts'
import { db } from './db.ts'

const IDLE_DAYS = 14

export interface SessionInfo {
  id: string
  signedInAt: string
  lastActiveAt: string
  current: boolean
}

export async function sessionsFor(userId: string, currentToken: string | undefined): Promise<SessionInfo[]> {
  const current = currentToken ? tokenHash(currentToken) : ''
  const rows = await (await db()).query<{ token_hash: string; created_at: string | Date; last_seen_at: string | Date }>(
    `select token_hash, created_at, last_seen_at from sessions
     where user_id = $1 and expires_at > now() and last_seen_at > now() - interval '${IDLE_DAYS} days'
     order by last_seen_at desc`,
    [userId],
  )
  return rows.map((r) => ({
    id: r.token_hash.slice(0, 16),
    signedInAt: new Date(r.created_at).toISOString(),
    lastActiveAt: new Date(r.last_seen_at).toISOString(),
    current: r.token_hash === current,
  }))
}

/** Signs one of your own sessions out (and its iPhone stops getting notifications). */
export async function endSessionById(userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f]{16}$/.test(id)) return false
  const done = await (await db()).query(`delete from sessions where user_id = $1 and left(token_hash, 16) = $2 returning user_id`, [userId, id])
  return done.length > 0
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export type EmailChangeResult = { link: string; to: string; name: string } | 'wrong-password' | 'same' | 'taken'

/** Starts an email change: checks the password, then makes a link for the new address. */
export async function startEmailChange(userId: string, password: string, newEmail: string, site: string): Promise<EmailChangeResult> {
  const d = await db()
  const [u] = await d.query<{ email: string; name: string; password_hash: string }>(`select email, name, password_hash from users where id = $1 and deleted_at is null`, [userId])
  if (!u || !(await verifyPassword(password, u.password_hash))) return 'wrong-password'
  const email = normaliseEmail(newEmail)
  if (email === u.email) return 'same'
  const [taken] = await d.query(`select 1 from users where email = $1`, [email])
  if (taken) return 'taken'
  const token = randomBytes(32).toString('base64url')
  await d.tx(async (t) => {
    await t.query(`delete from email_changes where user_id = $1`, [userId])
    await t.query(`insert into email_changes (token_hash, user_id, new_email, expires_at) values ($1, $2, $3, now() + interval '24 hours')`, [sha256(token), userId, email])
    await notify(t, userId, 'Email change requested', `Someone asked to change your AVANT email to a new address. If it wasn’t you, change your password now.`, '/account#security')
  })
  return { link: `${site}/confirm-email#token=${token}`, to: email, name: u.name }
}

/** Finishes it from the link sent to the new address. Null for a bad, used or clashing link. */
export async function confirmEmailChange(token: string): Promise<{ userId: string; oldEmail: string; name: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  return (await db()).tx(async (t) => {
    const [c] = await t.query<{ user_id: string; new_email: string }>(
      `delete from email_changes where token_hash = $1 and expires_at > now() returning user_id, new_email`,
      [sha256(token)],
    )
    if (!c) return null
    const [taken] = await t.query(`select 1 from users where email = $1`, [c.new_email])
    if (taken) return null
    const [old] = await t.query<{ email: string; name: string }>(`select email, name from users where id = $1 and deleted_at is null`, [c.user_id])
    if (!old) return null
    await t.query(`update users set email = $2, email_verified_at = now() where id = $1`, [c.user_id, c.new_email])
    await notify(t, c.user_id, 'Your email was changed', 'Your AVANT email address was changed. If it wasn’t you, contact support right away.', '/account#security')
    return { userId: c.user_id, oldEmail: old.email, name: old.name }
  })
}
