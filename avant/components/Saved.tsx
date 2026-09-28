'use client'

import { getCarById } from '@/lib/data'
import { useLocal } from '@/lib/store'
import { CarCard } from './CarCard'
import { ButtonLink, Empty } from './ui'

export function SavedList() {
  const { saved, recent, hydrated } = useLocal()
  if (!hydrated) return <div className="skeleton" />
  const cars = saved.map(getCarById).filter((c): c is NonNullable<typeof c> => Boolean(c))
  const seen = recent.map(getCarById).filter((c): c is NonNullable<typeof c> => Boolean(c) && !saved.includes(c!.id))
  return (
    <div className="stack" style={{ gap: 48 }}>
      {cars.length ? (
        <div className="cargrid">{cars.map((c) => <CarCard key={c.id} car={c} />)}</div>
      ) : (
        <Empty icon="heart" title="Nothing saved yet" body="Tap the heart on any car. It stays on this device, no sign-in needed." action={<ButtonLink href="/search" iconAfter="arrow-right">Explore cars</ButtonLink>} />
      )}
      {seen.length ? (
        <section>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 16 }}>Recently viewed</h2>
          <div className="cargrid">{seen.map((c) => <CarCard key={c.id} car={c} />)}</div>
        </section>
      ) : null}
    </div>
  )
}
