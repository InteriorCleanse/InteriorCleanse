/** Typed read access to the sample fleet. */

import fleet from '@/content/fleet.json'
import type { Car, City, Host } from './types'

export const cities = fleet.cities as City[]
export const hosts = fleet.hosts as Host[]
export const cars = fleet.cars as Car[]

const carBySlug = new Map(cars.map((c) => [c.slug, c]))
const carById = new Map(cars.map((c) => [c.id, c]))
const hostById = new Map(hosts.map((h) => [h.id, h]))
const cityBySlug = new Map(cities.map((c) => [c.slug, c]))

export const getCar = (slug: string) => carBySlug.get(slug)
export const getCarById = (id: string) => carById.get(id)
export const getCity = (slug: string) => cityBySlug.get(slug)
export const cityName = (slug: string) => cityBySlug.get(slug)?.name ?? slug

export function getHost(id: string): Host {
  const host = hostById.get(id)
  if (!host) throw new Error(`Unknown host ${id}`)
  return host
}

export const carTitle = (c: Pick<Car, 'year' | 'make' | 'model'>) => `${c.year} ${c.make} ${c.model}`

export function featuredCars(): Car[] {
  return cities
    .map((city) => cars.filter((c) => c.city === city.slug).sort((a, b) => b.rating - a.rating || b.tripCount - a.tripCount)[0])
    .filter((c): c is Car => Boolean(c))
}

export function similarCars(car: Car, limit = 4): Car[] {
  const seen = new Set<string>([car.id])
  return [...cars.filter((c) => c.city === car.city), ...cars.filter((c) => c.body === car.body)]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, limit)
}

export function medianRateCents(body?: Car['body'], city?: string): number {
  const pool = cars.filter((c) => (!body || c.body === body) && (!city || c.city === city))
  const rates = (pool.length ? pool : cars).map((c) => c.dailyRateCents).sort((a, b) => a - b)
  return rates[Math.floor(rates.length / 2)]
}

export function countByBody(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of cars) out[c.body] = (out[c.body] ?? 0) + 1
  return out
}
