/**
 * Accounts and sign-in sessions.
 *
 * Passwords: scrypt (N=2^15, r=8, p=1) with a per-user salt, compared in
 * constant time. Unknown emails still pay for a hash so response time does
 * not reveal which emails have accounts.
 * Sessions: a random 256-bit token in an httpOnly cookie; the database keeps
 * only its SHA-256. A session ends after 30 days, or after 14 idle days.
 */

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { randomId } from '../security/crypto.ts'
import { db, type Db } from './db.ts'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const SESSION_DAYS = 30
const IDLE_DAYS = 14

/** Names are letters, spaces and ' - . only: no links, no control or bidi characters in anything shown to others. */
export const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]{0,58}[\p{L}\p{M}.]$/u

/** Strips control and invisible formatting characters (bidi overrides, zero-width) from free text. */
export const cleanText = (s: string) => s.replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' ? c : '')).trim()

export interface User {
  id: string
  email: string
  name: string
  bio: string
  avatarPhotoId: string | null
  createdAt: string
  emailVerified: boolean
}

/** What other people may see about a user. */
export interface PublicProfile {
  id: string
  name: string
  firstName: string
  bio: string
  photo: string | null
  joined: string
}

interface UserRow {
  id: string
  email: string
  name: string
  bio: string
  avatar_photo_id: string | null
  created_at: string | Date
  password_hash: string
  email_verified_at: string | Date | null
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  bio: r.bio,
  avatarPhotoId: r.avatar_photo_id,
  createdAt: new Date(r.created_at).toISOString(),
  emailVerified: Boolean(r.email_verified_at),
})

export const photoUrl = (id: string | null | undefined) => (id ? `/api/photos/${id}` : null)

/** "Morgan Hale" → "Morgan H.": what other people see; the full name stays private. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
}

/** What other people may see about a user: first name and last initial, never the email. */
export function publicProfile(u: Pick<User, 'id' | 'name' | 'bio' | 'avatarPhotoId' | 'createdAt'>): PublicProfile {
  return { id: u.id, name: shortName(u.name), firstName: u.name.split(/\s+/)[0], bio: u.bio, photo: photoUrl(u.avatarPhotoId), joined: u.createdAt }
}

/** The signed-in person's own view of their account: full name and email. */
export function ownProfile(u: User) {
  return { ...publicProfile(u), name: u.name, email: u.email, emailVerified: u.emailVerified }
}

export const normaliseEmail = (email: string) => email.trim().toLowerCase()

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 32, PARAMS)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// A real hash of a random password, verified against when the email is unknown.
// Started at load, so even the first unknown-email sign-in on a fresh
// instance costs exactly one hash, like a real one.
let decoy: Promise<string> | null = null
const decoyHash = () => (decoy ??= hashPassword(randomId(16)))
void decoyHash()

export class EmailTakenError extends Error {}

export async function createUser(input: { name: string; email: string; password: string }): Promise<User> {
  const d = await db()
  const email = normaliseEmail(input.email)
  const hash = await hashPassword(input.password)
  try {
    const [row] = await d.query<UserRow>(
      `insert into users (id, email, name, password_hash) values ($1, $2, $3, $4) returning *`,
      [randomId(12), email, cleanText(input.name), hash],
    )
    return toUser(row)
  } catch (err) {
    if (/unique|duplicate/i.test(String((err as Error).message))) throw new EmailTakenError('email taken')
    throw err
  }
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const d = await db()
  const [row] = await d.query<UserRow>(`select * from users where email = $1`, [normaliseEmail(email)])
  if (!row) {
    await verifyPassword(password, await decoyHash())
    return null
  }
  return (await verifyPassword(password, row.password_hash)) ? toUser(row) : null
}

export async function getUser(id: string, q?: Db): Promise<User | null> {
  const [row] = await (q ?? (await db())).query<UserRow>(`select * from users where id = $1`, [id])
  return row ? toUser(row) : null
}

export async function updateProfile(id: string, patch: { name?: string; bio?: string; avatarPhotoId?: string | null }): Promise<User | null> {
  const d = await db()
  const [row] = await d.query<UserRow>(
    `update users set name = coalesce($2, name), bio = coalesce($3, bio), avatar_photo_id = case when $4::boolean then $5 else avatar_photo_id end
     where id = $1 returning *`,
    [id, patch.name === undefined ? null : cleanText(patch.name), patch.bio === undefined ? null : cleanText(patch.bio), patch.avatarPhotoId !== undefined, patch.avatarPhotoId ?? null],
  )
  return row ? toUser(row) : null
}

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await (await db()).query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)`, [tokenHash(token), userId, expires.toISOString()])
  return { token, expires }
}

export async function userForToken(token: string | undefined): Promise<User | null> {
  if (!token || token.length > 100) return null
  const d = await db()
  const [row] = await d.query<UserRow & { last_seen_at: string | Date }>(
    `select u.*, s.last_seen_at from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and s.last_seen_at > now() - interval '${IDLE_DAYS} days' and u.deleted_at is null`,
    [tokenHash(token)],
  )
  if (!row) return null
  // Note activity at most hourly, so reads don't each cost a write.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 3_600_000) {
    await d.query(`update sessions set last_seen_at = now() where token_hash = $1`, [tokenHash(token)])
  }
  return toUser(row)
}

export async function endSession(token: string | undefined): Promise<void> {
  if (token) await (await db()).query(`delete from sessions where token_hash = $1`, [tokenHash(token)])
}

/** Replaces the password hash. Callers end other sessions as appropriate. */
export async function setPassword(userId: string, password: string): Promise<void> {
  await (await db()).query(`update users set password_hash = $2 where id = $1 and deleted_at is null`, [userId, await hashPassword(password)])
}

export async function endAllSessions(userId: string): Promise<void> {
  await (await db()).query(`delete from sessions where user_id = $1`, [userId])
}

export type DeleteResult = 'ok' | 'has-trips'

/**
 * Closes an account. Refused while trips are upcoming (as guest or host).
 * Listings, photos, favorites, sessions and notifications are deleted; the
 * user row stays only as an anonymous "Former member", so the other side of
 * past trips and conversations keeps a coherent history and payouts or
 * refunds still owed can be settled. Their messages and delivery addresses
 * are blanked. Consent records stay: they're the evidence for any dispute
 * about a past trip. Sign-in becomes impossible.
 */
export async function deleteAccount(userId: string): Promise<DeleteResult> {
  return (await db()).tx(async (t) => {
    const [busy] = await t.query(
      `select 1 from bookings where (guest_id = $1 or host_id = $1) and status in ('requested', 'confirmed') and end_date >= current_date limit 1`,
      [userId],
    )
    if (busy) return 'has-trips'
    // What the other side keeps is a coherent history, not this person's words or address.
    await t.query(`update messages set body = '' where sender_id = $1`, [userId])
    await t.query(`update bookings set request = jsonb_set(request, '{deliveryAddress}', '""') where guest_id = $1`, [userId])
    await t.query(`delete from listings where host_id = $1`, [userId])
    await t.query(`delete from photos where owner_id = $1`, [userId])
    for (const table of ['favorites', 'sessions', 'password_resets', 'email_verifications', 'notifications', 'thread_reads']) {
      await t.query(`delete from ${table} where user_id = $1`, [userId])
    }
    await t.query(
      `update users set email = 'deleted-' || id || '@deleted.invalid', name = 'Former member', bio = '', avatar_photo_id = null,
         password_hash = '!', referral_code = null, email_verified_at = null, deleted_at = now() where id = $1`,
      [userId],
    )
    return 'ok'
  })
}

export async function markEmailVerified(userId: string, q?: Db): Promise<void> {
  await (q ?? (await db())).query(`update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1`, [userId])
}

export async function userByEmail(email: string): Promise<User | null> {
  const [row] = await (await db()).query<UserRow>(`select * from users where email = $1 and deleted_at is null`, [normaliseEmail(email)])
  return row ? toUser(row) : null
}
