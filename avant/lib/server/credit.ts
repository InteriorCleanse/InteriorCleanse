/**
 * AVANT credit: a ledger, never a stored balance, so the balance is always
 * the sum of what happened. Spending takes a per-user lock inside the
 * booking's transaction, so two checkouts at once can never spend the same
 * credit twice.
 */

import { randomId } from '../security/crypto.ts'
import { db, type Db } from './db.ts'

export type CreditReason = 'promise_host_cancel' | 'promise_request_expired' | 'referral_welcome' | 'referral_reward' | 'used' | 'returned' | 'goodwill'

export interface CreditEntry {
  amountCents: number
  reason: CreditReason
  bookingId: string | null
  at: string
}

export async function creditBalance(userId: string, q?: Db): Promise<number> {
  const [r] = await (q ?? (await db())).query<{ n: string | null }>(`select coalesce(sum(amount_cents), 0) as n from credits where user_id = $1`, [userId])
  return Number(r?.n ?? 0)
}

export async function creditHistory(userId: string): Promise<CreditEntry[]> {
  const rows = await (await db()).query<{ amount_cents: number; reason: CreditReason; booking_id: string | null; created_at: string | Date }>(
    `select amount_cents, reason, booking_id, created_at from credits where user_id = $1 order by created_at desc limit 100`,
    [userId],
  )
  return rows.map((r) => ({ amountCents: r.amount_cents, reason: r.reason, bookingId: r.booking_id, at: new Date(r.created_at).toISOString() }))
}

/** Adds credit. With a booking id, at most once per reason per trip; returns whether it was added. */
export async function grantCredit(q: Db, userId: string, cents: number, reason: CreditReason, bookingId: string | null): Promise<boolean> {
  if (cents <= 0) return false
  const rows = await q.query(
    `insert into credits (id, user_id, amount_cents, reason, booking_id) values ($1, $2, $3, $4, $5)
     on conflict (user_id, reason, booking_id) where booking_id is not null do nothing returning id`,
    [randomId(12), userId, cents, reason, bookingId],
  )
  return rows.length > 0
}

/** Spends up to `wanted` of the user's credit on a booking, inside the caller's transaction. Returns what was spent. */
export async function spendCredit(t: Db, userId: string, wanted: number, bookingId: string): Promise<number> {
  if (wanted <= 0) return 0
  await t.query(`select pg_advisory_xact_lock(hashtext($1))`, [`credit:${userId}`])
  const spend = Math.min(wanted, await creditBalance(userId, t))
  if (spend <= 0) return 0
  await t.query(`insert into credits (id, user_id, amount_cents, reason, booking_id) values ($1, $2, $3, 'used', $4)`, [randomId(12), userId, -spend, bookingId])
  return spend
}
