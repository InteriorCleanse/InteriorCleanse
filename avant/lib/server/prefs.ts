/**
 * What each person wants to hear about, by email and by push.
 *
 * Trip notices (bookings, payments, cancellations, claims, security) always
 * go: people need them to use the service. Messages and offers (price drops,
 * Circle and referral news, review reminders) can be turned off per channel,
 * from Profile or with the one-click unsubscribe link in every email.
 *
 * Unsubscribe links are signed (HMAC with a key derived from the session
 * secret), so they work without signing in and can't be forged to turn off
 * someone else's email.
 */

import { b64urlDecode, b64urlEncode, sign, timingSafeEqual } from '../security/crypto.ts'
import { sessionKey } from '../security/keys.ts'
import { db, type Db } from './db.ts'

export type Category = 'trips' | 'messages' | 'offers'
export type Channel = 'email' | 'push'
export type OptionalCategory = Exclude<Category, 'trips'>

export interface NotifyPrefs {
  email: Record<OptionalCategory, boolean>
  push: Record<OptionalCategory, boolean>
}

const DEFAULTS: NotifyPrefs = { email: { messages: true, offers: true }, push: { messages: true, offers: true } }

export function normalisePrefs(raw: unknown): NotifyPrefs {
  const r = (raw ?? {}) as Partial<Record<Channel, Partial<Record<OptionalCategory, unknown>>>>
  const pick = (c: Channel, k: OptionalCategory) => (typeof r[c]?.[k] === 'boolean' ? (r[c]![k] as boolean) : DEFAULTS[c][k])
  return {
    email: { messages: pick('email', 'messages'), offers: pick('email', 'offers') },
    push: { messages: pick('push', 'messages'), offers: pick('push', 'offers') },
  }
}

/** Whether a notification of this category goes out on this channel. */
export function wants(prefs: NotifyPrefs, channel: Channel, category: Category): boolean {
  return category === 'trips' || prefs[channel][category]
}

/** The SQL condition, for the delivery queries (u = users, n = notifications). */
export function wantsSql(channel: Channel): string {
  return `(n.category = 'trips' or coalesce((u.notify_prefs->'${channel}'->>n.category)::boolean, true))`
}

export async function prefsFor(userId: string, q?: Db): Promise<NotifyPrefs> {
  const [u] = await (q ?? (await db())).query<{ notify_prefs: unknown }>(`select notify_prefs from users where id = $1`, [userId])
  return normalisePrefs(u?.notify_prefs)
}

export async function setPrefs(userId: string, prefs: NotifyPrefs): Promise<void> {
  await (await db()).query(`update users set notify_prefs = $2 where id = $1`, [userId, JSON.stringify(normalisePrefs(prefs))])
}

const key = () => sessionKey()

/** A signed token for "stop emails of this category" (or all optional ones). */
export async function unsubscribeToken(userId: string, category: OptionalCategory | 'all'): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(`${userId}:${category}`))
  return `${body}.${await sign(`unsubscribe:${userId}:${category}`, key())}`
}

export async function readUnsubscribeToken(token: string): Promise<{ userId: string; category: OptionalCategory | 'all' } | null> {
  const [body, sig] = token.split('.')
  if (!body || !sig || token.length > 300) return null
  let text: string
  try {
    text = new TextDecoder().decode(b64urlDecode(body))
  } catch {
    return null
  }
  const [userId, category] = text.split(':')
  if (!userId || !['messages', 'offers', 'all'].includes(category)) return null
  const expected = new TextEncoder().encode(await sign(`unsubscribe:${userId}:${category}`, key()))
  if (!timingSafeEqual(expected, new TextEncoder().encode(sig))) return null
  return { userId, category: category as OptionalCategory | 'all' }
}

/** Turns email off for a category (or every optional one). */
export async function unsubscribe(userId: string, category: OptionalCategory | 'all'): Promise<void> {
  const prefs = await prefsFor(userId)
  if (category === 'all') prefs.email = { messages: false, offers: false }
  else prefs.email[category] = false
  await setPrefs(userId, prefs)
}
