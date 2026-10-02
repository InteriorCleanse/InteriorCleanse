/**
 * Typed read access to listings.
 *
 * Until the listings service exists, the only cars are the sample fleet in
 * content/fleet.json: invented cars, hosts and reviews, with no photos,
 * labelled "Sample" wherever they appear. Set
 * NEXT_PUBLIC_AVANT_SAMPLE_FLEET=0 to hide them entirely (production does).
 */

import fleet from '@/content/fleet.json'
import { cities, SAMPLE_FLEET } from './places'
import type { Car, Host } from './types'

export { carTitle, cities, cityName, getCity, SAMPLE_FLEET } from './places'
export const hosts: Host[] = SAMPLE_FLEET ? (fleet.hosts as Host[]) : []
const hostsById = new Map((fleet.hosts as Host[]).map((h) => [h.id, h]))

/** Sample cars, each with its (equally invented) host embedded. */
export const cars: Car[] = SAMPLE_FLEET
  ? (fleet.cars as unknown as Omit<Car, 'host'>[]).map((c) => ({ ...c, host: hostsById.get(c.hostId) as Host }))
  : []

const carBySlug = new Map(cars.map((c) => [c.slug, c]))
const carById = new Map(cars.map((c) => [c.id, c]))
const hostById = new Map(hosts.map((h) => [h.id, h]))

export const getCar = (slug: string) => carBySlug.get(slug)
export const getCarById = (id: string) => carById.get(id)

export function getHost(id: string): Host {
  const host = hostById.get(id)
  if (!host) throw new Error(`Unknown host ${id}`)
  return host
}


const byRating = (a: Car, b: Car) => b.rating - a.rating || b.tripCount - a.tripCount

/** The best-rated car in each city, topped up with the next best to fill full rows. */
export function featuredCars(count = 8): Car[] {
  const picks = cities.map((city) => cars.filter((c) => c.city === city.slug).sort(byRating)[0]).filter((c): c is Car => Boolean(c))
  const rest = cars.filter((c) => !picks.includes(c)).sort(byRating)
  return [...picks, ...rest].slice(0, Math.max(count, picks.length))
}

export function similarCars(car: Car, limit = 4): Car[] {
  const seen = new Set<string>([car.id])
  return [...cars.filter((c) => c.city === car.city), ...cars.filter((c) => c.body === car.body)]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, limit)
}

/** Median daily rate of listed cars like this one, or null with nothing to compare. */
export function medianRateCents(body?: Car['body'], city?: string): number | null {
  const pool = cars.filter((c) => (!body || c.body === body) && (!city || c.city === city))
  const rates = (pool.length ? pool : cars).map((c) => c.dailyRateCents).sort((a, b) => a - b)
  return rates.length ? rates[Math.floor(rates.length / 2)] : null
}

export function countByBody(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of cars) out[c.body] = (out[c.body] ?? 0) + 1
  return out
}
