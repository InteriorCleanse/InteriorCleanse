import type { Metadata } from 'next'
import { Notice } from '@/components/ui'
import { HOST_SHARE_PCT } from '@/lib/catalog'
import { LEGAL_VERSIONS } from '@/lib/legal'
import { REQUEST_HOURS } from '@/lib/policy'
import { CLAIM_WINDOW_DAYS, GUEST_RESPONSE_HOURS } from '@/lib/trip-record'

export const metadata: Metadata = { title: 'Host Agreement' }

export default function HostAgreement() {
  return (
    <div className="page page-narrow legal stack" style={{ gap: 18 }}>
      <h1 className="page-title">Host Agreement</h1>
      <p className="small dim">Version {LEGAL_VERSIONS.host_agreement}</p>
      <Notice tone="warn">
        Draft for legal review. Counsel must complete the bracketed sections and the disclosures each state&apos;s peer-to-peer car sharing law
        requires before launch.
      </Notice>

      <h2>Your car</h2>
      <ul className="muted">
        <li>You own the car or are authorised in writing to share it, and it is registered and insured as your state requires.</li>
        <li>It has no open safety recall. If one is issued, you pause the listing until it is repaired.</li>
        <li>It is roadworthy, clean and as described, and every photo is your own photo of this car.</li>
        <li>Each VIN can be listed by one host only.</li>
        <li>
          <strong>If your car has a loan or lease:</strong> sharing it may break the terms of that agreement. Check with your lender or lessor before
          you list it.
        </li>
        <li>
          <strong>Your own insurance:</strong> your personal auto policy may not cover the car while it&apos;s shared through AVANT, and your insurer may
          exclude that use. AVANT&apos;s programme covers the car&apos;s liability during each trip; your own policy covers it the rest of the time, and
          you must keep it in force.
        </li>
      </ul>

      <h2>Guests</h2>
      <ul className="muted">
        <li>You don&apos;t refuse, cancel on or treat guests differently because of who they are.</li>
        <li>You answer requests within {REQUEST_HOURS} hours; unanswered requests expire and the guest is refunded.</li>
        <li>
          Cancelling a confirmed trip costs the guest nothing and may cost you: three host cancellations in 30 days pause all your listings while we
          review.
        </li>
        <li>Pickup instructions you write are shared only with confirmed guests and are stored encrypted.</li>
      </ul>

      <h2>Money</h2>
      <ul className="muted">
        <li>
          You keep {HOST_SHARE_PCT}% of the trip price after any discounts you set, plus delivery and extras in full. Circle discounts come from
          AVANT&apos;s fee, never your share.
        </li>
        <li>
          Payouts are made through Stripe after each trip ends, to the account you connect. Stripe may ask you to verify your identity. AVANT
          never sees your bank details.
        </li>
        <li>
          You&apos;re responsible for your own income taxes. Stripe may issue tax forms (such as a 1099-K) where the law requires. [Marketplace
          facilitator tax collection: counsel and tax adviser to confirm per state.]
        </li>
      </ul>

      <h2>Trips, records and claims</h2>
      <ul className="muted">
        <li>
          At pickup and return, you or the guest record the odometer and the fuel or charge level, and the other confirms it. We keep these trip
          records, with the times, places, fees and your earnings for each trip, as car-sharing law requires.
        </li>
        <li>
          Report damage, cleaning, fuel, mileage, a late return, tolls or tickets within {CLAIM_WINDOW_DAYS} days of the trip ending, with photos,
          from the trip page. The guest has {GUEST_RESPONSE_HOURS} hours to respond. AVANT&apos;s claims team decides with both sides&apos; evidence.
        </li>
        <li>What a guest pays for damage never exceeds their protection plan&apos;s maximum; damage above that is handled through AVANT&apos;s programme.</li>
        <li>Don&apos;t arrange repairs on a reported claim until the claims team agrees them, and never take payment from a guest outside AVANT.</li>
        <li>[Host protection plans, deductibles and payout timing for repairs: to be completed with the insurer.]</li>
      </ul>

      <h2>Ending</h2>
      <p className="muted">
        You can pause or delete a listing at any time (deleting waits until upcoming trips are done). We may pause or remove listings that break
        this agreement. [Termination, liability and dispute terms: counsel.]
      </p>
    </div>
  )
}
