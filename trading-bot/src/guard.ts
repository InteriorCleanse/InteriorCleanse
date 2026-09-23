/**
 * The request guard — proof that a state-changing request came from
 * the app itself, and a per-client brake on PIN guessing.
 *
 * Why this exists: the server trusts anything from 127.0.0.1. Without a
 * guard, a web page open in the same browser could submit a hidden form
 * to http://127.0.0.1:4173/api/memory/reset and the browser would send
 * it. The page could not read the reply, but the side effect would
 * happen. Today that means a wiped memory; the day an order endpoint
 * exists it would mean an order. So every POST must carry a token that
 * only the app's own page was given, and must not come from another
 * site.
 *
 * Everything here is a pure function of headers, so it is tested
 * without a server.
 */

import { safeEqual } from './security/harden.ts'
export type GuardVerdict = { ok: true } | { ok: false; status: number; reason: string }

type Headers = Record<string, string | string[] | undefined>

function header(h: Headers, name: string): string | undefined {
  const v = h[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Allows a state-changing request only if:
 *   1. it carries the CSRF token the app was issued (`x-mrcash-csrf`), and
 *   2. the browser's own fetch metadata says it is same-origin — or, for
 *      browsers that do not send it, the Origin/Referer header matches
 *      this server's host.
 *
 * Non-browser callers (tests, scripts) satisfy 2 automatically because
 * they send no Origin and no Sec-Fetch-Site.
 */
export function checkStateChange(headers: Headers, expectedToken: string, hostHeader: string | undefined): GuardVerdict {
  const token = header(headers, 'x-mrcash-csrf')
  if (!token || !safeEqual(token, expectedToken)) {
    return { ok: false, status: 403, reason: 'This action needs the app\'s own token. Reload Mr. Cash and try again.' }
  }
  const site = header(headers, 'sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    return { ok: false, status: 403, reason: `Refused: the request came from another site (${site}).` }
  }
  const origin = header(headers, 'origin') ?? header(headers, 'referer')
  if (origin && hostHeader) {
    let originHost = ''
    try {
      originHost = new URL(origin).host
    } catch {
      return { ok: false, status: 403, reason: 'Refused: the request\'s origin could not be read.' }
    }
    if (originHost !== hostHeader) {
      return { ok: false, status: 403, reason: `Refused: the request came from ${originHost}, not from this app.` }
    }
  }
  return { ok: true }
}

/**
 * A per-client brake on PIN guessing. Each client address gets its own
 * counter, so one guesser cannot lock everyone else out.
 */
export class PinThrottle {
  private readonly clients = new Map<string, { failures: number; lockedUntil: number }>()
  private readonly maxFailures: number
  private readonly lockMs: number
  private readonly now: () => number

  constructor(maxFailures = 10, lockMs = 15 * 60_000, now: () => number = Date.now) {
    this.maxFailures = maxFailures
    this.lockMs = lockMs
    this.now = now
  }

  /** Can this client try right now? */
  allowed(client: string): { ok: true } | { ok: false; retryInMs: number } {
    const c = this.clients.get(client)
    if (!c) return { ok: true }
    if (c.lockedUntil > this.now()) return { ok: false, retryInMs: c.lockedUntil - this.now() }
    return { ok: true }
  }

  /** Record a wrong PIN. Locks the client once it has failed enough. */
  failed(client: string): void {
    const c = this.clients.get(client) ?? { failures: 0, lockedUntil: 0 }
    c.failures++
    if (c.failures >= this.maxFailures) {
      c.lockedUntil = this.now() + this.lockMs
      c.failures = 0
    }
    this.clients.set(client, c)
    if (this.clients.size > 10_000) this.clients.clear()
  }

  /** A correct PIN clears the client's record. */
  succeeded(client: string): void {
    this.clients.delete(client)
  }
}
