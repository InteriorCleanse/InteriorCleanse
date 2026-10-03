/**
 * Getting hosts paid, through Stripe Connect (Express accounts).
 *
 * Guests pay AVANT. After a trip ends, the host's share (lib/policy.ts) is
 * queued as a payout and transferred to the host's connected account from
 * that trip's own charge (source_transaction), with an idempotency key per
 * booking, so a payout can never be sent twice. Hosts who haven't finished
 * payout setup keep their payouts queued until they do.
 *
 * In preview mode (no Stripe key) earnings are computed the same way and
 * shown as "Preview": no money moves.
 */

import { hostEarnings } from '../policy.ts'
import type { Quote } from '../types.ts'
import { notify } from './bookings.ts'
import { db } from './db.ts'
import { paymentsLive, siteUrl, stripe } from './stripe.ts'

interface Account {
  id: string
  payouts_enabled: boolean
  details_submitted: boolean
  capabilities?: { transfers?: string }
}

export interface PayoutAccount {
  connected: boolean
  payoutsEnabled: boolean
}

export async function payoutAccount(userId: string): Promise<PayoutAccount> {
  const [u] = await (await db()).query<{ stripe_account_id: string | null; payouts_enabled: boolean }>(
    `select stripe_account_id, payouts_enabled from users where id = $1`,
    [userId],
  )
  return { connected: Boolean(u?.stripe_account_id), payoutsEnabled: Boolean(u?.payouts_enabled) }
}

/** A Stripe-hosted onboarding link for this host; creates their account once. */
export async function onboardingLink(userId: string, email: string): Promise<string> {
  const d = await db()
  const [u] = await d.query<{ stripe_account_id: string | null }>(`select stripe_account_id from users where id = $1`, [userId])
  let account = u?.stripe_account_id
  if (!account) {
    const created = await stripe<Account>('accounts', {
      form: {
        type: 'express',
        country: 'US',
        email,
        business_type: 'individual',
        'capabilities[transfers][requested]': 'true',
        'business_profile[product_description]': 'Shares their own car with guests on AVANT, a peer-to-peer car sharing marketplace.',
        'metadata[user]': userId,
      },
      idempotencyKey: `account-${userId}`,
    })
    await d.query(`update users set stripe_account_id = $2 where id = $1 and stripe_account_id is null`, [userId, created.id])
    const [again] = await d.query<{ stripe_account_id: string }>(`select stripe_account_id from users where id = $1`, [userId])
    account = again.stripe_account_id
  }
  const link = await stripe<{ url: string }>('account_links', {
    form: {
      account,
      type: 'account_onboarding',
      refresh_url: `${siteUrl()}/host/earnings?setup=retry`,
      return_url: `${siteUrl()}/api/host/payouts/return`,
    },
  })
  return link.url
}

async function applyAccount(userId: string, acct: Account): Promise<PayoutAccount> {
  const enabled = Boolean(acct.payouts_enabled && acct.capabilities?.transfers === 'active')
  await (await db()).query(`update users set payouts_enabled = $2 where id = $1`, [userId, enabled])
  return { connected: true, payoutsEnabled: enabled }
}

export async function refreshAccount(userId: string): Promise<PayoutAccount> {
  const [u] = await (await db()).query<{ stripe_account_id: string | null }>(`select stripe_account_id from users where id = $1`, [userId])
  if (!u?.stripe_account_id || !paymentsLive()) return { connected: Boolean(u?.stripe_account_id), payoutsEnabled: false }
  return applyAccount(userId, await stripe<Account>(`accounts/${u.stripe_account_id}`))
}

export async function refreshAccountByStripeId(accountId: string): Promise<void> {
  const [u] = await (await db()).query<{ id: string }>(`select id from users where stripe_account_id = $1`, [accountId])
  if (u) await applyAccount(u.id, await stripe<Account>(`accounts/${accountId}`))
}

interface EarningBooking {
  id: string
  host_id: string
  status: string
  paid: 'demo' | 'stripe'
  cancelled_by: string | null
  refund_cents: number
  quote: Quote
  car: { title: string; photo: string | null }
  guest_name: string
  start_date: string | Date
  end_date: string | Date
  payout_status: 'pending' | 'paid' | null
  paid_at: string | Date | null
}

const day = (d: string | Date) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const lateCancel = (b: Pick<EarningBooking, 'status' | 'cancelled_by' | 'refund_cents' | 'quote'>) =>
  b.status === 'cancelled' && b.cancelled_by === 'guest' && b.refund_cents < b.quote.totalCents

const amountFor = (b: EarningBooking) => hostEarnings(b.quote, lateCancel(b) ? 'late-cancel' : 'completed')

/** Trips that have earned the host money and have no payout yet. */
export async function queuePayouts(): Promise<number> {
  const d = await db()
  const rows = await d.query<EarningBooking>(
    `select b.* from bookings b
     where b.host_id is not null and b.paid = 'stripe' and b.payment_ref is not null
       and not exists (select 1 from payouts p where p.booking_id = b.id)
       and ((b.status = 'confirmed' and b.end_date < current_date)
         or (b.status = 'cancelled' and b.cancelled_by = 'guest' and b.refund_cents < (b.quote->>'totalCents')::int and b.start_date <= current_date))`,
  )
  let n = 0
  for (const b of rows) {
    const out = await d.query(`insert into payouts (booking_id, host_id, amount_cents, status) values ($1, $2, $3, 'pending') on conflict do nothing returning booking_id`, [
      b.id,
      b.host_id,
      amountFor(b),
    ])
    n += out.length
  }
  return n
}

/** Transfers queued payouts to hosts whose payout setup is complete. */
export async function sendPayouts(): Promise<number> {
  if (!paymentsLive()) return 0
  const d = await db()
  const rows = await d.query<{ booking_id: string; host_id: string; amount_cents: number; account: string; payment_ref: string; title: string }>(
    `select p.booking_id, p.host_id, p.amount_cents, u.stripe_account_id as account, b.payment_ref, b.car->>'title' as title
     from payouts p join users u on u.id = p.host_id join bookings b on b.id = p.booking_id
     where p.status = 'pending' and p.amount_cents > 0 and u.payouts_enabled and u.stripe_account_id is not null
     order by p.created_at limit 50`,
  )
  let sent = 0
  for (const p of rows) {
    try {
      const pi = await stripe<{ latest_charge: string | null }>(`payment_intents/${p.payment_ref}`)
      const transfer = await stripe<{ id: string }>('transfers', {
        form: {
          amount: String(p.amount_cents),
          currency: 'usd',
          destination: p.account,
          transfer_group: p.booking_id,
          ...(pi.latest_charge ? { source_transaction: pi.latest_charge } : {}),
          'metadata[booking]': p.booking_id,
        },
        idempotencyKey: `payout-${p.booking_id}`,
      })
      await d.tx(async (t) => {
        await t.query(`update payouts set status = 'paid', transfer_id = $2, paid_at = now() where booking_id = $1 and status = 'pending'`, [p.booking_id, transfer.id])
        await notify(t, p.host_id, 'Payout sent', `$${(p.amount_cents / 100).toFixed(2)} for the ${p.title} trip is on its way to your bank.`, '/host/earnings')
      })
      sent += 1
    } catch (err) {
      console.error(`payout ${p.booking_id}: ${err instanceof Error ? err.message : 'failed'}`)
    }
  }
  return sent
}

export type EarningState = 'upcoming' | 'pending' | 'paid' | 'preview'

export interface EarningRow {
  bookingId: string
  carTitle: string
  photo: string | null
  guest: string
  start: string
  end: string
  amountCents: number
  state: EarningState
  lateCancel: boolean
  paidAt: string | null
}

export interface Earnings {
  live: boolean
  account: PayoutAccount
  totals: Record<EarningState, number>
  rows: EarningRow[]
}

export async function earningsFor(hostId: string): Promise<Earnings> {
  const d = await db()
  const rows = await d.query<EarningBooking>(
    `select b.*, split_part(u.name, ' ', 1) as guest_name, p.status as payout_status, p.paid_at
     from bookings b join users u on u.id = b.guest_id left join payouts p on p.booking_id = b.id
     where b.host_id = $1 and (b.status = 'confirmed' or (b.status = 'cancelled' and b.cancelled_by = 'guest' and b.refund_cents < (b.quote->>'totalCents')::int))
     order by b.start_date desc limit 200`,
    [hostId],
  )
  const today = new Date().toISOString().slice(0, 10)
  const totals: Record<EarningState, number> = { upcoming: 0, pending: 0, paid: 0, preview: 0 }
  const out = rows.map((b): EarningRow => {
    const late = lateCancel(b)
    const finished = late ? day(b.start_date) <= today : day(b.end_date) < today
    const state: EarningState = !finished ? 'upcoming' : b.paid === 'demo' ? 'preview' : b.payout_status === 'paid' ? 'paid' : 'pending'
    const amountCents = amountFor(b)
    totals[state] += amountCents
    return {
      bookingId: b.id,
      carTitle: b.car.title,
      photo: b.car.photo,
      guest: b.guest_name,
      start: day(b.start_date),
      end: day(b.end_date),
      amountCents,
      state,
      lateCancel: late,
      paidAt: b.paid_at ? new Date(b.paid_at).toISOString() : null,
    }
  })
  return { live: paymentsLive(), account: await payoutAccount(hostId), totals, rows: out }
}
