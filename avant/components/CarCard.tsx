'use client'

import Link from 'next/link'
import { DEFAULT_COVERAGE, getPlan } from '@/lib/catalog'
import { carTitle, cityName } from '@/lib/data'
import { money } from '@/lib/format'
import { allInDaily } from '@/lib/pricing'
import { actions, useLocal } from '@/lib/store'
import type { Car } from '@/lib/types'
import { CarImage } from './CarImage'
import { Icon } from './Icons'
import { useToast } from './Toast'
import { Stars } from './ui'

const plan = getPlan(DEFAULT_COVERAGE)

export function displayDaily(car: Car, allIn: boolean): number {
  return allIn ? allInDaily(car.dailyRateCents, plan.pctOfTrip, plan.minPerDayCents) : car.dailyRateCents
}

export function SaveButton({ car, labelled = false }: { car: Car; labelled?: boolean }) {
  const { saved } = useLocal()
  const toast = useToast()
  const on = saved.includes(car.id)
  return (
    <button
      type="button"
      className={labelled ? 'btn btn-secondary btn-sm' : 'save-btn'}
      aria-pressed={on}
      aria-label={labelled ? undefined : on ? `Remove ${carTitle(car)} from saved` : `Save ${carTitle(car)}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        actions.toggleSaved(car.id)
        toast(on ? 'Removed from saved' : 'Saved. We’ll flag price drops.')
      }}
    >
      <Icon name={on ? 'heart-filled' : 'heart'} size={17} />
      {labelled ? (on ? 'Saved' : 'Save') : null}
    </button>
  )
}

export function CarCard({
  car,
  days,
  active,
  onHover,
  href,
  priority,
}: {
  car: Car
  days?: number
  active?: boolean
  onHover?: (id: string | null) => void
  href?: string
  priority?: boolean
}) {
  const { allIn } = useLocal()
  const daily = displayDaily(car, allIn)
  return (
    <article
      className="carcard"
      data-active={active ? 'true' : undefined}
      onMouseEnter={() => onHover?.(car.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(car.id)}
      onBlur={() => onHover?.(null)}
    >
      <Link href={href ?? `/cars/${car.slug}`} className="carcard-link">
        <div className="carcard-badges">
          {car.instantBook ? (
            <span className="badge badge-glass">
              <Icon name="bolt" size={12} /> Instant
            </span>
          ) : null}
          {car.fuel === 'electric' ? <span className="badge badge-glass">EV</span> : null}
        </div>
        <CarImage body={car.body} slug={car.slug} color={car.color.hex} alt="" priority={priority} />
        <div className="carcard-body">
          <div className="carcard-title">
            <h3>{carTitle(car)}</h3>
          </div>
          <p className="carcard-meta row" style={{ gap: 6 }}>
            <Stars value={car.rating} />
            <span>({car.tripCount} trips)</span>
          </p>
          <p className="carcard-meta row" style={{ gap: 4 }}>
            <Icon name="map" size={14} />
            <span>
              {car.neighborhood}, {cityName(car.city)}
              {car.delivery.offered ? <span className="dim">{' · Delivers'}</span> : null}
            </span>
          </p>
          <p className="carcard-price">
            <strong>{money(daily)}</strong>
            <span>/day</span>
            {allIn ? <span className="allin">All-in</span> : null}
            {days ? <em>{money(daily * days)} total</em> : null}
          </p>
        </div>
      </Link>
      <SaveButton car={car} />
    </article>
  )
}
