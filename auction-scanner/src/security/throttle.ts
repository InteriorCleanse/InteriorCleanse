/**
 * Login throttle — slows down anyone guessing PINs or access codes.
 *
 * Each client (the server passes the caller's IP address) gets a small number
 * of failed sign-ins. After that many failures in a row the client is locked
 * out for a while, and every attempt during the lockout is refused before a
 * PIN or code is even looked at. A successful sign-in clears the count.
 *
 * Everything lives in memory: a restart forgets the counts, which is fine for
 * a members-only app; the codes themselves are long enough that a guesser
 * needs far more attempts than one process lifetime allows.
 */

type Entry = { failures: number; lockedUntil: number }

/** Keep the map from growing without bound if something floods the login route. */
const MAX_TRACKED_CLIENTS = 10_000

export class Throttle {
  private readonly maxFailures: number
  private readonly lockMs: number
  private readonly now: () => number
  private readonly clients: Map<string, Entry> = new Map()

  constructor(maxFailures = 8, lockMs = 15 * 60_000, now: () => number = Date.now) {
    this.maxFailures = Math.max(1, Math.floor(maxFailures))
    this.lockMs = Math.max(0, lockMs)
    this.now = now
  }

  /** May this client try to sign in right now? When not, how long to wait. */
  allowed(client: string): { ok: true } | { ok: false; retryInMs: number } {
    const e = this.clients.get(client)
    if (!e) return { ok: true }
    const t = this.now()
    if (e.lockedUntil > t) return { ok: false, retryInMs: e.lockedUntil - t }
    if (e.lockedUntil !== 0) this.clients.delete(client) // the lock has passed; start clean
    return { ok: true }
  }

  /** Record a failed sign-in. The maxFailures-th failure in a row locks the client. */
  failed(client: string): void {
    const t = this.now()
    const e = this.clients.get(client) ?? { failures: 0, lockedUntil: 0 }
    if (e.lockedUntil > t) return // already locked; the lock does not grow
    e.failures += 1
    e.lockedUntil = 0
    if (e.failures >= this.maxFailures) {
      e.failures = 0
      e.lockedUntil = t + this.lockMs
    }
    this.clients.set(client, e)
    if (this.clients.size > MAX_TRACKED_CLIENTS) this.prune(t)
  }

  /** Record a successful sign-in: the client starts from zero again. */
  succeeded(client: string): void {
    this.clients.delete(client)
  }

  /** How many failures a client has right now (for the doctor and tests). */
  failuresFor(client: string): number {
    return this.clients.get(client)?.failures ?? 0
  }

  private prune(t: number): void {
    for (const [k, e] of this.clients) {
      if (e.lockedUntil !== 0 && e.lockedUntil <= t) this.clients.delete(k)
    }
    // Still too many: drop the oldest entries. Map iterates in insertion order.
    while (this.clients.size > MAX_TRACKED_CLIENTS) {
      const first = this.clients.keys().next()
      if (first.done) break
      this.clients.delete(first.value)
    }
  }
}
