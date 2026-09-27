import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { BookingPanelFromUrl } from '@/components/drive/BookingPanelFromUrl'
import { CarArt } from '@/components/drive/CarArt'
import { CarCard } from '@/components/drive/CarCard'
import { CarTitleActions, MessageHostButton, Reviews } from '@/components/drive/CarDetailParts'
import { Icon } from '@/components/drive/Icons'
import { Avatar, Badge, Breadcrumbs, Stars } from '@/components/drive/ui'
import { BODY_TYPES, FEATURES } from '@/lib/drive/catalog'
import { carTitle, cars, cityName, getCar, getHost, similarCars } from '@/lib/drive/data'
import { formatDate } from '@/lib/drive/dates'
import { money, plural } from '@/lib/drive/format'
import { DRIVE } from '@/lib/drive/routes'
import { searchHref } from '@/lib/drive/search'
import { clampDescription } from '@/lib/seo'

export function generateStaticParams() {
  return cars.map((c) => ({ slug: c.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const car = getCar(params.slug)
  if (!car) return {}
  return {
    title: `${carTitle(car)} in ${cityName(car.city)}`,
    description: clampDescription(`${carTitle(car)} for ${money(car.dailyRateCents)} a day in ${car.neighborhood}, ${cityName(car.city)}.`, car.description),
    alternates: { canonical: DRIVE.car(car.slug) },
  }
}

export default function CarPage({ params }: { params: { slug: string } }) {
  const car = getCar(params.slug)
  if (!car) notFound()
  const host = getHost(car.hostId)
  const body = BODY_TYPES.find((b) => b.id === car.body)
  const similar = similarCars(car)

  return (
    <div className="dr-container dr-detail">
      <Breadcrumbs
        items={[
          { label: 'Explore', href: DRIVE.cars },
          { label: cityName(car.city), href: searchHref({ city: car.city }) },
          { label: carTitle(car) },
        ]}
      />

      <div className="dr-detail-hero" style={{ color: car.color.hex }}>
        <CarArt body={car.body} color={car.color.hex} title={`${carTitle(car)} in ${car.color.name.toLowerCase()}`} />
        <div className="dr-detail-badges">
          {car.instantBook ? <Badge tone="accent" icon="bolt">Instant book</Badge> : null}
          {car.fuel === 'electric' ? <Badge tone="success" icon="bolt">Electric</Badge> : null}
          {car.delivery.offered ? <Badge tone="neutral" icon="truck">Delivery</Badge> : null}
          {host.allStar ? <Badge tone="warn" icon="star">All-star host</Badge> : null}
        </div>
      </div>

      <div className="dr-detail-layout">
        <div className="dr-detail-main">
          <header className="dr-detail-head">
            <div>
              <p className="dr-eyebrow">
                {body?.label} · {car.color.name}
                {car.trim ? ` · ${car.trim}` : ''}
              </p>
              <h1 className="dr-h1">{carTitle(car)}</h1>
              <p className="dr-detail-sub">
                <Stars value={car.rating} size={16} /> <span>({plural(car.reviews.length, 'review')})</span> · {plural(car.tripCount, 'trip')} ·{' '}
                {car.neighborhood}, {cityName(car.city)}
              </p>
            </div>
            <CarTitleActions car={car} />
          </header>

          <ul className="dr-specs" aria-label="Key details">
            <li>
              <Icon name="seat" size={18} />
              <span>{car.seats} seats</span>
            </li>
            <li>
              <Icon name="gear" size={18} />
              <span>{car.transmission === 'manual' ? 'Manual' : 'Automatic'}</span>
            </li>
            <li>
              <Icon name={car.fuel === 'electric' ? 'bolt' : 'fuel'} size={18} />
              <span>{'rangeMiles' in car.efficiency ? `${car.efficiency.rangeMiles} mi range` : `${car.efficiency.mpg} mpg · ${car.fuel}`}</span>
            </li>
            <li>
              <Icon name="map" size={18} />
              <span>{car.milesPerDay} mi/day included</span>
            </li>
            <li>
              <Icon name="calendar" size={18} />
              <span>
                {car.minDays}–{car.maxDays} day trips
              </span>
            </li>
            <li>
              <Icon name="clock" size={18} />
              <span>Listed {formatDate(car.listedAt, true)}</span>
            </li>
          </ul>

          <section className="dr-detail-section" aria-labelledby="dr-about">
            <h2 id="dr-about" className="dr-h2">
              About this car
            </h2>
            <p className="dr-prose">{car.description}</p>
          </section>

          <section className="dr-detail-section" aria-labelledby="dr-feat">
            <h2 id="dr-feat" className="dr-h2">
              Features
            </h2>
            <ul className="dr-features">
              {car.features.map((f) => (
                <li key={f}>
                  <Icon name="check" size={15} /> {FEATURES[f]}
                </li>
              ))}
            </ul>
          </section>

          <section className="dr-detail-section dr-hostcard" aria-labelledby="dr-hostname">
            <div className="dr-hostrow">
              <Avatar name={host.name} size={56} />
              <div>
                <h2 id="dr-hostname" className="dr-h2">
                  Hosted by {host.name}
                </h2>
                <p className="dr-muted">
                  {host.allStar ? 'All-star host · ' : ''}
                  <Stars value={host.rating} /> · {plural(host.trips, 'trip')} · hosting since {host.joined.slice(0, 4)} · replies in about{' '}
                  {host.responseMinutes} min
                </p>
              </div>
            </div>
            <p className="dr-prose">{host.bio}</p>
            <MessageHostButton car={car} host={host} />
          </section>

          <section className="dr-detail-section" aria-labelledby="dr-rules">
            <h2 id="dr-rules" className="dr-h2">
              Guidelines
            </h2>
            <ul className="dr-guidelines">
              {car.guidelines.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <p className="dr-muted dr-small">
              Free cancellation until 24 hours before pickup. {car.delivery.offered ? `Delivery within ${car.delivery.radiusMiles} miles for ${money(car.delivery.feeCents)}.` : 'Pickup in person.'}
            </p>
          </section>

          <section className="dr-detail-section" aria-labelledby="dr-reviews">
            <h2 id="dr-reviews" className="dr-h2">
              {plural(car.reviews.length, 'review')} · <Stars value={car.rating} size={16} />
            </h2>
            <Reviews reviews={car.reviews} />
          </section>
        </div>

        <aside className="dr-detail-side" aria-label="Book this car">
          <Suspense fallback={<div className="dr-bookpanel dr-skeleton" aria-busy="true" />}>
            <BookingPanelFromUrl car={car} />
          </Suspense>
        </aside>
      </div>

      {similar.length ? (
        <section className="dr-section" aria-labelledby="dr-similar">
          <h2 id="dr-similar" className="dr-h2">
            More like this
          </h2>
          <div className="dr-cargrid">
            {similar.map((c) => (
              <CarCard key={c.id} car={c} compact />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
