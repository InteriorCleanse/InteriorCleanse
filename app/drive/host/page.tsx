import type { Metadata } from 'next'
import { EarningsEstimator } from '@/components/drive/Host'
import { Button, SectionTitle } from '@/components/drive/ui'
import { DRIVE } from '@/lib/drive/routes'

export const metadata: Metadata = {
  title: 'Host your car',
  description: 'Estimate what your car could earn from real fleet medians, then list it in four steps: the car, the pickup spot, the price and your rules.',
  alternates: { canonical: DRIVE.host },
}

export default function HostPage() {
  return (
    <div className="dr-container dr-page">
      <div className="dr-page-head">
        <div>
          <p className="dr-eyebrow">Hosting</p>
          <h1 className="dr-h1">Your car could pay for itself.</h1>
          <p className="dr-lead">Share it when you are not using it. You set the price, the rules and the days.</p>
        </div>
        <div className="dr-row">
          <Button href={DRIVE.hostNew} icon="plus" size="lg">
            List your car
          </Button>
          <Button href={DRIVE.hostListings} variant="secondary" size="lg">
            My listings
          </Button>
        </div>
      </div>

      <section className="dr-panel" aria-labelledby="dr-est">
        <SectionTitle title={<span id="dr-est">What could you earn?</span>} sub="Medians from the fleet, not marketing numbers." />
        <EarningsEstimator />
      </section>

      <section className="dr-section" aria-labelledby="dr-host-how">
        <SectionTitle title={<span id="dr-host-how">How hosting works</span>} />
        <ol className="dr-how">
          <li>
            <span className="dr-how-num">1</span>
            <h3>List in four steps</h3>
            <p>The car, where guests pick it up, a price with a suggestion from similar cars, and your rules.</p>
          </li>
          <li>
            <span className="dr-how-num">2</span>
            <h3>Guests book</h3>
            <p>Instant book confirms on the spot; otherwise you answer requests from the inbox.</p>
          </li>
          <li>
            <span className="dr-how-num">3</span>
            <h3>Hand over the keys</h3>
            <p>Every trip carries protection. You keep 75% of the trip price.</p>
          </li>
        </ol>
      </section>
    </div>
  )
}
