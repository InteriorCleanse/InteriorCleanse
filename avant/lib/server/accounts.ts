/**
 * Accounts and sign-in sessions.
 *
 * Passwords: scrypt (N=2^15, r=8, p=1) with a per-user salt, compared in
 * constant time. Unknown emails still pay for a hash so response time does
 * not reveal which emails have accounts.
 * Sessions: a random 256-bit token in an httpOnly cookie; the database keeps
 * only its SHA-256, with a 30-day expiry.
 */

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { randomId } from '../security/crypto.ts'
import { db, type Db } from './db.ts'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const SESSION_DAYS = 30

export interface User {
  id: string
  email: string
  name: string
  bio: string
  avatarPhotoId: string | null
  createdAt: string
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
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  bio: r.bio,
  avatarPhotoId: r.avatar_photo_id,
  createdAt: new Date(r.created_at).toISOString(),
})

export const photoUrl = (id: string | null | undefined) => (id ? `/api/photos/${id}` : null)

export function publicProfile(u: Pick<User, 'id' | 'name' | 'bio' | 'avatarPhotoId' | 'createdAt'>): PublicProfile {
  return { id: u.id, name: u.name, firstName: u.name.split(/\s+/)[0], bio: u.bio, photo: photoUrl(u.avatarPhotoId), joined: u.createdAt }
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
let decoy: Promise<string> | null = null

export class EmailTakenError extends Error {}

export async function createUser(input: { name: string; email: string; password: string }): Promise<User> {
  const d = await db()
  const email = normaliseEmail(input.email)
  const hash = await hashPassword(input.password)
  try {
    const [row] = await d.query<UserRow>(
      `insert into users (id, email, name, password_hash) values ($1, $2, $3, $4) returning *`,
      [randomId(12), email, input.name.trim(), hash],
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
    decoy ??= hashPassword(randomId(16))
    await verifyPassword(password, await decoy)
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
    [id, patch.name?.trim() ?? null, patch.bio?.trim() ?? null, patch.avatarPhotoId !== undefined, patch.avatarPhotoId ?? null],
  )
  return row ? toUser(row) : null
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await (await db()).query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)`, [tokenHash(token), userId, expires.toISOString()])
  return { token, expires }
}

export async function userForToken(token: string | undefined): Promise<User | null> {
  if (!token || token.length > 100) return null
  const [row] = await (await db()).query<UserRow>(
    `select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash(token)],
  )
  return row ? toUser(row) : null
}

export async function endSession(token: string | undefined): Promise<void> {
  if (token) await (await db()).query(`delete from sessions where token_hash = $1`, [tokenHash(token)])
}

export async function endAllSessions(userId: string): Promise<void> {
  await (await db()).query(`delete from sessions where user_id = $1`, [userId])
}
