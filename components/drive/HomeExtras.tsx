'use client'

/**
 * The parts of the home page and the saved page that depend on this device:
 * recently viewed cars and the saved list.
 */

import { cars, getCarById } from '@/lib/drive/data'
import { DRIVE } from '@/lib/drive/routes'
import { useDriveState } from '@/lib/drive/store'
import { CarCard } from './CarCard'
import { Button, EmptyState, SectionTitle } from './ui'

export function RecentlyViewed() {
  const { recent, hydrated } = useDriveState()
  const items = hydrated ? recent.map(getCarById).filter((c): c is NonNullable<typeof c> => Boolean(c)).slice(0, 4) : []
  if (!items.length) return null
  return (
    <section className="dr-section" aria-labelledby="dr-recent">
      <SectionTitle title={<span id="dr-recent">Recently viewed</span>} sub="Pick up where you left off." />
      <div className="dr-cargrid">
        {items.map((car) => (
          <CarCard key={car.id} car={car} compact />
        ))}
      </div>
    </section>
  )
}

export function SavedList() {
  const { favorites, hydrated } = useDriveState()
  if (!hydrated) return <div className="dr-skeleton dr-skeleton-block" aria-busy="true" />
  const items = favorites.map(getCarById).filter((c): c is NonNullable<typeof c> => Boolean(c))
  if (!items.length) {
    return (
      <EmptyState
        icon="heart"
        title="Nothing saved yet"
        body={`Tap the heart on any of the ${cars.length} cars and it lands here, on this device, no sign-in needed.`}
        action={<Button href={DRIVE.cars} iconAfter="arrow-right">Explore cars</Button>}
      />
    )
  }
  return (
    <div className="dr-cargrid">
      {items.map((car) => (
        <CarCard key={car.id} car={car} />
      ))}
    </div>
  )
}
