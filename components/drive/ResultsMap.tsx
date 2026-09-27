'use client'

/**
 * A schematic map of the results. It is drawn, not served from a tile
 * provider: no third-party requests, nothing to block, and the pins carry the
 * price so the map answers the question people actually bring to it. The
 * list is the primary view; the map is a second way to point at the same
 * cars, so pins and cards highlight each other.
 */

import { useMemo } from 'react'
import { cities, carTitle } from '@/lib/drive/data'
import { money } from '@/lib/drive/format'
import type { Car, City } from '@/lib/drive/types'

const W = 600
const H = 420
const PAD = 36

function projector(city: City) {
  const [s, w, n, e] = city.bounds
  return (lat: number, lng: number) => ({
    x: PAD + ((lng - w) / (e - w)) * (W - PAD * 2),
    y: PAD + ((n - lat) / (n - s)) * (H - PAD * 2),
  })
}

export function ResultsMap({
  cars,
  citySlug,
  activeId,
  onActivate,
  onSelect,
}: {
  cars: Car[]
  citySlug: string
  activeId: string | null
  onActivate: (id: string | null) => void
  onSelect: (car: Car) => void
}) {
  const city = useMemo(() => cities.find((c) => c.slug === citySlug) ?? null, [citySlug])

  if (!city) {
    return (
      <div className="dr-map dr-map-empty" role="note">
        <p>Choose a city to see the results on the map.</p>
      </div>
    )
  }

  const project = projector(city)
  const pins = cars.filter((c) => c.city === city.slug).map((c) => ({ car: c, ...project(c.lat, c.lng) }))
  const landmarks = city.landmarks.map((l) => ({ ...l, ...project(l.lat, l.lng) }))

  return (
    <figure className="dr-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Schematic map of ${city.name} with ${pins.length} cars`}>
        <defs>
          <pattern id="dr-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M30 0H0V30" fill="none" stroke="currentColor" strokeOpacity="0.08" />
          </pattern>
        </defs>
        <rect width={W} height={H} className="dr-map-ground" />
        <rect width={W} height={H} fill="url(#dr-grid)" />
        {landmarks.map((l) => (
          <g key={l.name} className="dr-map-landmark" transform={`translate(${l.x} ${l.y})`}>
            <circle r="3" />
            <text x="7" y="4">
              {l.name}
            </text>
          </g>
        ))}
        {pins.map(({ car, x, y }) => {
          const active = car.id === activeId
          const label = money(car.dailyRateCents)
          const width = label.length * 8 + 16
          return (
            <g
              key={car.id}
              className="dr-map-pin"
              data-active={active ? 'true' : undefined}
              transform={`translate(${x} ${y})`}
              tabIndex={0}
              role="button"
              aria-label={`${carTitle(car)}, ${label} per day`}
              onMouseEnter={() => onActivate(car.id)}
              onMouseLeave={() => onActivate(null)}
              onFocus={() => onActivate(car.id)}
              onBlur={() => onActivate(null)}
              onClick={() => onSelect(car)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(car)
                }
              }}
            >
              <rect x={-width / 2} y="-26" width={width} height="24" rx="12" />
              <text y="-9" textAnchor="middle">
                {label}
              </text>
              <circle r="3" />
            </g>
          )
        })}
      </svg>
      <figcaption>
        Schematic map of {city.name}. Positions are approximate; the exact pickup spot is shared after booking.
      </figcaption>
    </figure>
  )
}
