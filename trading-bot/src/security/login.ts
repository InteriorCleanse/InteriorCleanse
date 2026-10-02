/**
 * THE FRONT DOOR — how a device that is not this computer gets in.
 *
 * With phone access on, any other device on your network meets a login page.
 * It always asks for the PIN. Once the authenticator is set up (`npm run
 * vault:setup`, the same secret the vault uses), it also asks for the
 * six-digit code from your phone: a PIN seen over your shoulder, or guessed,
 * is then not enough on its own. Set MRCASH_LOGIN_2FA=0 to go back to the PIN
 * alone (not recommended).
 *
 * The computer running Kestrel is recognised from the socket, not from a
 * header, and does not meet this page (unless a proxy or tunnel forwarded the
 * request: then it is another device); the vault still asks it for both.
 *
 * SECURITY
 * - PIN and code are compared in constant time, and a failed attempt never
 *   says which half was wrong.
 * - Ten failures lock that device out for fifteen minutes; others are unaffected.
 * - Fifty failures from all devices together in fifteen minutes close the door
 *   to everyone until the window clears, so rotating addresses (IPv6 hands out
 *   millions) does not buy more guesses. This computer never needs the door.
 * - A code is accepted once at this door: a replay inside its thirty seconds fails.
 * - Nothing here logs, and no secret is ever echoed into a response.
 */
import { safeEqual } from './harden.ts'
import { verifyTotp, totpSecretFromEnv } from './vault.ts'
import { PinThrottle } from '../guard.ts'

export type LoginResult = { ok: true } | { ok: false; status: number; reason: string }

/** The authenticator secret, unless the owner has switched the second factor off. */
export function loginSecretFromEnv(): Buffer | null {
  if (process.env.MRCASH_LOGIN_2FA === '0') return null
  return totpSecretFromEnv()
}

export class LoginGate {
  private readonly pin: string
  private readonly secret: () => Buffer | null
  private readonly now: () => number
  private readonly throttle: PinThrottle
  private readonly globalMax: number
  private readonly lockMs: number
  private recentFailures: number[] = []
  private lastCounter = -1

  constructor(opts: { pin: string; secret?: () => Buffer | null; now?: () => number; maxFailures?: number; lockMs?: number; globalMaxFailures?: number }) {
    this.pin = opts.pin
    this.secret = opts.secret ?? loginSecretFromEnv
    this.now = opts.now ?? Date.now
    this.lockMs = opts.lockMs ?? 15 * 60_000
    this.globalMax = opts.globalMaxFailures ?? 50
    this.throttle = new PinThrottle(opts.maxFailures ?? 10, this.lockMs, this.now)
  }

  /** Does the login page ask for an authenticator code as well as the PIN? */
  needsCode(): boolean { return this.secret() !== null }

  attempt(client: string, pin: unknown, code: unknown): LoginResult {
    const allowed = this.throttle.allowed(client)
    if (!allowed.ok) return { ok: false, status: 429, reason: `Too many tries from this device. Wait ${Math.ceil(allowed.retryInMs / 60_000)} minute(s).` }
    const since = this.now() - this.lockMs
    this.recentFailures = this.recentFailures.filter((t) => t > since)
    if (this.recentFailures.length >= this.globalMax) {
      return { ok: false, status: 429, reason: `Too many wrong tries from all devices. Wait ${Math.ceil((this.recentFailures[0] - since) / 60_000)} minute(s), or use the computer running Kestrel.` }
    }
    const secret = this.secret()
    const pinOk = safeEqual(String(pin ?? '').trim(), this.pin)
    const t = secret ? verifyTotp(secret, String(code ?? ''), this.now(), this.lastCounter) : { ok: true, counter: this.lastCounter }
    if (!pinOk || !t.ok) {
      this.throttle.failed(client)
      this.recentFailures.push(this.now())
      return { ok: false, status: 401, reason: secret ? 'PIN or code not accepted.' : 'Wrong PIN.' }
    }
    this.throttle.succeeded(client)
    if (secret) this.lastCounter = t.counter
    return { ok: true }
  }
}
