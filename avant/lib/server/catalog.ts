/**
 * Every car a guest can see: live listings from hosts, then (only when the
 * sample fleet is switched on) the labelled sample cars. Bookings hold dates
 * on both.
 */

import { cars as samples, cities, getCity } from '@/lib/data'
import type { Car } from '@/lib/types'
import { heldRanges } from './bookings'
import { carBySlug, liveCars } from './listings'

const withHolds = (car: Car, holds: Map<string, { start: string; end: string }[]>): Car =>
  holds.has(car.slug) && car.sample ? { ...car, booked: holds.get(car.slug) } : car

export async function listCars(): Promise<Car[]> {
  const real = await liveCars(cities)
  const holds = samples.length ? await heldRanges(samples.map((c) => c.slug)) : new Map()
  return [...real, ...samples.map((c) => withHolds(c, holds))]
}

export async function findCar(slug: string): Promise<Car | null> {
  const sample = samples.find((c) => c.slug === slug)
  if (sample) return withHolds(sample, await heldRanges([slug]))
  if (!/^[a-z0-9-]{3,120}$/.test(slug)) return null
  return carBySlug(slug, cities)
}

export function taxRateFor(car: Car): number {
  return getCity(car.city)?.taxRate ?? 0
}

export function cityNameFor(car: Car): string {
  return getCity(car.city)?.name ?? car.city
}
