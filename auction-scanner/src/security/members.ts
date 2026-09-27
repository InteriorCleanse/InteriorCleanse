/**
 * Members — who may come in, and how they prove it.
 *
 * Two doors. The owner signs in with a PIN. A member signs in with an email
 * and an access code. A code is accepted when it is one of the codes in
 * GAVEL_MEMBER_CODES (any email), or when it belongs to a stored, active
 * member with that email. Codes are stored only as SHA-256 hashes; the store
 * keeps the last four characters so the owner can tell codes apart on the
 * admin page. A failed sign-in never says whether the email or the code was
 * wrong, and every attempt goes through the login throttle.
 *
 * Members arrive two ways: the owner creates one on the admin page, or Stripe
 * tells us someone paid (checkout.session.completed) and later whether the
 * subscription is still good. The webhook signature is verified before any
 * event is trusted, and each event id is handled once.
 *
 * Nothing in this file logs, prints or returns a secret except the freshly
 * generated code from createMember, which the caller shows or sends once.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readJson, writeJson } from '../store.ts'
import { safeEqual, sha256Hex } from './harden.ts'
import { Throttle } from './throttle.ts'

export type Member = {
  email: string
  /** SHA-256 hex of the canonical code. The code itself is never stored. */
  codeHash: string
  codeLast4: string
  active: boolean
  source: 'manual' | 'stripe'
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  createdAt: number
  updatedAt: number
}

export type PublicMember = Omit<Member, 'codeHash'>
export type StripeIds = { stripeCustomerId?: string; stripeSubscriptionId?: string }

/** What a sign-in attempt comes back with. `email` is the normalised email on a member sign-in. */
export type GateResult = { ok: true; email?: string } | { ok: false; status: number; reason: string }

const FILE = 'members.json'

/** No I, O, 0 or 1, so a code read over the phone or from a photo is never ambiguous. 32 symbols = 5 bits each. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_PREFIX = 'GVL'
const CODE_LENGTH = 12

/** A new access code: GVL-XXXX-XXXX-XXXX, twelve random symbols (60 bits). */
export function newAccessCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let body = ''
  for (let i = 0; i < CODE_LENGTH; i++) body += CODE_ALPHABET[bytes[i] & 31]
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`
}

/**
 * The one spelling of a code that gets hashed. Upper-case, spaces and dashes
 * removed, then regrouped when it is one of ours; anything else is returned
 * trimmed so owner-chosen env codes compare exactly.
 */
export function canonicalCode(code: string): string {
  const flat = code.toUpperCase().replace(/[\s-]/g, '')
  if (flat.startsWith(CODE_PREFIX) && flat.length === CODE_PREFIX.length + CODE_LENGTH) {
    const body = flat.slice(CODE_PREFIX.length)
    return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`
  }
  return code.trim()
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

function looksLikeEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function readMembers(): Member[] {
  const v = readJson<unknown>(FILE, [])
  if (!Array.isArray(v)) return []
  return v.filter((m): m is Member => !!m && typeof m === 'object' && typeof (m as Member).email === 'string' && typeof (m as Member).codeHash === 'string')
}

function writeMembers(members: Member[]): void {
  writeJson(FILE, members)
}

function publicView(m: Member): PublicMember {
  const { codeHash: _hidden, ...rest } = m
  return rest
}

const REFUSED = 'That email and code did not match. Check both and try again.'
const NOT_SET_UP = 'Owner sign-in is not set up. Set GAVEL_PIN or read the PIN printed when the app started.'

export class MemberGate {
  private readonly pin: string
  private readonly envCodes: string[]
  private readonly throttle: Throttle
  private readonly now: () => number

  constructor(opts: { pin: string; envCodes: string[]; throttle?: Throttle; now?: () => number }) {
    this.pin = typeof opts.pin === 'string' ? opts.pin.trim() : ''
    this.envCodes = (opts.envCodes ?? []).map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
    this.throttle = opts.throttle ?? new Throttle()
    this.now = opts.now ?? Date.now
  }

  private locked(client: string): GateResult | null {
    const a = this.throttle.allowed(client)
    if (a.ok) return null
    const mins = Math.max(1, Math.ceil(a.retryInMs / 60_000))
    return { ok: false, status: 429, reason: `Too many tries. Wait ${mins} minute${mins === 1 ? '' : 's'} and try again.` }
  }

  /** The owner's door. */
  loginOwner(client: string, pin: unknown): GateResult {
    const lock = this.locked(client)
    if (lock) return lock
    if (!this.pin) {
      this.throttle.failed(client)
      return { ok: false, status: 401, reason: NOT_SET_UP }
    }
    const given = typeof pin === 'string' ? pin.trim() : pin
    if (typeof given === 'string' && given.length > 0 && given.length <= 128 && safeEqual(given, this.pin)) {
      this.throttle.succeeded(client)
      return { ok: true }
    }
    this.throttle.failed(client)
    return { ok: false, status: 401, reason: 'That PIN did not match.' }
  }

  /** The members' door. The reason never says which half was wrong. */
  loginMember(client: string, email: unknown, code: unknown): GateResult {
    const lock = this.locked(client)
    if (lock) return lock
    const e = typeof email === 'string' ? normaliseEmail(email) : ''
    const c = typeof code === 'string' && code.length <= 256 ? canonicalCode(code) : ''
    if (!e || !c || !looksLikeEmail(e)) {
      this.throttle.failed(client)
      return { ok: false, status: 401, reason: REFUSED }
    }

    // Always run both checks so timing does not reveal whether the email is known.
    let envHit = false
    for (const known of this.envCodes) {
      if (safeEqual(c, known) || safeEqual(c, canonicalCode(known))) envHit = true
    }
    const wanted = sha256Hex(c)
    let memberHit = false
    for (const m of readMembers()) {
      const matches = safeEqual(wanted, m.codeHash)
      if (matches && m.active && m.email === e) memberHit = true
    }

    if (envHit || memberHit) {
      this.throttle.succeeded(client)
      return { ok: true, email: e }
    }
    this.throttle.failed(client)
    return { ok: false, status: 401, reason: REFUSED }
  }

  /** Every member, without the code hash. Newest first. */
  listMembers(): PublicMember[] {
    return readMembers()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(publicView)
  }

  /** One member by email, without the code hash. */
  getMember(email: string): PublicMember | undefined {
    const e = normaliseEmail(email)
    const m = readMembers().find((x) => x.email === e)
    return m ? publicView(m) : undefined
  }

  /** The member a Stripe event is about, by subscription id first, then customer id. */
  findByStripe(ids: StripeIds): PublicMember | undefined {
    const all = readMembers()
    const bySub = ids.stripeSubscriptionId ? all.find((m) => m.stripeSubscriptionId === ids.stripeSubscriptionId) : undefined
    const m = bySub ?? (ids.stripeCustomerId ? all.find((m) => m.stripeCustomerId === ids.stripeCustomerId) : undefined)
    return m ? publicView(m) : undefined
  }

  /**
   * Create a member, or give an existing one a new code. The returned `code`
   * is the only time it exists in plain text: show it once, then it is gone.
   */
  createMember(email: string, source: 'manual' | 'stripe' = 'manual', stripeIds?: StripeIds): { member: PublicMember; code: string } {
    const e = normaliseEmail(typeof email === 'string' ? email : '')
    if (!looksLikeEmail(e)) throw new Error('That does not look like an email address. Use the form name@example.com.')
    const code = newAccessCode()
    const t = this.now()
    const members = readMembers()
    const existing = members.find((m) => m.email === e)
    const next: Member = {
      email: e,
      codeHash: sha256Hex(code),
      codeLast4: code.slice(-4),
      active: true,
      source: existing?.source === 'stripe' && source === 'manual' ? 'stripe' : source,
      stripeCustomerId: stripeIds?.stripeCustomerId ?? existing?.stripeCustomerId,
      stripeSubscriptionId: stripeIds?.stripeSubscriptionId ?? existing?.stripeSubscriptionId,
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
    }
    if (next.stripeCustomerId === undefined) delete next.stripeCustomerId
    if (next.stripeSubscriptionId === undefined) delete next.stripeSubscriptionId
    const out = existing ? members.map((m) => (m.email === e ? next : m)) : [...members, next]
    writeMembers(out)
    return { member: publicView(next), code }
  }

  /** Delete a member outright. False when there was no such member. */
  removeMember(email: string): boolean {
    const e = normaliseEmail(email)
    const members = readMembers()
    const kept = members.filter((m) => m.email !== e)
    if (kept.length === members.length) return false
    writeMembers(kept)
    return true
  }

  /** Keep the member but stop their code working. False when there was no such member. */
  deactivate(email: string): boolean {
    return this.setActive(email, false)
  }

  /** Let a deactivated member back in with their existing code. */
  activate(email: string): boolean {
    return this.setActive(email, true)
  }

  private setActive(email: string, active: boolean): boolean {
    const e = normaliseEmail(email)
    const members = readMembers()
    const m = members.find((x) => x.email === e)
    if (!m) return false
    if (m.active !== active) {
      m.active = active
      m.updatedAt = this.now()
      writeMembers(members)
    }
    return true
  }
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

/**
 * Check a Stripe-Signature header: "t=<unix seconds>,v1=<hex>(,v1=<hex>)".
 * The signature is HMAC-SHA256 over `${t}.${rawBody}` under the endpoint's
 * signing secret. Events older (or newer) than `toleranceSec` are refused so a
 * captured request cannot be replayed later. `now` is in milliseconds.
 */
export function verifyStripeSignature(rawBody: string, sigHeader: string | undefined, secret: string, now: number = Date.now(), toleranceSec = 300): boolean {
  if (typeof rawBody !== 'string' || typeof sigHeader !== 'string' || typeof secret !== 'string' || !secret) return false
  let t = ''
  const v1: string[] = []
  for (const part of sigHeader.split(',')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const k = part.slice(0, eq).trim()
    const v = part.slice(eq + 1).trim()
    if (k === 't' && !t) t = v
    else if (k === 'v1' && /^[0-9a-f]{64}$/i.test(v)) v1.push(v.toLowerCase())
  }
  if (!/^\d{1,12}$/.test(t) || v1.length === 0) return false
  const ts = Number(t)
  const nowSec = Math.floor(now / 1000)
  if (Math.abs(nowSec - ts) > toleranceSec) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest()
  let ok = false
  for (const sig of v1) {
    const given = Buffer.from(sig, 'hex')
    if (given.length === expected.length && timingSafeEqual(given, expected)) ok = true
  }
  return ok
}

export type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } }
export type StripeOutcome = { handled: boolean; action: string; email?: string; code?: string }

/** Stripe sends related objects either as an id string or as an expanded object with an id. */
function idOf(v: unknown): string | undefined {
  if (typeof v === 'string' && v) return v
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id
  return undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

const HANDLED_TYPES = new Set(['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted'])
/** Subscription statuses that mean "paying, let them in" and "not paying, close the door". */
const ACTIVE_STATUSES = new Set(['active', 'trialing'])
const INACTIVE_STATUSES = new Set(['past_due', 'unpaid', 'canceled', 'incomplete_expired', 'paused'])
const MAX_SEEN = 5_000

/**
 * Apply one verified Stripe event to the member store. `seen` holds event ids
 * already applied, so a redelivered event changes nothing. The code returned
 * on checkout is for the server to log once for the owner to send; it is not
 * stored anywhere in plain text.
 */
export function handleStripeEvent(gate: MemberGate, evt: StripeEvent, seen: Set<string>): StripeOutcome {
  if (!evt || typeof evt !== 'object' || typeof evt.type !== 'string') return { handled: false, action: 'malformed' }
  if (!HANDLED_TYPES.has(evt.type)) return { handled: false, action: 'ignored' }
  const id = str(evt.id)
  if (!id) return { handled: false, action: 'malformed' }
  if (seen.has(id)) return { handled: false, action: 'duplicate' }
  const obj = evt.data && typeof evt.data === 'object' && evt.data.object && typeof evt.data.object === 'object' ? evt.data.object : {}

  const remember = (): void => {
    seen.add(id)
    while (seen.size > MAX_SEEN) {
      const first = seen.values().next()
      if (first.done) break
      seen.delete(first.value)
    }
  }

  if (evt.type === 'checkout.session.completed') {
    const details = obj.customer_details && typeof obj.customer_details === 'object' ? (obj.customer_details as Record<string, unknown>) : {}
    const email = str(details.email) ?? str(obj.customer_email)
    remember()
    if (!email || !looksLikeEmail(normaliseEmail(email))) return { handled: true, action: 'no-email' }
    const ids: StripeIds = { stripeCustomerId: idOf(obj.customer), stripeSubscriptionId: idOf(obj.subscription) }
    const { member, code } = gate.createMember(email, 'stripe', ids)
    return { handled: true, action: 'member-created', email: member.email, code }
  }

  const ids: StripeIds = { stripeSubscriptionId: idOf(obj.id), stripeCustomerId: idOf(obj.customer) }
  const member = gate.findByStripe(ids)
  remember()
  if (!member) return { handled: true, action: 'no-member-found' }

  if (evt.type === 'customer.subscription.deleted') {
    gate.deactivate(member.email)
    return { handled: true, action: 'member-deactivated', email: member.email }
  }

  const status = str(obj.status) ?? ''
  if (ACTIVE_STATUSES.has(status)) {
    gate.activate(member.email)
    return { handled: true, action: 'member-activated', email: member.email }
  }
  if (INACTIVE_STATUSES.has(status)) {
    gate.deactivate(member.email)
    return { handled: true, action: 'member-deactivated', email: member.email }
  }
  return { handled: true, action: 'no-change', email: member.email }
}
