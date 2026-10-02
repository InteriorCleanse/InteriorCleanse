import type { Metadata } from 'next'
import { Estimator } from '@/components/Host'
import { Icon, type IconName } from '@/components/Icons'
import { ButtonLink } from '@/components/ui'
import { HOST_SHARE_PCT } from '@/lib/catalog'

export const metadata: Metadata = { title: 'Host your car', description: 'Estimate what your car could earn on AVANT, keep 80% of every trip, and host verified guests only.' }

const WHY: [IconName, string, string][] = [
  ['id', 'Verified guests only', 'Every guest verifies their licence before booking. Under-25 drivers are limited to cars their age allows.'],
  ['shield', 'Protection on every trip', 'Liability is on every trip, and physical damage is covered under AVANT’s host protection once our insurance partner signs.'],
  ['card', `Keep ${HOST_SHARE_PCT}%`, 'One share, no tiers to decode. Weekly payouts to your bank.'],
  ['sparkle', 'An assistant that helps you too', 'The concierge answers guest questions at 3am, so your phone stays quiet.'],
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
            <p>Share it when you&apos;re not using it. You set the price, the rules and the days.</p>
            <div className="row" style={{ marginTop: 6 }}>
              <ButtonLink href="/host/new" icon="plus">List your car</ButtonLink>
              <ButtonLink href="/host/listings" variant="secondary">My listings</ButtonLink>
            </div>
          </div>
          <div className="band-body band-steps">
            <ol>
              <li>Photograph your car: six angles, your own photos.</li>
              <li>Set your price, rules and the days it&apos;s free.</li>
              <li>Approve verified guests and get paid weekly.</li>
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
            <h2 id="why">Why hosts choose AVANT.</h2>
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
          <div className="row" style={{ marginTop: 24 }}>
            <ButtonLink href="/host/new" iconAfter="arrow-right">List your car in six steps</ButtonLink>
            <ButtonLink href="/concierge" variant="secondary">Ask the concierge</ButtonLink>
          </div>
          <p className="small dim" style={{ marginTop: 12 }}>Hosting opens city by city. Vehicles must be under 12 years old, under 130,000 miles, with no open safety recalls.</p>
        </section>
      </div>
    </div>
  )
}
