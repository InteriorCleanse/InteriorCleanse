import { getPlan, DEFAULT_COVERAGE } from './catalog'
import { carTitle, cityName } from './data'
import { allInDaily } from './pricing'
import type { Car } from './types'

/** The small, public shape of a car for chat cards. */
export function toCardData(c: Car) {
  const plan = getPlan(DEFAULT_COVERAGE)
  return {
    slug: c.slug,
    title: carTitle(c),
    city: cityName(c.city),
    body: c.body,
    image: c.image,
    rating: c.rating,
    allInDailyCents: allInDaily(c.dailyRateCents, plan.pctOfTrip, plan.minPerDayCents),
  }
}

export type CardData = ReturnType<typeof toCardData>
