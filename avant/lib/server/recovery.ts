/**
 * Password reset by emailed link. The link carries a random 256-bit token;
 * the database keeps only its SHA-256. It works once, for an hour, and
 * using it signs out every other session on the account.
 */

import { createHash, randomBytes } from 'node:crypto'
import { hashPassword, normaliseEmail } from './accounts.ts'
import { db } from './db.ts'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** A reset link for this email, or null when no such (live) account exists. */
export async function createResetLink(email: string, site: string): Promise<{ to: string; name: string; link: string } | null> {
  const d = await db()
  const [u] = await d.query<{ id: string; name: string; email: string }>(`select id, name, email from users where email = $1 and deleted_at is null`, [normaliseEmail(email)])
  if (!u) return null
  const token = randomBytes(32).toString('base64url')
  await d.tx(async (t) => {
    // Only the newest link works.
    await t.query(`delete from password_resets where user_id = $1`, [u.id])
    await t.query(`insert into password_resets (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [sha256(token), u.id])
  })
  // In the fragment, so the token never reaches a server log or a Referer.
  return { to: u.email, name: u.name, link: `${site}/reset#token=${token}` }
}

/** Sets the new password and ends every session. Returns the user id, or null for a bad link. */
export async function resetPassword(token: string, password: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const hash = await hashPassword(password)
  return (await db()).tx(async (t) => {
    const [r] = await t.query<{ user_id: string }>(
      `update password_resets set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id`,
      [sha256(token)],
    )
    if (!r) return null
    await t.query(`update users set password_hash = $2 where id = $1 and deleted_at is null`, [r.user_id, hash])
    await t.query(`delete from sessions where user_id = $1`, [r.user_id])
    return r.user_id
  })
}
