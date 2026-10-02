import Link from 'next/link'
import { CarArt } from '@/components/CarArt'
import { CarCard } from '@/components/CarCard'
import { HeroImage } from '@/components/HeroImage'
import { Icon } from '@/components/Icons'
import { SearchBar } from '@/components/SearchBar'
import { ButtonLink } from '@/components/ui'
import { asset, hasAsset } from '@/lib/assets'
import { BODY_TYPES, COVERAGE_PLANS, DEFAULT_COVERAGE, TRIP_FEE_PCT, YOUNG_DRIVER_FEES } from '@/lib/catalog'
import { cars, cities, countByBody, featuredCars } from '@/lib/data'
import { money } from '@/lib/format'
import { searchHref } from '@/lib/search'

// Neutral paint for the vehicle-type drawings, so the row reads as one set.
const TYPE_PAINT = '#9aa0aa'

export default function Home() {
  const hero = asset('hero')
  const keys = asset('keys')
  const counts = countByBody()
  const young = YOUNG_DRIVER_FEES[1]
  const perCity = (slug: string) => cars.filter((c) => c.city === slug).length

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-frame">
          <div className="hero-media" aria-hidden="true">
            <HeroImage src={hero.src} alt="" />
          </div>
          <div className="hero-inner">
            <h1 id="hero-title" className="display">
              Arrive differently.
            </h1>
            <p className="lead">
              Book the exact car you want from a local host. The whole price before you tap, coverage in one number, your licence checked once.
            </p>
          </div>
        </div>
        <div className="hero-search">
          <SearchBar presets />
        </div>
      </section>

      <div className="wrap">
        <section className="section" aria-labelledby="types">
          <div className="section-head">
            <h2 id="types">Browse by vehicle type</h2>
          </div>
          <div className="types">
            {BODY_TYPES.map((b) => (
              <Link key={b.id} href={searchHref({ bodies: [b.id] })} className="type-tile">
                <span className="car-art">
                  <CarArt body={b.id} color={TYPE_PAINT} />
                </span>
                <strong>{b.label}</strong>
                <span>{counts[b.id] ?? 0} cars</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="top">
          <div className="section-head">
            <div>
              <h2 id="top">Top rated in every city</h2>
              <p style={{ marginTop: 6 }}>Prices include the trip fee and standard coverage, before tax.</p>
            </div>
            <ButtonLink href={searchHref({ sort: 'rating' })} variant="secondary">
              See all cars
            </ButtonLink>
          </div>
          <div className="cargrid">
            {featuredCars().map((c, i) => (
              <CarCard key={c.id} car={c} priority={i < 4} />
            ))}
          </div>
        </section>

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
            <h2 id="why">Why people switch to AVANT</h2>
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

        <section className="section" aria-labelledby="cities">
          <div className="section-head">
            <h2 id="cities">Browse by city</h2>
          </div>
          <div className="cities">
            {cities.map((c) => {
              const photo = hasAsset(`city-${c.slug}`) ? asset(`city-${c.slug}`) : null
              return (
                <Link key={c.slug} href={searchHref({ city: c.slug })} className="city-tile" data-photo={photo ? undefined : 'none'}>
                  {photo ? <HeroImage src={photo.src} alt="" /> : null}
                  <div>
                    <strong>{c.name}</strong>
                    <span>{perCity(c.slug)} cars</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="section" aria-labelledby="host">
          <div className="band band-ink">
            <div className="band-media">
              <HeroImage src={keys.src} alt="" />
            </div>
            <div className="band-body">
              <h2 id="host">Your car could pay for itself</h2>
              <p>Keep 80% of every trip. Guests are verified before they can book, every trip carries protection, and payouts land weekly.</p>
              <div className="row" style={{ marginTop: 8 }}>
                <ButtonLink href="/host" variant="secondary">
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
