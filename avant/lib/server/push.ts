/**
 * Push notifications on the iOS app, through Apple's push service (APNs)
 * over HTTP/2 with a token-based provider key. Configured with:
 *
 *   APNS_KEY_P8   the .p8 key from developer.apple.com (PEM text)
 *   APNS_KEY_ID   its key id
 *   APNS_TEAM_ID  the Apple developer team id
 *   APNS_TOPIC    the app's bundle id
 *   APNS_SANDBOX  1 for development builds (Xcode), unset for TestFlight and the App Store
 *
 * Without them nothing is sent and the app works the same, in-app and by
 * email. Like the email outbox, each notification is claimed (pushed_at)
 * before it is sent, so it's pushed at most once. Only the title is pushed,
 * so nothing private shows on a lock screen.
 */

import { createPrivateKey, sign } from 'node:crypto'
import { connect, type ClientHttp2Session } from 'node:http2'
import { db } from './db.ts'
import { wantsSql } from './prefs.ts'

export const pushConfigured = (): boolean =>
  Boolean(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_TOPIC)

/** APNs device tokens are hex; Apple says to allow for them growing. */
export const isDeviceToken = (t: string): boolean => /^[0-9a-f]{64,200}$/i.test(t)

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

/** The ES256 provider token APNs expects: valid for an hour, so it's reused for 50 minutes. */
export function providerToken(keyPem: string, keyId: string, teamId: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }))
  const claims = b64url(JSON.stringify({ iss: teamId, iat: nowSec }))
  const signature = sign('sha256', Buffer.from(`${head}.${claims}`), { key: createPrivateKey(keyPem), dsaEncoding: 'ieee-p1363' })
  return `${head}.${claims}.${b64url(signature)}`
}

let cached: { token: string; at: number } | null = null
function bearer(): string {
  const now = Math.floor(Date.now() / 1000)
  if (!cached || now - cached.at > 50 * 60) {
    cached = { token: providerToken(process.env.APNS_KEY_P8!.replace(/\\n/g, '\n'), process.env.APNS_KEY_ID!, process.env.APNS_TEAM_ID!, now), at: now }
  }
  return cached.token
}

/**
 * Registers this device for the signed-in session (sessionHash is the
 * SHA-256 the sessions table keys on). A device that changes hands moves to
 * the new account.
 */
export async function registerDevice(userId: string, sessionHash: string, token: string): Promise<void> {
  await (await db()).tx(async (t) => {
    // One device per session; a session that re-registers replaces its token.
    await t.query(`delete from push_devices where session_hash = $1 and token <> $2`, [sessionHash, token])
    await t.query(
      `insert into push_devices (token, user_id, session_hash, platform) values ($1, $2, $3, 'ios')
       on conflict (token) do update set user_id = excluded.user_id, session_hash = excluded.session_hash, last_seen_at = now()`,
      [token, userId, sessionHash],
    )
    // At most MAX_DEVICES per person: the oldest goes.
    await t.query(
      `delete from push_devices where user_id = $1 and token not in (select token from push_devices where user_id = $1 order by last_seen_at desc limit ${MAX_DEVICES})`,
      [userId],
    )
  })
}

export const MAX_DEVICES = 5

/** Devices whose sign-in session is still live (not expired, not idle). */
const LIVE_DEVICES = `select p.token from push_devices p join sessions s on s.token_hash = p.session_hash
  where p.user_id = $1 and s.expires_at > now() and s.last_seen_at > now() - interval '14 days'`

export async function removeDevice(userId: string, token: string): Promise<void> {
  await (await db()).query(`delete from push_devices where token = $1 and user_id = $2`, [token, userId])
}

function send(session: ClientHttp2Session, device: string, payload: object, collapseId: string): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${device}`,
      authorization: `bearer ${bearer()}`,
      'apns-topic': process.env.APNS_TOPIC!,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-collapse-id': collapseId.slice(0, 64),
      'content-type': 'application/json',
    })
    let status = 0
    let body = ''
    req.setTimeout(10_000, () => req.close())
    req.on('response', (h) => (status = Number(h[':status'])))
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let reason: string | undefined
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined
      } catch {
        reason = undefined
      }
      resolve({ status, reason })
    })
    req.on('error', () => resolve({ status: 0 }))
    req.end(JSON.stringify(payload))
  })
}

/**
 * Pushes notifications not yet pushed (from the last day) to every live
 * device of their person, per their preferences, until the deadline. The
 * lock screen shows the title only ("Trip cancelled", "New message"): the
 * details, which can say when a car is away or what a payout was, stay in
 * the app.
 */
export async function deliverPushNotifications({ limit = 50, deadline = Date.now() + 10_000 } = {}): Promise<number> {
  if (!pushConfigured()) return 0
  const d = await db()
  const rows = await d.query<{ id: string; user_id: string; title: string; href: string }>(
    `select n.id, n.user_id, n.title, n.href from notifications n join users u on u.id = n.user_id
     where n.pushed_at is null and n.created_at > now() - interval '1 day' and ${wantsSql('push')}
       and exists (select 1 from push_devices p where p.user_id = n.user_id)
     order by n.created_at limit $1`,
    [limit],
  )
  if (!rows.length) return 0
  const host = process.env.APNS_SANDBOX === '1' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com'
  const session = connect(host)
  session.on('error', () => console.error('push: connection failed'))
  let sent = 0
  try {
    for (const n of rows) {
      if (Date.now() > deadline) break
      const claimed = await d.query(`update notifications set pushed_at = now() where id = $1 and pushed_at is null returning id`, [n.id])
      if (!claimed.length) continue
      const devices = await d.query<{ token: string }>(LIVE_DEVICES, [n.user_id])
      const [{ unread }] = await d.query<{ unread: string }>(`select count(*) as unread from notifications where user_id = $1 and read_at is null`, [n.user_id])
      const payload = { aps: { alert: { title: n.title, body: 'Open AVANT for the details.' }, sound: 'default', badge: Number(unread) }, href: n.href }
      for (const { token } of devices) {
        const r = await send(session, token, payload, n.id)
        if (r.status === 200) sent += 1
        // The app was removed or the token replaced: forget it.
        else if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') await d.query(`delete from push_devices where token = $1`, [token])
        else console.error(`push: APNs ${r.status} ${r.reason ?? ''}`.trim())
      }
    }
  } finally {
    session.close()
  }
  return sent
}
