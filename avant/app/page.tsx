import { Discover } from '@/components/Discover'
import { Icon } from '@/components/Icons'
import { PriceBreakdown } from '@/components/PriceBreakdown'
import { ButtonLink } from '@/components/ui'
import { COVERAGE_PLANS, DEFAULT_COVERAGE, getPlan, HOST_SHARE_PCT, TRIP_FEE_PCT, YOUNG_DRIVER_FEES } from '@/lib/catalog'
import { money } from '@/lib/format'
import { quote } from '@/lib/pricing'
import { listCars } from '@/lib/server/catalog'

export const dynamic = 'force-dynamic'

// What a trip really costs, broken down the way checkout shows it.
const EXAMPLE = { rate: 8000, days: 3 }
const exampleQuote = quote({
  dailyRateCents: EXAMPLE.rate,
  days: EXAMPLE.days,
  weeklyDiscountPct: 0,
  monthlyDiscountPct: 0,
  plan: getPlan(DEFAULT_COVERAGE),
  delivery: false,
  deliveryFeeCents: 0,
  extras: [],
  taxRate: 0,
  youngDriverFeeCents: 0,
})

export default async function Home() {
  const cars = await listCars()
  const young = YOUNG_DRIVER_FEES[1]

  return (
    <>
      <Discover cars={cars} />

      <div className="wrap">
        <section className="section" aria-labelledby="how">
          <div className="section-head">
            <h2 id="how">Booking takes three steps</h2>
          </div>
          <ol className="how" style={{ padding: 0, margin: 0 }}>
            <li>
              <h3>Find the car</h3>
              <p>Search by city and dates. Every card and map pin shows the all-in daily price, so what you compare is what you pay.</p>
            </li>
            <li>
              <h3>Verify your licence once</h3>
              <p>A two-minute licence and selfie check. After that, every booking is one tap. We keep your age, not your ID.</p>
            </li>
            <li>
              <h3>Pick up and go</h3>
              <p>Keyless pickup or delivery to your door. Take six check-in photos in the app and you&apos;re covered from the first mile.</p>
            </li>
          </ol>
        </section>

        <section className="section" aria-labelledby="why">
          <div className="section-head">
            <div>
              <p className="eyebrow">The AVANT way</p>
              <h2 id="why" style={{ marginTop: 8 }}>Thoughtful at every step</h2>
            </div>
            <figure className="hero-quote" aria-label="Example of an all-in price" style={{ maxWidth: 360, transform: 'none' }}>
              <figcaption>
                <span className="badge badge-lime">All-in</span>
                <span className="small muted">
                  Example: {EXAMPLE.days} days at {money(EXAMPLE.rate)}/day
                </span>
              </figcaption>
              <PriceBreakdown quote={{ ...exampleQuote, lines: exampleQuote.lines.filter((l) => l.cents !== 0) }} notes={false} />
            </figure>
          </div>
          <div className="promises">
            <div className="promise">
              <Icon name="card" size={28} />
              <h3>The price on the card is the price</h3>
              <p>Rate, a flat {TRIP_FEE_PCT}% trip fee and coverage, shown together. Checkout only adds what you choose, and tax.</p>
            </div>
            <div className="promise">
              <Icon name="shield" size={28} />
              <h3>Insurance in one number</h3>
              <p>Pick the most you&apos;d ever pay if the car is damaged. Liability is included on every trip.</p>
            </div>
            <div className="promise">
              <Icon name="id" size={28} />
              <h3>Young drivers welcome</h3>
              <p>Everyday cars from 18. The under-25 fee is capped at {money(young.capCents)} a trip for 21 to 24, and halved with a clean record.</p>
            </div>
            <div className="promise">
              <Icon name="check" size={28} />
              <h3>Fair claims, on the record</h3>
              <p>Fingerprinted check-in photos for both sides. If a host reports damage, you see the evidence and get 72 hours to respond.</p>
            </div>
            <div className="promise">
              <Icon name="chat" size={28} />
              <h3>Help at 3am</h3>
              <p>The concierge searches real cars, prices trips and explains coverage any time. People handle disputes.</p>
            </div>
            <div className="promise">
              <Icon name="lock" size={28} />
              <h3>Private by design</h3>
              <p>No account to browse or book. Licence images are deleted after the check, and you can export or erase your record.</p>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="coverage">
          <div className="section-head">
            <div>
              <h2 id="coverage">Choose your protection</h2>
              <p style={{ marginTop: 6 }}>The big number is the most you&apos;d pay if the car is damaged.</p>
            </div>
            <ButtonLink href="/coverage" variant="secondary">
              Compare plans
            </ButtonLink>
          </div>
          <div className="plan-row">
            {COVERAGE_PLANS.map((p) => (
              <div key={p.id} className="plan-tile" data-featured={p.id === DEFAULT_COVERAGE ? 'true' : undefined}>
                <div className="between">
                  <p className="plan-name">{p.name}</p>
                  {p.id === DEFAULT_COVERAGE ? <span className="badge badge-lime">Most picked</span> : null}
                </div>
                <p className="display">{money(p.maxOutOfPocketCents)}</p>
                <p className="muted">{p.oneLiner}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="host">
          <div className="band band-ink">
            <div className="band-body">
              <h2 id="host">Your car could pay for itself</h2>
              <p>Keep {HOST_SHARE_PCT}% of every trip. Guests are verified before they can book, every trip carries protection, and payouts land weekly.</p>
              <div className="row" style={{ marginTop: 8 }}>
                <ButtonLink href="/host" variant="secondary">
                  See what you&apos;d earn
                </ButtonLink>
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
        </section>
      </div>
    </>
  )
}
