'use client'

/**
 * AVANT Circle: the membership card, what the guest's tier earns, the
 * credit wallet, the invite link, and the AVANT Promise. Signed out, the
 * same page explains the programme and invites people in.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { CIRCLE_TIERS, PROMISE, REFERRAL, type Tier } from '@/lib/circle'
import { moneyExact } from '@/lib/format'
import type { CircleStatus } from '@/lib/server/advantage'
import type { CreditEntry, CreditReason } from '@/lib/server/credit'
import { inApp, shareLink } from '@/lib/native'
import { Crest, Wordmark } from './Logo'
import { useSession } from './Session'
import { useToast } from './Toast'

const REASON: Record<CreditReason, string> = {
  promise_host_cancel: 'The AVANT Promise: your host cancelled',
  promise_request_expired: 'The AVANT Promise: your request went unanswered',
  referral_welcome: 'Welcome gift from a friend’s invite',
  referral_reward: 'Thank you for introducing a friend',
  used: 'Put towards a trip',
  returned: 'Returned from a refunded trip',
  goodwill: 'From AVANT, with thanks',
}

const dollars = (c: number) => `$${Math.round(c / 100)}`

function MemberCard({ name, tier, since }: { name: string; tier: Tier; since: string }) {
  return (
    <div className="member-card" data-tier={tier.id} aria-label={`AVANT Circle ${tier.name} membership card for ${name}`}>
      <div className="member-card-top">
        <Wordmark tone="platinum" title={null} className="member-card-word" />
        <Crest height={44} />
      </div>
      <div className="member-card-tier">Circle {tier.name}</div>
      <div className="member-card-foot">
        <span>{name}</span>
        <span>Member since {new Date(since).getFullYear()}</span>
      </div>
    </div>
  )
}

function Tiers({ current }: { current?: Tier }) {
  return (
    <div className="tier-table" role="table" aria-label="Circle tiers">
      {CIRCLE_TIERS.map((t) => (
        <div key={t.id} role="row" className="tier-col" data-current={current?.id === t.id || undefined}>
          <strong role="columnheader">{t.name}</strong>
          <span role="cell" className="small muted">{t.minTrips ? `After ${t.minTrips} trips` : 'From your first trip'}</span>
          <span role="cell" className="tier-fee">{t.feePct}%</span>
          <span role="cell" className="small muted">trip fee</span>
          <span role="cell" className="small">Free cancellation until {t.freeCancelHours} hours before pickup</span>
        </div>
      ))}
    </div>
  )
}

function OurPromise() {
  return (
    <section className="circle-section" aria-labelledby="promise">
      <h2 id="promise">The AVANT Promise</h2>
      <ul className="promise-list">
        <li>
          <strong>If your host cancels, you lose nothing.</strong> A full refund, and {dollars(PROMISE.hostCancelCreditCents)} of AVANT credit for the trouble,
          automatically.
        </li>
        <li>
          <strong>If a host doesn&apos;t answer, you don&apos;t wait.</strong> Requests expire after 8 hours with a full refund and{' '}
          {dollars(PROMISE.requestExpiredCreditCents)} of credit towards your next car.
        </li>
        <li>
          <strong>The price you see is the price you pay.</strong> Every card shows the all-in daily price; checkout adds only what you choose, and our
          server re-checks every total before charging.
        </li>
        <li>
          <strong>Your fee falls the more you drive.</strong> Circle lowers your trip fee as you complete trips. Hosts&apos; earnings never pay for it.
        </li>
      </ul>
    </section>
  )
}

export function Circle() {
  const { user, loaded } = useSession()
  const toast = useToast()
  const [data, setData] = useState<{ circle: CircleStatus; referralCode: string; history: CreditEntry[] } | null>(null)
  const [origin, setOrigin] = useState('')
  const [canShare, setCanShare] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/circle', { cache: 'no-store' })
    if (res.ok) setData(await res.json())
  }, [])
  useEffect(() => {
    setOrigin(window.location.origin)
    setCanShare(inApp() || typeof navigator.share === 'function')
    if (loaded && user) void load()
  }, [loaded, user, load])

  if (!loaded || (user && !data)) return <div className="skeleton" />

  if (!user) {
    return (
      <div className="stack" style={{ gap: 40 }}>
        <div className="circle-hero">
          <Crest height={72} />
          <h1 className="page-title">AVANT Circle</h1>
          <p className="lead muted">The more you drive with AVANT, the less you pay. No points to decode: your trip fee simply falls.</p>
          <div className="row">
            <Link href="/signin?mode=up&next=/circle" className="btn btn-primary btn-md">
              Join free
            </Link>
            <Link href="/signin?next=/circle" className="btn btn-secondary btn-md">
              Sign in
            </Link>
          </div>
        </div>
        <Tiers />
        <OurPromise />
      </div>
    )
  }

  const { circle, referralCode, history } = data!
  const link = `${origin}/signin?mode=up&ref=${referralCode}`
  const progress = circle.next ? Math.min(1, circle.completedTrips / circle.next.tier.minTrips) : 1

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast('Invite link copied')
    } catch {
      toast('Copy the link from the box')
    }
  }
  const share = async () => {
    const out = await shareLink({ title: 'AVANT', text: `Here's ${dollars(REFERRAL.friendCreditCents)} off your first car on AVANT.`, url: link })
    if (out === 'copied') toast('Invite link copied')
  }

  return (
    <div className="stack" style={{ gap: 40 }}>
      <div className="circle-top">
        <MemberCard name={user.name} tier={circle.tier} since={user.joined} />
        <div className="stack" style={{ gap: 18 }}>
          <h1 className="page-title">Circle {circle.tier.name}</h1>
          <dl className="circle-facts">
            <div>
              <dt>Your trip fee</dt>
              <dd>{circle.tier.feePct}%</dd>
            </div>
            <div>
              <dt>Free cancellation</dt>
              <dd>{circle.tier.freeCancelHours}h before pickup</dd>
            </div>
            <div>
              <dt>Saved with Circle</dt>
              <dd>{moneyExact(circle.savedCents)}</dd>
            </div>
          </dl>
          {circle.next ? (
            <div>
              <div className="circle-progress" role="progressbar" aria-label={`Progress to ${circle.next.tier.name}`} aria-valuemin={0} aria-valuemax={circle.next.tier.minTrips} aria-valuenow={circle.completedTrips}>
                <span style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="small muted" style={{ marginTop: 8 }}>
                {circle.next.tripsToGo} more trip{circle.next.tripsToGo === 1 ? '' : 's'} to {circle.next.tier.name}: a {circle.next.tier.feePct}% trip fee
                {circle.next.tier.freeCancelHours < circle.tier.freeCancelHours ? ` and free cancellation until ${circle.next.tier.freeCancelHours} hours before pickup` : ''}.
              </p>
            </div>
          ) : (
            <p className="small muted">You&apos;re at the top of the Circle. Thank you for driving with us.</p>
          )}
        </div>
      </div>

      <Tiers current={circle.tier} />

      <section className="circle-section" aria-labelledby="wallet">
        <div className="between" style={{ alignItems: 'baseline' }}>
          <h2 id="wallet">AVANT credit</h2>
          <span className="wallet-balance">{moneyExact(circle.creditCents)}</span>
        </div>
        <p className="muted small">Comes off your next trip automatically at checkout. Credit pays for trips only and can&apos;t be exchanged for cash.</p>
        {history.length ? (
          <ul className="wallet-list">
            {history.map((h, i) => (
              <li key={i}>
                <span>
                  {REASON[h.reason]}
                  <span className="small dim" style={{ display: 'block' }}>
                    {new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {h.bookingId ? (
                      <>
                        {' '}
                        ·{' '}
                        <Link href={`/trips/${h.bookingId}`} className="link">
                          trip
                        </Link>
                      </>
                    ) : null}
                  </span>
                </span>
                <strong data-negative={h.amountCents < 0 || undefined}>
                  {h.amountCents < 0 ? '−' : '+'}
                  {moneyExact(Math.abs(h.amountCents))}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small dim">Nothing here yet. Invite a friend below to start.</p>
        )}
      </section>

      <section className="circle-section invite" aria-labelledby="invite">
        <h2 id="invite">
          Give {dollars(REFERRAL.friendCreditCents)}, get {dollars(REFERRAL.referrerCreditCents)}
        </h2>
        <p className="muted">
          Friends who join with your link get {dollars(REFERRAL.friendCreditCents)} off their first car. When they finish that trip, {dollars(REFERRAL.referrerCreditCents)} lands
          in your wallet.
        </p>
        <div className="invite-row">
          <input className="input" readOnly value={link} aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-primary btn-md" onClick={() => void copy()}>
            Copy link
          </button>
          {canShare ? (
            <button type="button" className="btn btn-secondary btn-md" onClick={() => void share()}>
              Share
            </button>
          ) : null}
        </div>
        <p className="small dim">Your code: {referralCode}</p>
      </section>

      <OurPromise />
    </div>
  )
}
