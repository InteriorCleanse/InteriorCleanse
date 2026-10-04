import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AvailabilityCalendar, BookingCard } from '@/components/BookingCard'
import { CarCard, SaveButton } from '@/components/CarCard'
import { CarImage } from '@/components/CarImage'
import { Icon } from '@/components/Icons'
import { Avatar, Breadcrumbs, Notice, Stars } from '@/components/ui'
import { BODY_TYPES, FEATURES, VALUE_TIERS } from '@/lib/catalog'
import { formatDate } from '@/lib/dates'
import { carTitle, cityName } from '@/lib/places'
import { searchHref } from '@/lib/search'
import { findCar, listCars } from '@/lib/server/catalog'
import type { Car } from '@/lib/types'
import { Viewed } from '@/components/Viewed'

export const dynamic = 'force-dynamic'

function similar(car: Car, all: Car[], limit = 4): Car[] {
  const others = all.filter((c) => c.id !== car.id)
  const score = (c: Car) => (c.city === car.city ? 2 : 0) + (c.body === car.body ? 1 : 0) + (Boolean(c.sample) === Boolean(car.sample) ? 1 : 0)
  return others
    .filter((c) => c.city === car.city || c.body === car.body)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
}

function replies(minutes: number | null): string | null {
  if (minutes == null) return null
  if (minutes < 60) return `Typically replies within ${Math.max(5, Math.round(minutes / 5) * 5)} minutes`
  return `Typically replies within ${Math.round(minutes / 60)} hour${minutes >= 90 ? 's' : ''}`
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const car = await findCar((await params).slug)
  if (!car) return {}
  return {
    title: `${carTitle(car)} in ${cityName(car.city)}`,
    description: car.description.slice(0, 155),
    ...(car.sample ? { robots: { index: false } } : {}),
  }
}

export default async function CarPage({ params }: Props) {
  const car = await findCar((await params).slug)
  if (!car) notFound()
  const host = car.host
  const body = BODY_TYPES.find((b) => b.id === car.body)
  const more = similar(car, await listCars())
  const photos = car.photos.slice(0, 5)
  const title = carTitle(car)
  const reply = replies(host.responseMinutes)

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
      <Viewed slug={car.slug} />
      <div className="car-media">
        {photos.length > 1 ? (
          <div className="gallery" aria-label={`${photos.length} photos of this ${title} by the host`}>
            {photos.map((src, i) => (
              <CarImage key={src} body={car.body} color={car.color.hex} photo={src} alt={`${title}, host photo ${i + 1} of ${photos.length}`} priority={i === 0} />
            ))}
          </div>
        ) : (
          <div className="car-hero">
            <CarImage body={car.body} color={car.color.hex} photo={photos[0]} sample={car.sample} alt={`${title}, photo by the host`} priority />
          </div>
        )}
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
            {car.reviews.length ? (
              <>
                <Stars value={car.rating} size={16} /> · {car.reviews.length} reviews · {car.tripCount} trips
              </>
            ) : (
              <span className="badge">New listing</span>
            )}{' '}
            · {car.neighborhood}, {cityName(car.city)}
          </p>
          {car.approxLocation ? <p className="small dim">Exact pickup spot shared after booking</p> : null}

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
            <div className="host-card">
              <Avatar name={host.name} size={64} photo={host.photo} />
              <div>
                <h2 id="host" style={{ marginBottom: 4 }}>
                  Hosted by {host.name.split(' ')[0]}
                </h2>
                <p className="small muted">
                  {host.allStar ? 'All-star · ' : ''}
                  {host.trips ? `${host.rating ? `${host.rating.toFixed(2)} rating · ` : ''}${host.trips} trips` : 'New host'} · since {host.joined.slice(0, 4)}
                  {reply ? ` · ${reply}` : ''}
                </p>
              </div>
            </div>
            {host.bio ? (
              <p className="muted" style={{ marginTop: 12, maxWidth: '68ch' }}>
                {host.bio}
              </p>
            ) : null}
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
            <h2 id="reviews">{car.reviews.length ? `${car.reviews.length} reviews · ${car.rating.toFixed(1)} average` : 'Reviews'}</h2>
            {car.reviews.length ? null : <p className="muted">No trips yet. Reviews appear here after each completed trip, from guests who drove this car.</p>}
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

      {more.length ? (
      <section className="section" aria-labelledby="similar">
        <div className="section-head">
          <h2 id="similar">
            More like this
          </h2>
        </div>
        <div className="cargrid">
          {more.map((c) => (
            <CarCard key={c.id} car={c} />
          ))}
        </div>
      </section>
      ) : null}
    </div>
  )
}
