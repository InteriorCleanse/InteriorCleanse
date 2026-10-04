import type { Metadata } from 'next'
import Link from 'next/link'
import { Notice } from '@/components/ui'
import { FREE_CANCEL_HOURS, HOST_SHARE_PCT } from '@/lib/catalog'
import { CIRCLE_TIERS, MAX_CREDIT_SHARE_PCT, PROMISE, REFERRAL } from '@/lib/circle'
import { LEGAL_VERSIONS, MIN_ACCOUNT_AGE } from '@/lib/legal'
import { REQUEST_HOURS } from '@/lib/policy'

export const metadata: Metadata = { title: 'Terms' }

const $ = (c: number) => `$${Math.round(c / 100)}`
const gold = CIRCLE_TIERS[CIRCLE_TIERS.length - 1]

export default function Terms() {
  return (
    <div className="page page-narrow legal stack" style={{ gap: 18 }}>
      <h1 className="page-title">Terms</h1>
      <p className="small dim">
        Terms of Service version {LEGAL_VERSIONS.terms} · Trip terms version {LEGAL_VERSIONS.trip_terms}
      </p>
      <Notice tone="warn">
        Draft for legal review. These terms describe how AVANT works today, but they are not yet a binding agreement. Counsel must review them,
        complete the bracketed sections, and add the disclosures each state&apos;s peer-to-peer car sharing law requires before launch.
      </Notice>

      <nav aria-label="On this page" className="legal-toc">
        <a href="#service">Terms of Service</a>
        <a href="#trips">Trip terms</a>
        <a href="#programme">AVANT credit, Circle and referrals</a>
        <a href="#hosts">For hosts</a>
      </nav>

      <h2 id="service">Terms of Service</h2>
      <h3>Who we are</h3>
      <p className="muted">
        AVANT runs a marketplace where guests book cars from independent hosts who own them. AVANT is not a car rental company and does not own
        the cars listed. [Legal entity name, state of formation and registered address.]
      </p>
      <h3>Your account</h3>
      <p className="muted">
        You must be at least {MIN_ACCOUNT_AGE} and able to form a binding contract. Give your real name and an email address you control; we
        confirm it before your account becomes active. Keep your password private. You&apos;re responsible for what happens on your account, and
        you can sign out of every device, change your password, download your data or close your account from Profile at any time.
      </p>
      <h3>What isn&apos;t allowed</h3>
      <ul className="muted">
        <li>Using someone else&apos;s identity, licence or payment card, or letting anyone other than the verified guest drive.</li>
        <li>Creating more than one account, or using accounts together to obtain credit, discounts or rewards.</li>
        <li>Listing a car you don&apos;t own or aren&apos;t authorised to share, or using photos that aren&apos;t of that car.</li>
        <li>Discriminating against anyone for who they are, harassing anyone, or arranging payment outside AVANT.</li>
        <li>Scraping, probing or attacking the service, or getting around its limits or security.</li>
      </ul>
      <p className="muted">We may suspend or close accounts that break these rules, and reverse credit or rewards obtained through them.</p>
      <h3>Changes</h3>
      <p className="muted">
        When these terms change materially we update the version above and ask you to accept the new version before your next booking or
        listing. We keep a record of which version you accepted and when.
      </p>
      <h3>Liability and disputes</h3>
      <p className="muted">
        [Limitation of liability, disclaimers, indemnity, governing law, venue, and whether disputes go to arbitration with a class-action waiver:
        to be written by counsel for each state where AVANT operates.]
      </p>

      <h2 id="trips">Trip terms</h2>
      <h3>Drivers</h3>
      <p className="muted">
        Only the verified guest may drive. Drivers must hold a valid licence for the whole trip and meet the age rules for the car&apos;s class.
      </p>
      <h3>Price</h3>
      <p className="muted">
        The total shown at checkout is what you pay; our server re-calculates it before anything is charged. Taxes are shown as their own line.
      </p>
      <h3>Requests and cancellation</h3>
      <ul className="muted">
        <li>A request the host doesn&apos;t answer within {REQUEST_HOURS} hours expires and is refunded in full.</li>
        <li>
          Cancel for free until {FREE_CANCEL_HOURS} hours before pickup ({gold.freeCancelHours} hours for Circle {gold.name}). After that, one day&apos;s
          share of the total is kept and the rest refunded. The exact amount is shown before you confirm.
        </li>
        <li>Once pickup time has passed, a trip can&apos;t be cancelled in the app; contact support and we&apos;ll help.</li>
        <li>If the host cancels, you&apos;re refunded in full.</li>
        <li>Refunds go back the way you paid: card payments to the card, AVANT credit as credit.</li>
      </ul>
      <h3>Coverage, damage, tolls and tickets</h3>
      <p className="muted">
        During the trip AVANT&apos;s program covers liability to third parties up to the limits in the trip&apos;s coverage, as state law requires.
        Damage responsibility is capped by your coverage plan. Hosts must submit evidence; you have 72 hours to respond before any charge. Tolls
        and fines incurred during the trip are passed through at cost. [Coverage terms are placeholders until the insurer signs them.]
      </p>

      <h2 id="programme">AVANT credit, Circle and referrals</h2>
      <ul className="muted">
        <li>
          AVANT credit pays for trips on AVANT only. It has no cash value, can&apos;t be transferred, sold or exchanged for money, and pays at most{' '}
          {MAX_CREDIT_SHARE_PCT}% of a trip when payments are live.
        </li>
        <li>
          Circle tiers ({CIRCLE_TIERS.map((t) => `${t.name} ${t.feePct}%`).join(', ')}) count completed, paid trips with independent hosts. Trips
          with a host you&apos;re connected to don&apos;t count.
        </li>
        <li>
          The AVANT Promise adds {$(PROMISE.hostCancelCreditCents)} of credit when a host cancels a confirmed trip, and{' '}
          {$(PROMISE.requestExpiredCreditCents)} when a request expires unanswered: for trips paid at least half by card, at most once in 90 days, and
          never twice from the same host.
        </li>
        <li>
          Referrals: a friend who joins with your link and confirms their email gets {$(REFERRAL.friendCreditCents)} of credit; you get{' '}
          {$(REFERRAL.referrerCreditCents)} after their first completed, paid trip with a host who isn&apos;t you or someone you referred. Up to 10
          rewards a year. If you share your link publicly, say that you get a reward when people join.
        </li>
        <li>We may change or end these programmes with notice; credit you already hold stays usable for at least [period set by counsel].</li>
        <li>Credit or rewards obtained by breaking these terms can be reversed.</li>
      </ul>

      <h2 id="hosts">For hosts</h2>
      <p className="muted">
        Hosting is covered by the <Link href="/legal/host" className="link">Host Agreement</Link>, which you accept when you list a car. In short:
        you keep {HOST_SHARE_PCT}% of the trip price plus delivery and extras, paid through Stripe after each trip; you list only cars you own or may
        share, insured, registered and free of open recalls, with your own photos.
      </p>
    </div>
  )
}
