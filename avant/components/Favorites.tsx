'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useLocal } from '@/lib/store'
import type { Car } from '@/lib/types'
import { RailCard } from './Discover'
import { Icon } from './Icons'
import { useSession } from './Session'

export function Favorites({ cars }: { cars: Car[] }) {
  const { saved, recent, hydrated } = useLocal()
  const { user, loaded } = useSession()
  const pick = (slugs: string[]) => slugs.map((s) => cars.find((c) => c.slug === s)).filter((c): c is Car => Boolean(c))
  const favs = useMemo(() => (hydrated ? pick(saved) : []), [saved, hydrated, cars]) // eslint-disable-line react-hooks/exhaustive-deps
  const viewed = useMemo(() => (hydrated ? pick(recent).filter((c) => !saved.includes(c.slug)) : []), [recent, saved, hydrated, cars]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated) return <div className="skeleton" />

  return (
    <div className="stack" style={{ gap: 0 }}>
      {favs.length ? (
        <section aria-labelledby="fav-list">
          <h2 id="fav-list" style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: 16 }}>
            Saved cars
          </h2>
          <div className="cargrid">
            {favs.map((c) => (
              <RailCard key={c.slug} car={c} />
            ))}
          </div>
          {loaded && !user ? (
            <p className="small muted" style={{ marginTop: 18 }}>
              Saved on this device. <Link href="/signin?next=/favorites" className="link">Sign in</Link> to keep them on every device.
            </p>
          ) : null}
        </section>
      ) : (
        <section aria-labelledby="fav-empty">
          <h2 id="fav-empty" style={{ fontSize: '1.35rem', fontWeight: 600 }}>
            Get started with favorites
          </h2>
          <p className="lead" style={{ marginTop: 10, color: 'var(--ink-2)' }}>
            Tap the heart icon to save your favorite vehicles to a list.
          </p>
          <Link href="/" className="search-pill" style={{ justifyContent: 'center', marginTop: 22, padding: '16px 22px' }}>
            <Icon name="search" size={20} />
            <span style={{ flex: 'none', color: 'var(--text)', fontWeight: 600 }}>Find new favorites</span>
          </Link>
        </section>
      )}

      {viewed.length ? (
        <section aria-labelledby="recent" style={{ marginTop: 44 }}>
          <h2 id="recent" style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: 16 }}>
            Recently viewed
          </h2>
          <div className="cargrid">
            {viewed.map((c) => (
              <RailCard key={c.slug} car={c} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
