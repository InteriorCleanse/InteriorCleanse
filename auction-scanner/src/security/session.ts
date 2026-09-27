/**
 * Sessions — the signed cookie that says "this browser is signed in".
 *
 * A token is two base64url parts joined by a dot: the session as JSON, and an
 * HMAC-SHA256 of that JSON under the server's secret. Nobody can mint or edit
 * a token without the secret, and the check is constant-time, so a forged
 * token is refused without leaking anything about why. Every token carries an
 * expiry and a CSRF token; state-changing requests must send the CSRF token in
 * the `x-gavel-csrf` header, which a page on another site cannot read.
 *
 * Revoking (sign-out) is an in-memory set of token signatures, pruned as they
 * expire. Set GAVEL_SESSION_SECRET so tokens survive a restart; without it a
 * random secret is used and everyone signs in again after a restart.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../env.ts'

export type Role = 'owner' | 'member'
export type Session = { email: string; role: Role; csrf: string; exp: number }

export const COOKIE = 'gavel_session'

/** The least a secret may be. Shorter than this and HMAC is only as strong as the guessable secret. */
const MIN_SECRET_BYTES = 16

const B64URL = /^[A-Za-z0-9_-]+$/

function b64url(buf: Buffer | string): string {
  return (typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf).toString('base64url')
}

function isRole(v: unknown): v is Role {
  return v === 'owner' || v === 'member'
}

export class Sessions {
  private readonly secret: Buffer
  private readonly ttlMs: number
  private readonly now: () => number
  /** signature → expiry, so the set can forget tokens that could no longer be used anyway. */
  private readonly revoked: Map<string, number> = new Map()

  constructor(secret: Buffer, ttlMs = 12 * 3600_000, now: () => number = Date.now) {
    if (!Buffer.isBuffer(secret) || secret.length < MIN_SECRET_BYTES) {
      throw new Error(`The session secret must be at least ${MIN_SECRET_BYTES} bytes. Set GAVEL_SESSION_SECRET to a long random string.`)
    }
    this.secret = Buffer.from(secret) // own copy; the caller may zero theirs
    this.ttlMs = Math.max(1_000, ttlMs)
    this.now = now
  }

  private sign(payload: string): Buffer {
    return createHmac('sha256', this.secret).update(payload, 'utf8').digest()
  }

  /** Mint a token for a signed-in person. */
  issue(who: { email: string; role: Role }): { token: string; session: Session } {
    if (typeof who.email !== 'string' || !isRole(who.role)) throw new Error('A session needs an email and a role.')
    const session: Session = {
      email: who.email.trim().toLowerCase(),
      role: who.role,
      csrf: randomBytes(24).toString('base64url'),
      exp: this.now() + this.ttlMs,
    }
    const payload = b64url(JSON.stringify(session))
    const token = `${payload}.${b64url(this.sign(payload))}`
    return { token, session }
  }

  /** Verify a raw token. Null when forged, malformed, expired or revoked. */
  verify(token: string | undefined): Session | null {
    if (typeof token !== 'string' || token.length > 4096) return null
    const dot = token.indexOf('.')
    if (dot <= 0 || dot === token.length - 1) return null
    const payload = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    if (!B64URL.test(payload) || !B64URL.test(sig)) return null
    const given = Buffer.from(sig, 'base64url')
    const expected = this.sign(payload)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    } catch {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    const s = parsed as Record<string, unknown>
    if (typeof s.email !== 'string' || !isRole(s.role) || typeof s.csrf !== 'string' || typeof s.exp !== 'number') return null
    const t = this.now()
    if (!Number.isFinite(s.exp) || s.exp <= t) return null
    this.pruneRevoked(t)
    if (this.revoked.has(sig)) return null
    return { email: s.email, role: s.role, csrf: s.csrf, exp: s.exp }
  }

  /** Read the session out of a request's Cookie header. */
  read(cookieHeader: string | undefined): Session | null {
    const token = parseCookies(cookieHeader)[COOKIE]
    return token ? this.verify(token) : null
  }

  /** Sign out: this token stops working immediately, even before it expires. */
  revoke(token: string): void {
    if (typeof token !== 'string') return
    const dot = token.indexOf('.')
    if (dot <= 0) return
    const sig = token.slice(dot + 1)
    // Keep the entry until the token would have expired anyway; a valid token
    // tells us when, an invalid one is harmless and can be dropped after a TTL.
    let exp = this.now() + this.ttlMs
    const s = this.verify(token)
    if (s) exp = s.exp
    this.revoked.set(sig, exp)
    this.pruneRevoked(this.now())
  }

  private pruneRevoked(t: number): void {
    if (this.revoked.size < 512) return
    for (const [k, exp] of this.revoked) if (exp <= t) this.revoked.delete(k)
  }
}

/** Set-Cookie value for a fresh token. HttpOnly so scripts never see it; Strict so other sites never send it. */
export function cookieHeader(token: string, secure: boolean): string {
  const parts = [`${COOKIE}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** Set-Cookie value that removes the session cookie. */
export function clearCookieHeader(): string {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

/** "a=1; b=2" → { a: '1', b: '2' }. Tolerant of junk; the first value for a name wins. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof header !== 'string' || !header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    if (!name || name in out) continue
    let value = part.slice(eq + 1).trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    try {
      out[name] = decodeURIComponent(value)
    } catch {
      out[name] = value
    }
  }
  return out
}

/**
 * The secret for `new Sessions()`. From GAVEL_SESSION_SECRET when it is set
 * and long enough; otherwise a random one for this process only, and
 * `persistent` is false so the server can say "sessions will not survive a
 * restart" at start-up. The value itself is never returned as text or logged.
 */
export function sessionSecretFromEnv(): { secret: Buffer; persistent: boolean } {
  const raw = env('GAVEL_SESSION_SECRET')
  if (raw.length >= MIN_SECRET_BYTES) return { secret: Buffer.from(raw, 'utf8'), persistent: true }
  return { secret: randomBytes(32), persistent: false }
}
