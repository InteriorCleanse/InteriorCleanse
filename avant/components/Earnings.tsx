'use client'

/**
 * What a host has earned: upcoming trips, payouts on their way, and what
 * has been paid, plus payout setup through Stripe. In preview mode the same
 * figures show, labelled, with no money moving.
 */

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { HOST_SHARE_PCT } from '@/lib/catalog'
import { moneyExact } from '@/lib/format'
import type { EarningState, Earnings as EarningsData } from '@/lib/server/payouts'
import { CarImage } from './CarImage'
import { Icon } from './Icons'
import { useSession } from './Session'
import { useToast } from './Toast'
import { ButtonLink, Empty, Notice } from './ui'

const LABEL: Record<EarningState, string> = { upcoming: 'Upcoming', pending: 'Payout on its way', paid: 'Paid', preview: 'Preview' }
const TONE: Record<EarningState, string | undefined> = { upcoming: undefined, pending: 'gold', paid: 'quiet', preview: 'quiet' }
const dates = (a: string, b: string) =>
  `${new Date(`${a}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(`${b}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

export function Earnings() {
  const { user, loaded } = useSession()
  const params = useSearchParams()
  const toast = useToast()
  const [data, setData] = useState<EarningsData | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/host/earnings', { cache: 'no-store' })
    if (res.ok) setData(await res.json())
  }, [])
  useEffect(() => {
    if (loaded && user) void load()
  }, [loaded, user, load])

  const setUp = async () => {
    setBusy(true)
    const res = await fetch('/api/host/payouts', { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (res.ok && json.url) return window.location.assign(json.url)
    setBusy(false)
    toast(json.error ?? 'Payout setup is unavailable right now.')
  }

  if (!loaded || (user && !data)) return <div className="skeleton" />
  if (!user) {
    return <Empty icon="card" title="Sign in to see your earnings" body="Earnings and payouts live in your account." action={<ButtonLink href="/signin?next=/host/earnings">Sign in</ButtonLink>} />
  }
  const d = data!
  const setup = params.get('setup')

  return (
    <div className="stack" style={{ gap: 28 }}>
      {setup === 'done' ? <Notice tone="ok">Payouts are set up. Each trip pays out the day after it ends.</Notice> : null}
      {setup === 'pending' ? <Notice tone="warn">Stripe needs a little more from you before payouts can start. Continue setup below.</Notice> : null}

      <div className="earn-totals">
        <div>
          <span className="small muted">Upcoming</span>
          <strong>{moneyExact(d.totals.upcoming)}</strong>
        </div>
        <div>
          <span className="small muted">{d.live ? 'On its way' : 'Earned (preview)'}</span>
          <strong>{moneyExact(d.live ? d.totals.pending : d.totals.preview)}</strong>
        </div>
        <div>
          <span className="small muted">Paid to you</span>
          <strong>{moneyExact(d.totals.paid)}</strong>
        </div>
      </div>

      <section className="panel stack" aria-labelledby="payouts">
        <h2 id="payouts" style={{ fontSize: '1.2rem' }}>
          Payouts
        </h2>
        {!d.live ? (
          <p className="muted">
            Preview mode: earnings are worked out exactly as they will be, but no money moves. Payout setup opens when payments go live.
          </p>
        ) : d.account.payoutsEnabled ? (
          <p className="muted">
            <Icon name="check" size={15} /> Your bank account is connected through Stripe. Each trip pays out the day after it ends.
          </p>
        ) : (
          <>
            <p className="muted">
              Connect your bank account through Stripe to get paid. It takes about five minutes, and AVANT never sees your bank details. Earnings wait
              safely until you finish.
            </p>
            <div>
              <button type="button" className="btn btn-primary btn-md" onClick={() => void setUp()} disabled={busy}>
                {busy ? 'Opening Stripe…' : d.account.connected ? 'Continue payout setup' : 'Set up payouts'}
              </button>
            </div>
          </>
        )}
        <p className="small dim">
          You keep {HOST_SHARE_PCT}% of the trip price after discounts, plus delivery and extras in full. The trip fee, coverage and taxes are never
          deducted from your share.
        </p>
      </section>

      {d.rows.length ? (
        <section aria-labelledby="trips-h">
          <h2 id="trips-h" style={{ fontSize: '1.2rem', marginBottom: 12 }}>
            By trip
          </h2>
          <ul className="earn-list">
            {d.rows.map((r) => (
              <li key={r.bookingId}>
                <Link href={`/trips/${r.bookingId}`}>
                  <span className="thumb">
                    <CarImage body="sedan" color="#d6d3cd" photo={r.photo} alt="" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{r.carTitle}</strong>
                    <span className="small muted">
                      {r.guest} · {dates(r.start, r.end)}
                      {r.lateCancel ? ' · cancelled late, first day kept' : ''}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <strong style={{ display: 'block' }}>{moneyExact(r.amountCents)}</strong>
                    <span className="status-pill" data-tone={TONE[r.state]}>
                      {LABEL[r.state]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Empty icon="card" title="No trips yet" body="When guests book your car, what you’ll earn from each trip shows here." action={<ButtonLink href="/host/listings">Your listings</ButtonLink>} />
      )}
    </div>
  )
}
