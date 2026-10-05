import type { Metadata } from 'next'
import { Estimator } from '@/components/Host'
import { HostLeadForm } from '@/components/HostLead'
import { Icon, type IconName } from '@/components/Icons'
import { ButtonLink, Notice } from '@/components/ui'
import { COVERAGE_TERMS_FINAL, HOST_SHARE_PCT } from '@/lib/catalog'
import { REQUEST_HOURS } from '@/lib/policy'
import { CLAIM_WINDOW_DAYS, GUEST_RESPONSE_HOURS } from '@/lib/trip-record'

export const metadata: Metadata = {
  title: 'Host your car',
  description: `Share your car with verified guests, keep ${HOST_SHARE_PCT}% of every trip, and get paid after each one. Estimate what your car could earn.`,
}

const WHY: [IconName, string, string][] = [
  ['card', `Keep ${HOST_SHARE_PCT}%, simply`, 'One share of every trip, plus delivery and extras in full. Circle discounts for guests come out of AVANT’s fee, never yours.'],
  ['id', 'Verified guests only', 'Every guest verifies their licence with a live selfie before they can book, and young drivers are limited to cars their age allows.'],
  ['calendar', 'Your car, your rules', `You set the price, the days, the miles and the rules. Approve each request yourself (within ${REQUEST_HOURS} hours) or turn on Instant Book.`],
  ['sparkle', 'Quiet nights', 'The concierge answers guests’ questions at 3am. Your phone only rings for what needs you.'],
]

const PROTECTED: [IconName, string, string][] = [
  ['shield', 'Liability on every trip', 'During each trip AVANT’s programme insurance is primary for injury and damage to others, at limits at least three times the state minimum, as Colorado law requires.'],
  ['camera', 'Photos that settle it', 'Guided, timestamped photos at pickup and return, from both sides, so there’s never a question of what was already there.'],
  ['list', 'A record of every mile', 'Odometer and fuel at pickup and return, confirmed by both of you, with mileage counted against your allowance.'],
  ['check', 'Claims with a deadline', `Report damage within ${CLAIM_WINDOW_DAYS} days with photos. The guest has ${GUEST_RESPONSE_HOURS} hours to answer, then our claims team decides on the evidence.`],
  ['lock', 'Private by design', 'Guests see your first name and an approximate pin. Your pickup instructions and VIN are encrypted and shared only with a confirmed guest.'],
  ['eye-off', 'Block and report', 'Anyone who makes you uneasy can be reported or blocked in one tap. Blocked people can’t message you or book your car again.'],
]

const FAQ: [string, string][] = [
  [
    'Do I need special insurance?',
    'Keep your own policy: it covers your car when it isn’t on a trip, and the law requires it. During trips AVANT’s programme covers liability. Many personal policies exclude car sharing, so tell your insurer; several sell inexpensive car-sharing endorsements.',
  ],
  ['Can I say no to a guest?', `Yes. With request-to-book you approve each trip within ${REQUEST_HOURS} hours, and you see the guest’s record first. You can’t refuse anyone for who they are.`],
  ['When do I get paid?', 'After each trip ends, through Stripe, to the bank account you connect. AVANT never sees your bank details. You can see every payout under Earnings.'],
  [
    'What if my car is damaged?',
    `Report it from the trip within ${CLAIM_WINDOW_DAYS} days, with photos and an estimate. The guest pays up to their protection plan’s cap; damage above that is handled through AVANT’s programme. Don’t arrange repairs until the claims team agrees them.`,
  ],
  ['My car has a loan or a lease.', 'Sharing it may break the terms of that agreement. Check with your lender or lessor before you list it.'],
  ['Which cars qualify?', 'Under 12 years old, under 130,000 miles, registered, insured, and with no open safety recall. Photos must be your own photos of the car.'],
  ['What about taxes?', 'Your earnings are income. Stripe sends tax forms (such as a 1099-K) where the law requires; keep records of your costs.'],
  ['How do guests get the keys?', 'Meet them, use a lockbox or keyless entry, or deliver the car for a fee you set. Your pickup note, shown only to confirmed guests, explains how.'],
]

export default function HostPage() {
  return (
    <div className="page">
      <div className="wrap">
        <div className="band band-ink">
          <div className="band-body">
            <h1 className="display" style={{ fontSize: 'clamp(2.4rem,5vw,3.8rem)' }}>
              Your car could pay for itself.
            </h1>
            <p>Share it when you&apos;re not using it. You set the price, the rules and the days, and keep {HOST_SHARE_PCT}% of every trip.</p>
            <div className="row" style={{ marginTop: 6 }}>
              <ButtonLink href="/host/new" icon="plus">
                List your car
              </ButtonLink>
              <ButtonLink href="#talk" variant="secondary">
                Talk to us first
              </ButtonLink>
            </div>
          </div>
          <div className="band-body band-steps">
            <ol>
              <li>Photograph your car: six angles, your own photos.</li>
              <li>Set your price, rules and the days it&apos;s free.</li>
              <li>Welcome verified guests and get paid after every trip.</li>
            </ol>
          </div>
        </div>

        <section className="section" aria-labelledby="est">
          <div className="section-head">
            <h2 id="est">What could you earn?</h2>
            <p>Built from the median rates of cars listed today.</p>
          </div>
          <Estimator />
        </section>

        <section className="section" aria-labelledby="why">
          <div className="section-head">
            <h2 id="why">Why hosts choose AVANT</h2>
          </div>
          <div className="grid-2">
            {WHY.map(([icon, t, b]) => (
              <div key={t} className="panel stack" style={{ gap: 8 }}>
                <Icon name={icon} size={24} />
                <h3 style={{ fontSize: '1.15rem' }}>{t}</h3>
                <p className="muted">{b}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="protected">
          <div className="section-head">
            <div>
              <p className="eyebrow">Protection</p>
              <h2 id="protected" style={{ marginTop: 8 }}>
                How you&apos;re protected
              </h2>
            </div>
          </div>
          <div className="promises">
            {PROTECTED.map(([icon, t, b]) => (
              <div key={t} className="promise">
                <Icon name={icon} size={28} />
                <h3>{t}</h3>
                <p>{b}</p>
              </div>
            ))}
          </div>
          {!COVERAGE_TERMS_FINAL ? (
            <div style={{ marginTop: 22 }}>
              <Notice tone="warn">
                AVANT&apos;s insurance programme is being finalised. Physical-damage protection for hosts&apos; cars, and the final limits, are confirmed
                with our insurance partner before the first trip, and the policy documents govern.
              </Notice>
            </div>
          ) : null}
        </section>

        <section className="section" aria-labelledby="faq">
          <div className="section-head">
            <h2 id="faq">Questions hosts ask</h2>
          </div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="talk-title" id="talk">
          <div className="section-head">
            <div>
              <p className="eyebrow">Not ready to list?</p>
              <h2 id="talk-title" style={{ marginTop: 8 }}>
                Talk to the host team
              </h2>
            </div>
            <p>Tell us about your car. A person replies within a day with an honest estimate and anything you want to know.</p>
          </div>
          <HostLeadForm />
        </section>

        <section className="section">
          <div className="row">
            <ButtonLink href="/host/new" iconAfter="arrow-right">
              List your car in six steps
            </ButtonLink>
            <ButtonLink href="/host/listings" variant="secondary">
              My listings
            </ButtonLink>
          </div>
          <p className="small dim" style={{ marginTop: 12 }}>
            Hosting opens city by city, starting in Denver. Read the <a className="link" href="/legal/host">Host Agreement</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
