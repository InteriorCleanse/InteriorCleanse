'use client'

/**
 * The Search tab: a personal greeting, "Search anywhere", category chips and
 * rows of cars that scroll sideways, like the app people already know.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { money } from '@/lib/format'
import { AIRPORTS, cities, milesBetween, nearestCity } from '@/lib/places'
import { offersMonthly, tripTotalCents } from '@/lib/price-view'
import { useLocal } from '@/lib/store'
import type { Car } from '@/lib/types'
import { CarImage } from './CarImage'
import { displayDaily, SaveButton } from './CarCard'
import { useConcierge } from './Concierge'
import { Icon, type IconName } from './Icons'
import { Lockup } from './Logo'
import { useSession } from './Session'

type Cat = 'all' | 'airports' | 'monthly' | 'nearby' | 'delivered' | 'cities'

const CATS: { id: Cat; label: string; icon: IconName }[] = [
  { id: 'all', label: 'All', icon: 'trips' },
  { id: 'airports', label: 'Airports', icon: 'send' },
  { id: 'monthly', label: 'Monthly', icon: 'calendar' },
  { id: 'nearby', label: 'Nearby', icon: 'pin' },
  { id: 'delivered', label: 'Delivered', icon: 'truck' },
  { id: 'cities', label: 'Cities', icon: 'home' },
]

const CITY_KEY = 'avant:city'

function greeting(hour: number) {
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

const byRating = (a: Car, b: Car) => b.rating - a.rating || b.tripCount - a.tripCount

export function RailCard({ car, mode = 'week', distance }: { car: Car; mode?: 'week' | 'month' | 'day'; distance?: number }) {
  const { allIn } = useLocal()
  const isNew = car.tripCount === 0 || car.rating === 0
  return (
    <article className="rail-card">
      <Link href={`/cars/${car.slug}`}>
        <CarImage body={car.body} color={car.color.hex} photo={car.photos[0]} sample={car.sample} alt="" />
        <h3>
          {car.make} {car.model}
        </h3>
        <p className="meta">
          <span>{car.year}</span>
          <span className="dot" />
          {isNew ? (
            <span>New listing</span>
          ) : (
            <span className="stars">
              {car.rating.toFixed(2).replace(/0$/, '')}
              <Icon name="star" size={14} />
              <span className="dim">({car.tripCount})</span>
            </span>
          )}
          {distance !== undefined ? (
            <>
              <span className="dot" />
              <span>{distance < 1 ? '<1' : Math.round(distance)} mi</span>
            </>
          ) : null}
        </p>
        <p className="price">
          {mode === 'month' ? (
            <>
              <strong>{money(tripTotalCents(car, 30))}</strong>/month
            </>
          ) : (
            <>
              <strong>{money(displayDaily(car, allIn))}</strong>/day
              {mode === 'week' ? <small>{money(tripTotalCents(car, 7))} total</small> : null}
            </>
          )}
        </p>
      </Link>
      <SaveButton car={car} />
    </article>
  )
}

function Rail({ title, note, cars, mode, distances }: { title: string; note?: string; cars: Car[]; mode?: 'week' | 'month' | 'day'; distances?: Map<string, number> }) {
  if (!cars.length) return null
  return (
    <section className="rail" aria-label={title}>
      <div className="rail-head">
        <div>
          <h2>{title}</h2>
          {note ? <p>{note}</p> : null}
        </div>
      </div>
      <div className="rail-track">
        {cars.map((c) => (
          <RailCard key={c.slug} car={c} mode={mode} distance={distances?.get(c.slug)} />
        ))}
      </div>
    </section>
  )
}

export function Discover({ cars }: { cars: Car[] }) {
  const { user, loaded } = useSession()
  const { recent, hydrated } = useLocal()
  const { setOpen } = useConcierge()
  const [cat, setCat] = useState<Cat>('all')
  const [hello, setHello] = useState('Welcome')
  // Until the guest picks one, open on the city with the most cars.
  const [city, setCity] = useState(() => {
    const counts = new Map<string, number>()
    for (const c of cars) counts.set(c.city, (counts.get(c.city) ?? 0) + 1)
    return [...cities].sort((a, b) => (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0))[0].slug
  })
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState<'idle' | 'asking' | 'denied'>('idle')

  useEffect(() => {
    setHello(greeting(new Date().getHours()))
    try {
      const saved = localStorage.getItem(CITY_KEY)
      if (saved && cities.some((c) => c.slug === saved)) setCity(saved)
    } catch {
      /* no storage */
    }
  }, [])

  const chooseCity = (slug: string) => {
    setCity(slug)
    try {
      localStorage.setItem(CITY_KEY, slug)
    } catch {
      /* no storage */
    }
  }

  const locate = () => {
    if (!navigator.geolocation) return setLocating('denied')
    setLocating('asking')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const at = { lat: p.coords.latitude, lng: p.coords.longitude }
        setHere(at)
        chooseCity(nearestCity(at).slug)
        setLocating('idle')
      },
      () => setLocating('denied'),
      { maximumAge: 600_000, timeout: 10_000 },
    )
  }

  useEffect(() => {
    if (cat === 'nearby' && !here && locating === 'idle') locate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat])

  const cityLabel = cities.find((c) => c.slug === city)?.name ?? ''
  const inCity = useMemo(() => cars.filter((c) => c.city === city), [cars, city])
  const recentCars = useMemo(() => (hydrated ? recent.map((s) => cars.find((c) => c.slug === s)).filter((c): c is Car => Boolean(c)) : []), [recent, cars, hydrated])
  const fresh = useMemo(() => cars.filter((c) => !c.sample).slice(0, 12), [cars])
  const distances = useMemo(() => (here ? new Map(cars.map((c) => [c.slug, milesBetween(here, c)])) : undefined), [here, cars])
  const nearby = useMemo(() => (distances ? [...cars].sort((a, b) => distances.get(a.slug)! - distances.get(b.slug)!).slice(0, 16) : []), [cars, distances])
  const airport = AIRPORTS.find((a) => a.city === city)

  return (
    <div className="wrap">
      <div className="brand-mobile">
        <Link href="/" className="wordmark" aria-label="AVANT home">
          <Lockup />
        </Link>
      </div>
      <header className="app-head fade-in">
        <h1 className="greeting">
          {hello}
          {loaded && user ? `, ${user.firstName}` : ''}.
        </h1>
        <p>{user ? 'Where to next?' : 'Cars worth remembering, from people who care for them.'}</p>
      </header>

      <div style={{ marginTop: 22 }}>
        <Link href="/search" className="search-pill" aria-label="Search anywhere">
          <span>Search anywhere</span>
          <b>
            <Icon name="search" size={20} />
          </b>
        </Link>
      </div>

      <div className="cats" role="group" aria-label="Browse">
        {CATS.map((c) => (
          <button key={c.id} type="button" className="cat" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
            <Icon name={c.icon} size={18} />
            {c.label}
          </button>
        ))}
      </div>

      {cat !== 'cities' && cat !== 'nearby' ? (
        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          <span className="small muted">Showing</span>
          <select className="select" style={{ width: 'auto', minHeight: 40, padding: '6px 36px 6px 14px', borderRadius: 999 }} value={city} onChange={(e) => chooseCity(e.target.value)} aria-label="City">
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
            <Icon name="sparkle" size={15} /> Ask AVANT
          </button>
        </div>
      ) : null}

      {cat === 'all' ? (
        <>
          <Rail title="Recently viewed" cars={recentCars} />
          <Rail title={`Delivered to you in ${cityLabel}`} note="Average daily prices for a 7-day trip" cars={inCity.filter((c) => c.delivery.offered)} />
          <Rail title={`Monthly rentals in ${cityLabel}`} cars={inCity.filter(offersMonthly)} mode="month" />
          {airport ? <Rail title={`Near ${airport.code} airport`} note={`Delivered to ${airport.name}`} cars={inCity.filter((c) => c.delivery.offered)} /> : null}
          <Rail title="New on AVANT" note="Listed by hosts with their own photos" cars={fresh} />
          <Rail title={`Top rated in ${cityLabel}`} cars={[...inCity].sort(byRating)} />
          {cities
            .filter((c) => c.slug !== city)
            .slice(0, 3)
            .map((c) => (
              <Rail key={c.slug} title={`Popular in ${c.name}`} cars={cars.filter((x) => x.city === c.slug).sort(byRating)} />
            ))}
        </>
      ) : null}

      {cat === 'airports'
        ? AIRPORTS.map((a) => (
            <Rail
              key={a.code}
              title={`${a.name} (${a.code})`}
              note="Delivered to the airport · average daily prices for a 7-day trip"
              cars={cars.filter((c) => c.city === a.city && c.delivery.offered)}
            />
          ))
        : null}

      {cat === 'monthly'
        ? [city, ...cities.map((c) => c.slug).filter((s) => s !== city)].map((slug) => (
            <Rail key={slug} title={`Monthly rentals in ${cities.find((c) => c.slug === slug)?.name}`} cars={cars.filter((c) => c.city === slug && offersMonthly(c))} mode="month" />
          ))
        : null}

      {cat === 'delivered'
        ? [city, ...cities.map((c) => c.slug).filter((s) => s !== city)].map((slug) => (
            <Rail key={slug} title={`Delivered in ${cities.find((c) => c.slug === slug)?.name}`} cars={cars.filter((c) => c.city === slug && c.delivery.offered)} />
          ))
        : null}

      {cat === 'nearby' ? (
        here ? (
          <Rail title="Closest to you" note="Straight-line distance to the car’s area" cars={nearby} distances={distances} />
        ) : (
          <div className="empty">
            <Icon name="pin" size={28} className="dim" />
            <h2>{locating === 'asking' ? 'Finding you…' : 'Cars near you'}</h2>
            <p>{locating === 'denied' ? 'Location is off for this site. Pick a city instead, or allow location in your browser settings.' : 'Allow location to see the closest cars first. It stays on your device.'}</p>
            {locating !== 'asking' ? (
              <button type="button" className="btn btn-primary btn-md" onClick={locate}>
                <Icon name="pin" size={16} /> Use my location
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {cat === 'cities' ? (
        <div className="cities" style={{ marginTop: 28 }}>
          {cities.map((c) => (
            <Link key={c.slug} href={`/search?city=${c.slug}`} className="city-tile">
              <strong>{c.name}</strong>
              <span>
                {c.state}, {cars.filter((x) => x.city === c.slug).length} cars
              </span>
              <Icon name="chevron-right" size={18} />
            </Link>
          ))}
        </div>
      ) : null}

      {!cars.length ? (
        <div className="empty">
          <Icon name="key" size={28} className="dim" />
          <h2>The first cars are on their way</h2>
          <p>AVANT is just opening. If you have a car you love, you could be the first host in your city.</p>
          <Link href="/host/new" className="btn btn-primary btn-md">
            <Icon name="plus" size={16} /> List your car
          </Link>
        </div>
      ) : null}
    </div>
  )
}
