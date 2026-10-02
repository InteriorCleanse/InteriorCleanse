import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AvailabilityCalendar, BookingCard } from '@/components/BookingCard'
import { CarCard, SaveButton } from '@/components/CarCard'
import { CarImage } from '@/components/CarImage'
import { Icon } from '@/components/Icons'
import { Avatar, Breadcrumbs, Notice, Stars } from '@/components/ui'
import { BODY_TYPES, FEATURES, VALUE_TIERS } from '@/lib/catalog'
import { carTitle, cityName, getCar, getHost, similarCars } from '@/lib/data'
import { formatDate } from '@/lib/dates'
import { searchHref } from '@/lib/search'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const car = getCar((await params).slug)
  if (!car) return {}
  return { title: `${carTitle(car)} in ${cityName(car.city)}`, description: car.description.slice(0, 155) }
}

export default async function CarPage({ params }: Props) {
  const car = getCar((await params).slug)
  if (!car) notFound()
  const host = getHost(car.hostId)
  const body = BODY_TYPES.find((b) => b.id === car.body)

  return (
    <div className="wrap page">
      <Breadcrumbs items={[{ label: 'Search', href: '/search' }, { label: cityName(car.city), href: searchHref({ city: car.city }) }, { label: carTitle(car) }]} />
      {car.sample ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn">
            <strong>Sample listing.</strong> This car, its host and its reviews are invented to show how AVANT works, so there are no photos. Real listings
            show the host&apos;s own photos of the actual car.
          </Notice>
        </div>
      ) : null}
      <div className="car-hero">
        <CarImage body={car.body} color={car.color.hex} photo={car.photos[0]} sample={car.sample} alt={`${carTitle(car)}, photo by the host`} priority />
        <div className="car-hero-badges">
          {car.instantBook ? (
            <span className="badge badge-lime">
              <Icon name="bolt" size={12} /> Instant book
            </span>
          ) : null}
          {host.allStar ? <span className="badge badge-glass">All-star host</span> : null}
          <span className="badge badge-glass">{VALUE_TIERS[car.valueTier].label}</span>
          {car.sample ? <span className="badge badge-warn">Sample listing</span> : null}
        </div>
      </div>

      <div className="car-layout">
        <div>
          <p className="eyebrow">
            {body?.label} · {car.color.name}
            {car.trim ? ` · ${car.trim}` : ''}
          </p>
          <div className="between" style={{ alignItems: 'flex-end', marginTop: 8 }}>
            <h1>{carTitle(car)}</h1>
            <SaveButton car={car} labelled />
          </div>
          <p className="row muted" style={{ marginTop: 12 }}>
            <Stars value={car.rating} size={16} /> · {car.reviews.length} reviews · {car.tripCount} trips · {car.neighborhood}, {cityName(car.city)}
          </p>

          <ul className="specs" aria-label="Key details">
            <li>
              <Icon name="seat" size={18} /> {car.seats} seats
            </li>
            <li>
              <Icon name="gear" size={18} /> {car.transmission === 'manual' ? 'Manual' : 'Automatic'}
            </li>
            <li>
              <Icon name={car.fuel === 'electric' ? 'bolt' : 'fuel'} size={18} />
              {'rangeMiles' in car.efficiency ? `${car.efficiency.rangeMiles} mi range` : `${car.efficiency.mpg} mpg`}
            </li>
            <li>
              <Icon name="map" size={18} /> {car.milesPerDay} mi/day
            </li>
            <li>
              <Icon name="calendar" size={18} /> {car.minDays}–{car.maxDays} days
            </li>
            <li>
              <Icon name="key" size={18} /> Keyless pickup
            </li>
          </ul>

          <section className="car-section" aria-labelledby="about">
            <h2 id="about">About this car</h2>
            <p className="muted" style={{ maxWidth: '68ch' }}>
              {car.description}
            </p>
          </section>

          <section className="car-section" aria-labelledby="avail">
            <h2 id="avail">Availability</h2>
            <AvailabilityCalendar car={car} />
          </section>

          <section className="car-section" aria-labelledby="features">
            <h2 id="features">Features</h2>
            <ul className="feature-list">
              {car.features.map((f) => (
                <li key={f}>
                  <Icon name="check" size={15} /> {FEATURES[f]}
                </li>
              ))}
            </ul>
          </section>

          <section className="car-section" aria-labelledby="host">
            <div className="row" style={{ gap: 14 }}>
              <Avatar name={host.name} size={56} />
              <div>
                <h2 id="host" style={{ marginBottom: 4 }}>
                  Hosted by {host.name}
                </h2>
                <p className="small muted">
                  {host.allStar ? 'All-star · ' : ''}
                  {host.rating.toFixed(2)} rating · {host.trips} trips · since {host.joined.slice(0, 4)} · replies in ~{host.responseMinutes} min
                </p>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 12, maxWidth: '68ch' }}>
              {host.bio}
            </p>
          </section>

          <section className="car-section" aria-labelledby="rules">
            <h2 id="rules">House rules</h2>
            <ul className="muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
              {car.guidelines.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </section>

          <section className="car-section" aria-labelledby="reviews">
            <h2 id="reviews">
              {car.reviews.length} reviews · {car.rating.toFixed(1)} average
            </h2>
            <div className="stack">
              {car.reviews.map((r) => (
                <div key={r.id} className="review">
                  <div className="between">
                    <div className="row">
                      <Avatar name={r.author} size={34} />
                      <div>
                        <strong>{r.author}</strong>
                        <div className="small dim">{formatDate(r.date, true)}</div>
                      </div>
                    </div>
                    <Stars value={r.rating} />
                  </div>
                  <p className="muted" style={{ marginTop: 10 }}>
                    {r.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside aria-label="Book this car">
          <Suspense fallback={<div className="skeleton" />}>
            <BookingCard car={car} />
          </Suspense>
        </aside>
      </div>

      <section className="section" aria-labelledby="similar">
        <div className="section-head">
          <h2 id="similar">
            More like this
          </h2>
        </div>
        <div className="cargrid">
          {similarCars(car).map((c) => (
            <CarCard key={c.id} car={c} />
          ))}
        </div>
      </section>
    </div>
  )
}
