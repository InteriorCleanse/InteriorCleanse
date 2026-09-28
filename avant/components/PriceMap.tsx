'use client'

/**
 * The map: every result is a price pin, the pin you hover in the list lights
 * up, and tapping a pin previews the car without leaving the map.
 *
 * Real vector map via MapLibre GL on OpenFreeMap's free tiles (no key, no
 * tracking). If WebGL or the tiles are unavailable, it falls back to a drawn
 * schematic of the city with the same pins, so the map never goes blank.
 */

import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cities, carTitle } from '@/lib/data'
import { money } from '@/lib/format'
import type { Car, City } from '@/lib/types'
import { CarCard, displayDaily } from './CarCard'
import { useLocal } from '@/lib/store'

const STYLE = 'https://tiles.openfreemap.org/styles/dark'

type MapLib = typeof import('maplibre-gl')

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function PriceMap({
  cars,
  focusCity,
  activeId,
  onActivate,
}: {
  cars: Car[]
  focusCity: string
  activeId: string | null
  onActivate: (id: string | null) => void
}) {
  const { allIn } = useLocal()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<import('maplibre-gl').Map | null>(null)
  const markers = useRef(new Map<string, { marker: import('maplibre-gl').Marker; el: HTMLButtonElement }>())
  const [mode, setMode] = useState<'loading' | 'map' | 'schematic'>('loading')
  const [preview, setPreview] = useState<Car | null>(null)
  const libRef = useRef<MapLib | null>(null)

  const city: City | null = useMemo(() => {
    if (focusCity) return cities.find((c) => c.slug === focusCity) ?? null
    const counts = new Map<string, number>()
    for (const c of cars) counts.set(c.city, (counts.get(c.city) ?? 0) + 1)
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return cities.find((c) => c.slug === top) ?? cities[0]
  }, [cars, focusCity])

  // Boot the real map once.
  useEffect(() => {
    if (!box.current || !hasWebGL()) {
      setMode('schematic')
      return
    }
    let cancelled = false
    const pins = markers.current
    const fallback = window.setTimeout(() => !cancelled && mode !== 'map' && setMode('schematic'), 7000)
    import('maplibre-gl')
      .then((lib) => {
        if (cancelled || !box.current) return
        libRef.current = lib
        // Served from public/maplibre by scripts/copy-map-worker.mjs.
        lib.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
        const m = new lib.Map({
          container: box.current,
          style: STYLE,
          center: [city?.lng ?? -98, city?.lat ?? 39],
          zoom: city ? 11 : 3,
          attributionControl: { compact: true },
          cooperativeGestures: false,
        })
        m.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right')
        m.on('load', () => {
          if (cancelled) return
          window.clearTimeout(fallback)
          setMode('map')
        })
        m.on('error', (e) => {
          const msg = String(e.error?.message ?? '')
          if (/style|Failed to fetch|NetworkError/i.test(msg) && !m.loaded()) setMode('schematic')
        })
        map.current = m
      })
      .catch(() => setMode('schematic'))
    return () => {
      cancelled = true
      window.clearTimeout(fallback)
      map.current?.remove()
      map.current = null
      pins.clear()
    }
    // Booting once is intentional; city changes pan the existing map below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Once we fall back to the schematic, tear the WebGL map down so it stops
  // retrying tiles in the background.
  useEffect(() => {
    if (mode !== 'schematic' || !map.current) return
    map.current.remove()
    map.current = null
    markers.current.clear()
  }, [mode])

  // Sync pins with results.
  useEffect(() => {
    const m = map.current
    const lib = libRef.current
    if (mode !== 'map' || !m || !lib) return
    const keep = new Set(cars.map((c) => c.id))
    for (const [id, { marker }] of markers.current) {
      if (!keep.has(id)) {
        marker.remove()
        markers.current.delete(id)
      }
    }
    for (const car of cars) {
      const label = money(displayDaily(car, allIn))
      const existing = markers.current.get(car.id)
      if (existing) {
        existing.el.textContent = label
        continue
      }
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'pin'
      el.textContent = label
      el.setAttribute('aria-label', `${carTitle(car)}, ${label} a day`)
      el.addEventListener('mouseenter', () => onActivate(car.id))
      el.addEventListener('mouseleave', () => onActivate(null))
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        setPreview(car)
      })
      const marker = new lib.Marker({ element: el, anchor: 'bottom' }).setLngLat([car.lng, car.lat]).addTo(m)
      markers.current.set(car.id, { marker, el })
    }
    const inCity = cars.filter((c) => !city || c.city === city.slug)
    if (inCity.length) {
      const b = new lib.LngLatBounds()
      inCity.forEach((c) => b.extend([c.lng, c.lat]))
      m.fitBounds(b, { padding: 70, maxZoom: 13, duration: 600 })
    } else if (city) {
      m.flyTo({ center: [city.lng, city.lat], zoom: 11 })
    }
  }, [cars, mode, city, allIn, onActivate])

  // Highlight.
  useEffect(() => {
    for (const [id, { el }] of markers.current) {
      if (id === activeId) el.dataset.active = 'true'
      else delete el.dataset.active
    }
  }, [activeId])

  return (
    <div className="map" aria-label="Map of results">
      <div ref={box} className="map-canvas" hidden={mode === 'schematic'} />
      {mode === 'schematic' && city ? (
        <Schematic city={city} cars={cars.filter((c) => c.city === city.slug)} activeId={activeId} onActivate={onActivate} onSelect={setPreview} allIn={allIn} />
      ) : null}
      {mode === 'loading' ? <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} aria-hidden="true" /> : null}
      <span className="map-note">{mode === 'schematic' ? `Schematic of ${city?.name}. ` : ''}Exact pickup spot shared after booking.</span>
      {preview ? (
        <div className="map-preview">
          <button type="button" className="icon-btn" style={{ position: 'absolute', right: 6, top: 6, zIndex: 3, background: 'rgba(7,8,10,.7)' }} aria-label="Close preview" onClick={() => setPreview(null)}>
            ×
          </button>
          <CarCard car={preview} />
        </div>
      ) : null}
    </div>
  )
}

function Schematic({
  city,
  cars,
  activeId,
  onActivate,
  onSelect,
  allIn,
}: {
  city: City
  cars: Car[]
  activeId: string | null
  onActivate: (id: string | null) => void
  onSelect: (car: Car) => void
  allIn: boolean
}) {
  const [s, w, n, e] = city.bounds
  const pos = (lat: number, lng: number) => ({ left: `${6 + ((lng - w) / (e - w)) * 88}%`, top: `${8 + ((n - lat) / (n - s)) * 84}%` })
  return (
    <div className="schematic">
      <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
        <defs>
          <pattern id="g" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M5 0H0V5" fill="none" stroke="rgba(242,242,238,.05)" strokeWidth=".2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#g)" />
      </svg>
      {city.landmarks.map((l) => (
        <span key={l.name} className="small dim" style={{ position: 'absolute', ...pos(l.lat, l.lng), transform: 'translate(-50%,-50%)' }}>
          · {l.name}
        </span>
      ))}
      {cars.map((car) => (
        <button
          key={car.id}
          type="button"
          className="pin"
          data-active={car.id === activeId ? 'true' : undefined}
          style={pos(car.lat, car.lng)}
          aria-label={`${carTitle(car)}, ${money(displayDaily(car, allIn))} a day`}
          onMouseEnter={() => onActivate(car.id)}
          onMouseLeave={() => onActivate(null)}
          onFocus={() => onActivate(car.id)}
          onBlur={() => onActivate(null)}
          onClick={() => onSelect(car)}
        >
          {money(displayDaily(car, allIn))}
        </button>
      ))}
    </div>
  )
}
