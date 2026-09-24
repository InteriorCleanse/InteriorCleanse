/**
 * THE VAULT — a second lock in front of your real balances.
 *
 * The app's PIN keeps strangers off the desk. The vault is a separate,
 * stronger lock on the one screen that shows money you actually hold: it opens
 * only with BOTH a passcode and a six-digit code from an authenticator app
 * (TOTP, RFC 6238 — Google Authenticator, 1Password, Authy and the rest), and it
 * locks itself again after a short while. It applies to the computer running
 * Mr. Cash too; being on localhost does not skip it.
 *
 * SECURITY
 * - Both secrets live only in the environment (MRCASH_VAULT_PASSCODE and
 *   MRCASH_VAULT_TOTP, set once with `npm run vault:setup`). Neither is ever
 *   written to the repo, the record, a log or any response.
 * - Passcode and code are compared in constant time, and a wrong attempt never
 *   says which of the two was wrong.
 * - Five wrong attempts lock that device out for fifteen minutes.
 * - A code is accepted once: replaying a code that already opened the vault
 *   fails, even inside its thirty seconds.
 * - An open vault is a random session token in an HttpOnly, SameSite=Strict
 *   cookie scoped to /api. It closes after 15 minutes idle or 60 minutes
 *   in total, and on "Lock".
 *
 * The vault only READS. Opening it cannot place, change or cancel an order.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { safeEqual } from './harden.ts'
import { PinThrottle } from '../guard.ts'

const STEP_SEC = 30
const DIGITS = 6
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = ''
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = B32.indexOf(ch)
    if (i < 0) throw new Error('not a base32 secret')
    value = (value << 5) | i; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

/** The six-digit code for one 30-second step (RFC 6238 over RFC 4226, HMAC-SHA1). */
export function totpAt(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', secret).update(msg).digest()
  const off = h[h.length - 1] & 0x0f
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0')
}

export const counterAt = (nowMs: number): number => Math.floor(nowMs / 1000 / STEP_SEC)

/**
 * Checks a code against the current step and one step either side (phone
 * clocks drift). Returns the step that matched so it can be refused next time.
 * Every candidate is compared, in constant time, whatever matched first.
 */
export function verifyTotp(secret: Buffer, code: string, nowMs: number, lastUsedCounter = -1): { ok: boolean; counter: number } {
  const c = counterAt(nowMs)
  const given = String(code ?? '').replace(/\s/g, '')
  let matched = -1
  for (const k of [c - 1, c, c + 1]) {
    if (safeEqual(given, totpAt(secret, k)) && k > lastUsedCounter && matched < 0) matched = k
  }
  return { ok: matched >= 0 && /^\d{6}$/.test(given), counter: matched }
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20))
}

/** The link an authenticator app understands; most apps also take the secret typed in. */
export function otpauthUri(secret: string, account = 'vault'): string {
  return `otpauth://totp/${encodeURIComponent('Mr. Cash')}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent('Mr. Cash')}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SEC}`
}

/** Loads .env once if the vault secrets are not already in the environment. */
function loadEnvOnce(): void {
  if (process.env.MRCASH_VAULT_PASSCODE && process.env.MRCASH_VAULT_TOTP) return
  try { process.loadEnvFile(join(import.meta.dirname, '..', '..', '.env')) } catch { /* no .env: fine */ }
}

export type VaultConfig = { passcode: string; secret: Buffer } | null

/** The authenticator secret alone, for the front door (src/security/login.ts), or null. */
export function totpSecretFromEnv(): Buffer | null {
  loadEnvOnce()
  const raw = process.env.MRCASH_VAULT_TOTP || ''
  if (!raw) return null
  try {
    const secret = base32Decode(raw)
    return secret.length >= 10 ? secret : null
  } catch {
    return null
  }
}

export function vaultConfigFromEnv(): VaultConfig {
  loadEnvOnce()
  const passcode = process.env.MRCASH_VAULT_PASSCODE || ''
  const raw = process.env.MRCASH_VAULT_TOTP || ''
  if (passcode.length < 6 || !raw) return null
  try {
    const secret = base32Decode(raw)
    return secret.length >= 10 ? { passcode, secret } : null
  } catch {
    return null
  }
}

export type UnlockResult = { ok: true; token: string; expiresAt: number } | { ok: false; status: number; reason: string; retryInMs?: number }

export class VaultGate {
  private readonly sessions = new Map<string, { idleUntil: number; hardUntil: number }>()
  private readonly throttle: PinThrottle
  private lastCounter = -1
  private readonly now: () => number
  private readonly config: () => VaultConfig
  readonly idleMs = 15 * 60_000
  readonly maxMs = 60 * 60_000

  constructor(opts: { config?: () => VaultConfig; now?: () => number; maxFailures?: number; lockMs?: number } = {}) {
    this.now = opts.now ?? Date.now
    this.config = opts.config ?? vaultConfigFromEnv
    this.throttle = new PinThrottle(opts.maxFailures ?? 5, opts.lockMs ?? 15 * 60_000, this.now)
  }

  configured(): boolean { return this.config() !== null }

  unlock(client: string, passcode: unknown, code: unknown): UnlockResult {
    const cfg = this.config()
    if (!cfg) return { ok: false, status: 409, reason: 'The vault is not set up yet. On the computer running Mr. Cash, run npm run vault:setup.' }
    const allowed = this.throttle.allowed(client)
    if (!allowed.ok) return { ok: false, status: 429, reason: `Too many attempts from this device. The vault stays shut for ${Math.ceil(allowed.retryInMs / 60_000)} more minute(s).`, retryInMs: allowed.retryInMs }
    const passOk = safeEqual(String(passcode ?? ''), cfg.passcode)
    const t = verifyTotp(cfg.secret, String(code ?? ''), this.now(), this.lastCounter)
    if (!passOk || !t.ok) {
      this.throttle.failed(client)
      return { ok: false, status: 401, reason: 'Passcode or code not accepted.' }
    }
    this.throttle.succeeded(client)
    this.lastCounter = t.counter
    const token = randomBytes(32).toString('base64url')
    const now = this.now()
    this.sessions.set(token, { idleUntil: now + this.idleMs, hardUntil: now + this.maxMs })
    if (this.sessions.size > 50) this.sessions.delete(this.sessions.keys().next().value!)
    return { ok: true, token, expiresAt: now + this.idleMs }
  }

  /** Is this token an open vault? A valid check slides the idle timer, never past the hard limit. */
  check(token: string | undefined): { open: boolean; expiresAt: number } {
    if (!token || !this.config()) return { open: false, expiresAt: 0 }
    let found: string | null = null
    for (const k of this.sessions.keys()) if (safeEqual(k, token)) found = k
    if (!found) return { open: false, expiresAt: 0 }
    const s = this.sessions.get(found)!
    const now = this.now()
    if (now > s.idleUntil || now > s.hardUntil) { this.sessions.delete(found); return { open: false, expiresAt: 0 } }
    s.idleUntil = Math.min(s.hardUntil, now + this.idleMs)
    return { open: true, expiresAt: s.idleUntil }
  }

  lock(token: string | undefined): void {
    if (!token) return
    for (const k of [...this.sessions.keys()]) if (safeEqual(k, token)) this.sessions.delete(k)
  }
}

/** The vault cookie from a Cookie header, or undefined. */
export function vaultCookie(cookieHeader: string | undefined): string | undefined {
  const m = /(?:^|;\s*)mrcash_vault=([A-Za-z0-9_-]{20,})/.exec(cookieHeader || '')
  return m ? m[1] : undefined
}

/** The cookie rides on /api only: the vault routes and the balance routes it guards. */
export const VAULT_COOKIE_PATH = '/api'
