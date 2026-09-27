/**
 * Read access to the sample fleet. Importing the JSON at module scope means
 * server components, static params and client code all share one parsed copy.
 */

import fleet from '@/content/drive/fleet.json'
import type { Car, City, Host } from './types'

export const cities: City[] = fleet.cities as City[]
export const hosts: Host[] = fleet.hosts as Host[]
export const cars: Car[] = fleet.cars as Car[]

const carBySlug = new Map(cars.map((c) => [c.slug, c]))
const carById = new Map(cars.map((c) => [c.id, c]))
const hostById = new Map(hosts.map((h) => [h.id, h]))
const cityBySlug = new Map(cities.map((c) => [c.slug, c]))

export function getCar(slug: string): Car | undefined {
  return carBySlug.get(slug)
}

export function getCarById(id: string): Car | undefined {
  return carById.get(id)
}

export function getHost(id: string): Host {
  const host = hostById.get(id)
  if (!host) throw new Error(`Unknown host ${id}`)
  return host
}

export function getCity(slug: string): City | undefined {
  return cityBySlug.get(slug)
}

export function cityName(slug: string): string {
  return cityBySlug.get(slug)?.name ?? slug
}

export function carTitle(car: Pick<Car, 'year' | 'make' | 'model'>): string {
  return `${car.year} ${car.make} ${car.model}`
}

/** Cars for the home page: the best-rated one in each city, in city order. */
export function featuredCars(): Car[] {
  return cities
    .map((city) => cars.filter((c) => c.city === city.slug).sort((a, b) => b.rating - a.rating || b.tripCount - a.tripCount)[0])
    .filter((c): c is Car => Boolean(c))
}

/** Same city first, then same body type anywhere, never the car itself. */
export function similarCars(car: Car, limit = 4): Car[] {
  const sameCity = cars.filter((c) => c.id !== car.id && c.city === car.city)
  const sameBody = cars.filter((c) => c.id !== car.id && c.city !== car.city && c.body === car.body)
  const seen = new Set<string>()
  return [...sameCity, ...sameBody].filter((c) => (seen.has(c.id) ? false : seen.add(c.id))).slice(0, limit)
}

/** Median daily rate for a body type, used by the host earnings estimator. */
export function medianRateCents(body?: Car['body'], city?: string): number {
  const pool = cars.filter((c) => (!body || c.body === body) && (!city || c.city === city))
  const rates = (pool.length ? pool : cars).map((c) => c.dailyRateCents).sort((a, b) => a - b)
  return rates[Math.floor(rates.length / 2)]
}

export function carCountByBody(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const car of cars) counts[car.body] = (counts[car.body] ?? 0) + 1
  return counts
}
