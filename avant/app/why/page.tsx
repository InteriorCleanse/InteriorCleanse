import type { Metadata } from 'next'
import Link from 'next/link'
import { Crest } from '@/components/Logo'
import { ButtonLink } from '@/components/ui'
import { COVERAGE_PLANS, FREE_CANCEL_HOURS, HOST_SHARE_PCT, TRIP_FEE_PCT, YOUNG_DRIVER_FEES } from '@/lib/catalog'
import { CIRCLE_TIERS, PROMISE, REFERRAL } from '@/lib/circle'
import { REQUEST_HOURS } from '@/lib/policy'

export const metadata: Metadata = {
  title: 'Why AVANT',
  description: 'Every fee in one place, a promise when a host lets you down, and a trip fee that falls the more you drive.',
}

const $ = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`
const gold = CIRCLE_TIERS[CIRCLE_TIERS.length - 1]
const [teen, young] = YOUNG_DRIVER_FEES

/** What a guest pays, all of it. Every number comes from the same constants the server prices with. */
const FEES: [string, string][] = [
  ['Trip fee', `${TRIP_FEE_PCT}% of the trip price, falling to ${CIRCLE_TIERS.slice(1).map((t) => `${t.feePct}%`).join(' and ')} with AVANT Circle`],
  ['Protection', `Three plans, each shown as the most you’d pay if the car is damaged: ${COVERAGE_PLANS.map((p) => (p.maxOutOfPocketCents ? $(p.maxOutOfPocketCents) : '$0')).join(', ')}`],
  ['Drivers 18 to 20', `${$(teen.perDayCents)} a day, never more than ${$(teen.capCents)} a trip; half that with a clean record`],
  ['Drivers 21 to 24', `${$(young.perDayCents)} a day, never more than ${$(young.capCents)} a trip; half that with a clean record`],
  ['Delivery and extras', 'Set by the host and shown before you book; only added if you choose them'],
  ['Cancellation', `Free until ${FREE_CANCEL_HOURS} hours before pickup (${gold.freeCancelHours} hours for Circle ${gold.name}); after that, one day is kept`],
  ['Booking, service or convenience fees', 'None'],
]

const SIDE_BY_SIDE: [string, string, string][] = [
  ['The price you see', 'The all-in daily price on every card and map pin. Checkout adds only what you choose, and tax.', 'Usually the daily rate first, with trip fees added at checkout.'],
  ['The trip fee', `Published and flat: ${TRIP_FEE_PCT}%, falling to ${gold.feePct}% as you drive more.`, 'Varies trip to trip, and isn’t shown until late.'],
  ['Protection', 'One number per plan: the most you could ever pay.', 'Percentages, deductibles and fine print to compare.'],
  ['Young drivers', 'Welcome from 18. Capped per trip, halved with a clean record.', 'A daily surcharge that adds up on longer trips.'],
  ['If a host cancels', `Full refund, plus ${$(PROMISE.hostCancelCreditCents)} of credit, automatically.`, 'A refund; anything more depends on who you reach.'],
  ['If a host doesn’t answer', `The request expires after ${REQUEST_HOURS} hours: full refund plus ${$(PROMISE.requestExpiredCreditCents)} credit.`, 'You can be left waiting.'],
  ['Damage questions', 'Guided, fingerprinted photos at pickup and return, on the record for both sides.', 'Your own photos, if you remembered to take them.'],
  ['Help', 'A concierge that searches real cars, prices trips and explains policy at any hour; people for disputes.', 'Support queues.'],
  ['Loyalty', 'Your trip fee falls with every few trips. No points to decode.', 'Rarely more than a newsletter.'],
]

export default function WhyPage() {
  return (
    <div className="wrap page why">
      <header className="why-hero">
        <Crest height={64} />
        <h1 className="page-title">Better for the person driving, and the person sharing.</h1>
        <p className="lead muted">Everything on this page is how AVANT works today, built into the app and checked by our server on every booking.</p>
      </header>

      <section className="why-section" aria-labelledby="fees">
        <h2 id="fees">Every fee, in one place</h2>
        <dl className="fee-table">
          {FEES.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="why-section" aria-labelledby="compare">
        <h2 id="compare">Side by side</h2>
        <div className="compare" role="table" aria-label="AVANT compared with a typical car-sharing app">
          <div role="row" className="compare-head">
            <span role="columnheader">
              <span className="sr-only">What you get</span>
            </span>
            <span role="columnheader">AVANT</span>
            <span role="columnheader">A typical car-sharing app</span>
          </div>
          {SIDE_BY_SIDE.map(([k, ours, theirs]) => (
            <div role="row" key={k}>
              <span role="rowheader">{k}</span>
              <span role="cell" className="ours">
                {ours}
              </span>
              <span role="cell" className="theirs">
                {theirs}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="why-section why-two" aria-labelledby="circle">
        <div>
          <h2 id="circle">AVANT Circle</h2>
          <p className="muted">
            Complete trips and your trip fee falls: {CIRCLE_TIERS.map((t) => `${t.name} ${t.feePct}%`).join(', ')}. Invite a friend and you both get{' '}
            {$(REFERRAL.friendCreditCents)}. It&apos;s free, and it starts with your first trip.
          </p>
          <ButtonLink href="/circle" variant="secondary">
            See your Circle
          </ButtonLink>
        </div>
        <div>
          <h2 id="hosts">For hosts</h2>
          <p className="muted">
            You keep {HOST_SHARE_PCT}% of the trip price, plus delivery and extras in full, paid the day after each trip. Circle discounts come out of
            AVANT&apos;s fee, never yours. Edit prices and photos, block days and answer requests from your phone.
          </p>
          <ButtonLink href="/host" variant="secondary">
            Earn with your car
          </ButtonLink>
        </div>
      </section>

      <section className="why-cta">
        <h2>Find a car worth remembering.</h2>
        <div className="row" style={{ justifyContent: 'center' }}>
          <ButtonLink href="/">Search cars</ButtonLink>
          <Link href="/coverage" className="btn btn-secondary btn-md">
            Protection, explained
          </Link>
        </div>
      </section>
    </div>
  )
}
