/**
 * Anonymous, signed session. No account, no email: a random id in an
 * httpOnly, Secure, SameSite=Lax cookie, signed with HMAC so it cannot be
 * forged. Verification records are keyed by a hash of this id, never the id.
 */

import { cookies } from 'next/headers'
import { hex, hmac, randomId, sign, verify } from './crypto'
import { sessionKey } from './keys'

export const SESSION_COOKIE = '__Host-avant_sid'
export const DEV_SESSION_COOKIE = 'avant_sid'
const MAX_AGE = 60 * 60 * 24 * 180

export function cookieName(): string {
  return process.env.NODE_ENV === 'production' ? SESSION_COOKIE : DEV_SESSION_COOKIE
}

export async function mintSessionValue(): Promise<string> {
  const id = randomId(24)
  return `${id}.${await sign(`sid:${id}`, sessionKey())}`
}

export async function readSessionId(value: string | undefined): Promise<string | null> {
  if (!value) return null
  const [id, sig] = value.split('.')
  if (!id || !sig) return null
  return (await verify(`sid:${id}`, sig, sessionKey())) ? id : null
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE,
}

/** The caller's session id, creating one if absent (route handlers only). */
export async function requireSession(): Promise<string> {
  const jar = await cookies()
  const existing = await readSessionId(jar.get(cookieName())?.value)
  if (existing) return existing
  const value = await mintSessionValue()
  jar.set(cookieName(), value, sessionCookieOptions)
  return value.split('.')[0]
}

/** Record key: HMAC of the session id, so storage never holds the id itself. */
export async function recordKey(sessionId: string): Promise<string> {
  return hex(await hmac(`record:${sessionId}`, sessionKey())).slice(0, 48)
}
