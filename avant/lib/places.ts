/**
 * Cities and airports AVANT serves, plus small display helpers. Safe to
 * import anywhere: it does not pull listings into the browser bundle.
 */

import citiesJson from '@/content/cities.json'
import type { Car, City } from './types'

/** Sample listings on? Off in production (NEXT_PUBLIC_AVANT_SAMPLE_FLEET=0). */
export const SAMPLE_FLEET = process.env.NEXT_PUBLIC_AVANT_SAMPLE_FLEET !== '0'

export const cities = citiesJson as City[]

const bySlug = new Map(cities.map((c) => [c.slug, c]))
export const getCity = (slug: string) => bySlug.get(slug)
export const cityName = (slug: string) => bySlug.get(slug)?.name ?? slug

export const carTitle = (c: Pick<Car, 'year' | 'make' | 'model'>) => `${c.year} ${c.make} ${c.model}`
export const carName = (c: Pick<Car, 'make' | 'model'>) => `${c.make} ${c.model}`

export interface Airport {
  code: string
  name: string
  city: string
  lat: number
  lng: number
}

export const AIRPORTS: Airport[] = [
  { code: 'SFO', name: 'San Francisco International', city: 'san-francisco', lat: 37.6213, lng: -122.379 },
  { code: 'LAX', name: 'Los Angeles International', city: 'los-angeles', lat: 33.9416, lng: -118.4085 },
  { code: 'AUS', name: 'Austin–Bergstrom International', city: 'austin', lat: 30.1975, lng: -97.6664 },
  { code: 'DEN', name: 'Denver International', city: 'denver', lat: 39.8561, lng: -104.6737 },
  { code: 'MIA', name: 'Miami International', city: 'miami', lat: 25.7959, lng: -80.287 },
  { code: 'SEA', name: 'Seattle–Tacoma International', city: 'seattle', lat: 47.4502, lng: -122.3088 },
]

/** Great-circle distance in miles. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

export function nearestCity(at: { lat: number; lng: number }): City {
  return [...cities].sort((x, y) => milesBetween(at, x) - milesBetween(at, y))[0]
}
