'use client'

import Link from 'next/link'
import { FEATURES } from '@/lib/drive/catalog'
import { carTitle, cityName } from '@/lib/drive/data'
import { money, plural } from '@/lib/drive/format'
import { DRIVE } from '@/lib/drive/routes'
import { useDriveActions, useDriveState } from '@/lib/drive/store'
import type { Car } from '@/lib/drive/types'
import { CarArt } from './CarArt'
import { Icon } from './Icons'
import { useToast } from './Toast'
import { Badge, Stars } from './ui'

export function SaveButton({ car, size = 18, labelled = false }: { car: Car; size?: number; labelled?: boolean }) {
  const { favorites } = useDriveState()
  const { toggleFavorite } = useDriveActions()
  const toast = useToast()
  const saved = favorites.includes(car.id)
  return (
    <button
      type="button"
      className={`dr-save${labelled ? ' dr-save-labelled' : ''}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${carTitle(car)} from saved` : `Save ${carTitle(car)}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleFavorite(car.id)
        toast(saved ? 'Removed from saved' : 'Saved', saved ? undefined : { label: 'View saved', onClick: () => (window.location.href = DRIVE.saved) })
      }}
    >
      <Icon name={saved ? 'heart-filled' : 'heart'} size={size} />
      {labelled ? <span>{saved ? 'Saved' : 'Save'}</span> : null}
    </button>
  )
}

export function CarCard({
  car,
  days,
  href,
  highlighted,
  onHover,
  compact = false,
}: {
  car: Car
  /** When the search has dates, the card shows the trip total too. */
  days?: number
  href?: string
  highlighted?: boolean
  onHover?: (id: string | null) => void
  compact?: boolean
}) {
  const title = carTitle(car)
  const topFeatures = car.features.filter((f) => f !== 'bluetooth' && f !== 'usb-charger').slice(0, 3)
  return (
    <article
      className={`dr-carcard${compact ? ' dr-carcard-compact' : ''}`}
      data-highlight={highlighted ? 'true' : undefined}
      onMouseEnter={() => onHover?.(car.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(car.id)}
      onBlur={() => onHover?.(null)}
    >
      <Link href={href ?? DRIVE.car(car.slug)} className="dr-carcard-link">
        <div className="dr-carcard-art" style={{ color: car.color.hex }}>
          <CarArt body={car.body} color={car.color.hex} />
          <div className="dr-carcard-badges">
            {car.instantBook ? <Badge tone="accent" icon="bolt">Instant</Badge> : null}
            {car.fuel === 'electric' ? <Badge tone="success">Electric</Badge> : null}
          </div>
        </div>
        <div className="dr-carcard-body">
          <div className="dr-carcard-head">
            <h3>{title}</h3>
            <Stars value={car.rating} />
          </div>
          <p className="dr-carcard-meta">
            {car.neighborhood}, {cityName(car.city)} · {plural(car.tripCount, 'trip')}
            {car.delivery.offered ? ' · Delivery' : ''}
          </p>
          {!compact ? (
            <ul className="dr-carcard-features" aria-label="Highlights">
              <li>{car.seats} seats</li>
              <li>{car.transmission === 'manual' ? 'Manual' : 'Automatic'}</li>
              {topFeatures.map((f) => (
                <li key={f}>{FEATURES[f]}</li>
              ))}
            </ul>
          ) : null}
          <div className="dr-carcard-price">
            <strong>{money(car.dailyRateCents)}</strong>
            <span>/day</span>
            {days ? <em>{money(car.dailyRateCents * days)} for {plural(days, 'day')}</em> : null}
          </div>
        </div>
      </Link>
      <SaveButton car={car} />
    </article>
  )
}
