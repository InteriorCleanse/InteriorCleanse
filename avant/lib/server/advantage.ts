/**
 * The AVANT Advantage on the server: Circle tier from completed trips,
 * referral codes and rewards, and the gentle nudge to review after a trip.
 * Amounts and thresholds live in lib/circle.ts.
 */

import { randomBytes } from 'node:crypto'
import { CIRCLE_TIERS, MAX_REFERRAL_REWARDS_PER_YEAR, nextTier, REFERRAL, referralCode, tierFor, type Tier } from '../circle.ts'
import { notify } from './bookings.ts'
import { creditBalance, grantCredit } from './credit.ts'
import { db, type Db } from './db.ts'
import { paymentsLive } from './stripe.ts'

/**
 * Trips that count towards Circle: confirmed, ended, with a real host who
 * isn't the guest, and (once payments are live) paid with real money, so
 * preview bookings and self-dealing never lift a tier.
 */
export async function completedTrips(userId: string, q?: Db): Promise<number> {
  const [r] = await (q ?? (await db())).query<{ n: string }>(
    `select count(*) as n from bookings
     where guest_id = $1 and status = 'confirmed' and end_date < current_date
       and (host_id is null or host_id <> guest_id) ${paymentsLive() ? `and paid = 'stripe' and host_id is not null` : ''}`,
    [userId],
  )
  return Number(r.n)
}

export interface CircleStatus {
  tier: Tier
  completedTrips: number
  next: { tier: Tier; tripsToGo: number } | null
  /** What the Circle rate has saved this guest so far. */
  savedCents: number
  creditCents: number
  tiers: readonly Tier[]
}

export async function circleFor(userId: string): Promise<CircleStatus> {
  const d = await db()
  const trips = await completedTrips(userId, d)
  const [saved] = await d.query<{ n: string | null }>(
    `select coalesce(sum((quote->'circle'->>'savedCents')::int), 0) as n from bookings where guest_id = $1 and status = 'confirmed'`,
    [userId],
  )
  return {
    tier: tierFor(trips),
    completedTrips: trips,
    next: nextTier(trips),
    savedCents: Number(saved.n ?? 0),
    creditCents: await creditBalance(userId, d),
    tiers: CIRCLE_TIERS,
  }
}

/** The pricing a guest's tier earns, for lib/checkout.ts. */
export async function circlePricing(userId: string): Promise<{ tier: string; feePct: number; freeCancelHours: number }> {
  const t = tierFor(await completedTrips(userId))
  return { tier: t.name, feePct: t.feePct, freeCancelHours: t.freeCancelHours }
}

/** The user's own referral code, created on first ask. */
export async function referralCodeFor(userId: string): Promise<string> {
  const d = await db()
  for (let attempt = 0; attempt < 5; attempt++) {
    const [u] = await d.query<{ referral_code: string | null }>(`select referral_code from users where id = $1`, [userId])
    if (u?.referral_code) return u.referral_code
    try {
      await d.query(`update users set referral_code = $2 where id = $1 and referral_code is null`, [userId, referralCode(randomBytes(8))])
    } catch {
      // A code collision (unique index): try another.
    }
  }
  throw new Error('referral code')
}

/** Who a code belongs to, for the "invited by" line at sign-up. */
export async function referrerByCode(code: string): Promise<{ id: string; firstName: string } | null> {
  if (!/^[A-Z2-9]{7}$/.test(code)) return null
  const [u] = await (await db()).query<{ id: string; name: string }>(`select id, name from users where referral_code = $1 and deleted_at is null`, [code])
  return u ? { id: u.id, firstName: u.name.split(/\s+/)[0] } : null
}

/**
 * Links a brand-new account to whoever invited it. Self-referral is
 * impossible: the code must belong to someone else and the account must
 * not already be linked. The welcome credit itself waits until the new
 * account's email is confirmed (grantReferralWelcome).
 */
export async function applyReferral(newUserId: string, code: string): Promise<boolean> {
  const referrer = await referrerByCode(code)
  if (!referrer || referrer.id === newUserId) return false
  const linked = await (await db()).query(`update users set referred_by = $2 where id = $1 and referred_by is null returning id`, [newUserId, referrer.id])
  return linked.length > 0
}

/** The friend's welcome credit, once, after their email is confirmed. */
export async function grantReferralWelcome(userId: string): Promise<boolean> {
  return (await db()).tx(async (t) => {
    const [u] = await t.query<{ referred_by: string | null; verified: boolean }>(
      `select referred_by, email_verified_at is not null as verified from users where id = $1`,
      [userId],
    )
    if (!u?.referred_by || !u.verified) return false
    const [referrer] = await t.query<{ name: string }>(`select name from users where id = $1`, [u.referred_by])
    // Keyed on the account, so it can only ever be granted once.
    if (!(await grantCredit(t, userId, REFERRAL.friendCreditCents, 'referral_welcome', `welcome:${userId}`))) return false
    await notify(
      t,
      userId,
      'Welcome to AVANT',
      `${referrer?.name.split(/\s+/)[0] ?? 'A friend'} invited you, so $${REFERRAL.friendCreditCents / 100} of AVANT credit is waiting. It comes off your first trip automatically.`,
      '/circle',
    )
    return true
  })
}

/** Rewards each referrer once their friend finishes a first real trip. */
export async function rewardReferrals(): Promise<number> {
  const d = await db()
  // The friend's first real trip: paid mostly by card, with a host who is neither the
  // referrer nor anyone the referrer brought in (so nobody books their own car to earn it).
  const paid = paymentsLive() ? `b.paid = 'stripe' and b.credit_cents * 2 <= (b.quote->>'totalCents')::int` : `true`
  const rows = await d.query<{ id: string; referred_by: string; name: string; booking_id: string }>(
    `select u.id, u.referred_by, u.name,
       (select b.id from bookings b
          where b.guest_id = u.id and b.status = 'confirmed' and b.end_date < current_date and ${paid}
            and b.host_id is not null and b.host_id <> u.referred_by
            and not exists (select 1 from users r where r.id = b.host_id and r.referred_by = u.referred_by)
          order by b.end_date limit 1) as booking_id
     from users u
     where u.referred_by is not null and not u.referral_rewarded and u.email_verified_at is not null
       and (select count(*) from credits c where c.user_id = u.referred_by and c.reason = 'referral_reward'
              and c.created_at > now() - interval '1 year') < ${MAX_REFERRAL_REWARDS_PER_YEAR}`,
  )
  let n = 0
  for (const r of rows) {
    if (!r.booking_id) continue
    await d.tx(async (t) => {
      const claimed = await t.query(`update users set referral_rewarded = true where id = $1 and not referral_rewarded returning id`, [r.id])
      if (!claimed.length) return
      if (await grantCredit(t, r.referred_by, REFERRAL.referrerCreditCents, 'referral_reward', r.booking_id)) {
        await notify(
          t,
          r.referred_by,
          'Thank you for the introduction',
          `${r.name.split(/\s+/)[0]} just finished their first trip, so $${REFERRAL.referrerCreditCents / 100} of AVANT credit is yours.`,
          '/circle',
        )
        n += 1
      }
    })
  }
  return n
}

/** The day after a trip ends, both people are asked, once, how it went. */
export async function nudgeReviews(): Promise<number> {
  const d = await db()
  const rows = await d.query<{ id: string; guest_id: string; host_id: string; title: string }>(
    `update bookings set nudged_at = now()
     where status = 'confirmed' and host_id is not null and nudged_at is null
       and end_date < current_date and end_date >= current_date - 3
     returning id, guest_id, host_id, car->>'title' as title`,
  )
  for (const b of rows) {
    await notify(d, b.guest_id, 'How was the drive?', `Thank you for choosing AVANT. A line about the ${b.title} helps the next guest, and your host.`, `/trips/${b.id}#review`)
    await notify(d, b.host_id, 'How was your guest?', `Your ${b.title} is back. A quick review helps other hosts welcome good guests.`, `/trips/${b.id}#review`)
  }
  return rows.length
}
