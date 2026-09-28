import Link from 'next/link'
import { CarCard } from '@/components/CarCard'
import { CarImage } from '@/components/CarImage'
import { HeroImage } from '@/components/HeroImage'
import { Icon } from '@/components/Icons'
import { SearchBar } from '@/components/SearchBar'
import { ButtonLink } from '@/components/ui'
import { asset } from '@/lib/assets'
import { BODY_TYPES, COVERAGE_PLANS, DEFAULT_COVERAGE, getPlan, TRIP_FEE_PCT, YOUNG_DRIVER_FEES } from '@/lib/catalog'
import { carTitle, cars, cities, countByBody, featuredCars } from '@/lib/data'
import { money } from '@/lib/format'
import { allInDaily } from '@/lib/pricing'
import { searchHref } from '@/lib/search'

const plan = getPlan(DEFAULT_COVERAGE)
const TYPE_COLORS: Record<string, string> = {
  suv: '#2F5D3A',
  sedan: '#E9E7E1',
  coupe: '#E1B321',
  convertible: '#9E2A2B',
  truck: '#6A6D73',
  van: '#4B6A88',
  hatchback: '#B9D1DB',
  wagon: '#A8623E',
}

export default function Home() {
  const hero = asset('hero')
  const keys = asset('keys')
  const coast = asset('coast')
  const driver = asset('driver')
  const counts = countByBody()
  const ticker = [...cars].sort((a, b) => b.rating - a.rating).slice(0, 16)
  const young = YOUNG_DRIVER_FEES[1]

  return (
    <>
      <section className="hero">
        <div className="hero-media" aria-hidden="true">
          <HeroImage src={hero.src} alt="" />
        </div>
        <div className="hero-inner reveal">
          <p className="eyebrow">Peer-to-peer car sharing · {cities.length} cities</p>
          <h1 className="display">
            Arrive <em>differently.</em>
          </h1>
          <p className="lead">
            Book the exact car you want from a local host. The whole price before you tap, coverage in one number, your licence verified once. No
            counter. No queue.
          </p>
          <SearchBar presets />
        </div>
      </section>

      <div className="marquee" aria-label="Cars available now">
        <div className="marquee-track">
          {[...ticker, ...ticker].map((c, i) => (
            <Link key={`${c.id}-${i}`} href={`/cars/${c.slug}`} className="marquee-item" tabIndex={i < ticker.length ? 0 : -1} aria-hidden={i >= ticker.length}>
              {carTitle(c)} · {c.neighborhood}
              <strong>{money(allInDaily(c.dailyRateCents, plan.pctOfTrip, plan.minPerDayCents))}</strong>/day all-in
            </Link>
          ))}
        </div>
      </div>

      <div className="wrap">
        <section className="section" aria-labelledby="types">
          <div className="section-head">
            <h2 id="types">
              What are you <em>in the mood</em> for?
            </h2>
            <p>Every car is hosted by a real person nearby, not a lot behind an airport.</p>
          </div>
          <div className="types">
            {BODY_TYPES.map((b) => (
              <Link key={b.id} href={searchHref({ bodies: [b.id] })} className="type-tile">
                <CarImage body={b.id} color={TYPE_COLORS[b.id]} alt="" />
                <strong>{b.label}</strong>
                <span>
                  {b.blurb} · {counts[b.id] ?? 0} listed
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="why">
          <div className="section-head">
            <h2 id="why">
              Everything the old way <em>made hard.</em>
            </h2>
            <p>Built around the moments people complain about most: surprise fees, confusing insurance, slow support, unfair damage claims.</p>
          </div>
          <div className="bento">
            <div className="b-span-4 b-photo">
              <HeroImage src={coast.src} alt="" />
              <p className="eyebrow">All-in pricing</p>
              <h3>The price on the card is the price.</h3>
              <p>Every card and map pin shows rate, a flat {TRIP_FEE_PCT}% trip fee and coverage, together. At checkout we only add what you chose, and tax.</p>
            </div>
            <div className="b-span-2 b-lime">
              <span className="big-num" style={{ color: 'var(--lime-ink)' }}>
                $0
              </span>
              <h3>Surprise fees. Ever.</h3>
              <p>No dynamic trip fee that doubles overnight.</p>
            </div>
            <div className="b-span-2">
              <Icon name="id" size={26} />
              <h3>Driver Pass</h3>
              <p>Verify your licence once in about two minutes. Book any car after that with one tap. We keep your age, not your ID.</p>
            </div>
            <div className="b-span-2">
              <span className="big-num">18+</span>
              <h3>Young drivers welcome</h3>
              <p>
                Everyday cars from 18. The under-25 fee is capped at {money(young.capCents)} a trip for 21–24 and halved with a clean record.
              </p>
            </div>
            <div className="b-span-2 b-photo">
              <HeroImage src={driver.src} alt="" />
              <p className="eyebrow">Concierge</p>
              <h3>Ask anything, 24/7.</h3>
              <p>“An SUV in Denver this weekend under $100.” Done, priced, with coverage explained.</p>
            </div>
            <div className="b-span-3">
              <Icon name="shield" size={26} />
              <h3>Fair claims, on the record</h3>
              <p>Timestamped check-in photos for both sides. If a host reports damage you see their evidence and have 72 hours to respond before anything is charged.</p>
            </div>
            <div className="b-span-3">
              <Icon name="eye-off" size={26} />
              <h3>Private by design</h3>
              <p>No account needed. Your licence images are deleted after the check, your record is encrypted, and you can export or erase it any time.</p>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="coverage">
          <div className="section-head">
            <h2 id="coverage">
              Insurance in <em>one number.</em>
            </h2>
            <p>Pick the most you&apos;d ever pay if the car is damaged. That&apos;s the whole decision. Liability is included on every trip.</p>
          </div>
          <div className="grid-3">
            {COVERAGE_PLANS.map((p) => (
              <div key={p.id} className="panel" style={p.id === 'plus' ? { borderColor: 'var(--lime)' } : undefined}>
                <p className="plan-name">{p.name}</p>
                <p className="display" style={{ fontSize: '4rem', color: p.id === 'plus' ? 'var(--lime)' : undefined, margin: '8px 0' }}>
                  {money(p.maxOutOfPocketCents)}
                </p>
                <p className="muted">{p.oneLiner}</p>
                <p className="small dim" style={{ marginTop: 10 }}>
                  {p.recommendedFor}
                </p>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 20 }}>
            <ButtonLink href="/coverage" variant="secondary" iconAfter="arrow-right">
              Coverage in 30 seconds
            </ButtonLink>
          </div>
        </section>

        <section className="section" aria-labelledby="top">
          <div className="section-head">
            <h2 id="top">
              The best-reviewed car <em>in every city.</em>
            </h2>
            <ButtonLink href={searchHref({ sort: 'rating' })} variant="ghost" iconAfter="arrow-right">
              See all top rated
            </ButtonLink>
          </div>
          <div className="cargrid">
            {featuredCars().map((c) => (
              <CarCard key={c.id} car={c} />
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="host">
          <div className="bento">
            <div className="b-span-3 b-photo" style={{ minHeight: 380 }}>
              <HeroImage src={keys.src} alt="" />
            </div>
            <div className="b-span-3" style={{ justifyContent: 'center' }}>
              <p className="eyebrow">Hosting</p>
              <h2 id="host" className="display" style={{ fontSize: 'clamp(2.4rem,5vw,3.6rem)' }}>
                Your car could <em>pay for itself.</em>
              </h2>
              <p>Keep 80% of every trip. Guests are verified before they can book, every trip carries protection, and payouts land weekly.</p>
              <div className="row" style={{ marginTop: 10 }}>
                <ButtonLink href="/host" iconAfter="arrow-right">
                  See what you&apos;d earn
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
