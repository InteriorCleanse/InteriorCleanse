/**
 * The concierge without a model: keyword routing over the same tools and
 * policy text. Deliberately modest; it answers the common questions exactly
 * and says when a human is better.
 */

import { BODY_TYPES } from '../catalog'
import { cities } from '../data'
import { POLICIES, COVERAGE_SUMMARY, type PolicyTopic } from './knowledge'
import { runTool } from './tools'
import type { ConciergeReply } from './concierge'

const TOPIC_WORDS: [PolicyTopic, RegExp][] = [
  ['accident', /\b(accident|crash|injur|hurt|collision)\b/],
  ['cancellation', /\b(cancel|refund)\b/],
  ['young_drivers', /\b(young|under ?25|age|18|19|20|21|22|23|24)\b/],
  ['verification', /\b(verif|licen[cs]e|id\b|identity)\b/],
  ['deposit', /\b(deposit|hold)\b/],
  ['damage_claims', /\b(damage|scratch|dent|claim)\b/],
  ['privacy', /\b(privacy|data|delete|personal)\b/],
  ['delivery', /\b(deliver|airport)\b/],
  ['mileage', /\b(mile|mileage)\b/],
  ['fuel_and_charging', /\b(fuel|gas tank|charg|refuel)\b/],
  ['tolls_and_tickets', /\b(toll|ticket|fine|parking)\b/],
  ['fees', /\b(fee|price|cost|hidden|total)\b/],
]

export function offlineConcierge(message: string): ConciergeReply {
  const m = message.toLowerCase()

  if (/\b(insurance|coverage|protect)/.test(m)) {
    return { text: `Here's coverage in thirty seconds. Pick the most you'd ever pay if the car is damaged:\n${COVERAGE_SUMMARY}`, carSlugs: [], mode: 'offline' }
  }

  const city = cities.find((c) => m.includes(c.name.toLowerCase()) || m.includes(c.slug.replace('-', ' ')))
  const body = BODY_TYPES.find((b) => m.includes(b.id) || m.includes(b.label.toLowerCase()))
  const electric = /\b(electric|ev|tesla)\b/.test(m)
  const price = m.match(/(?:under|below|less than|max)\s*\$?(\d{2,4})/)
  const wantsCars = Boolean(city || body || electric || price) || /\b(car|find|recommend|book|rent|suv|cheap)\b/.test(m)

  for (const [topic, re] of TOPIC_WORDS) {
    if (re.test(m) && !(topic === 'fees' && wantsCars)) {
      return { text: POLICIES[topic], carSlugs: [], mode: 'offline' }
    }
  }

  if (wantsCars) {
    const run = runTool('search_cars', {
      city: city?.slug,
      body: body?.id,
      fuel: electric ? 'electric' : undefined,
      max_price_per_day: price ? Number(price[1]) : undefined,
    })
    const parsed = JSON.parse(run.output) as { count: number; cars: { title: string; all_in_daily: number; city: string }[] }
    if (!parsed.count) {
      return { text: 'Nothing matches that exactly. Try another city or a higher budget, or open Search to use every filter.', carSlugs: [], mode: 'offline' }
    }
    const top = parsed.cars.slice(0, 3).map((c) => `${c.title} in ${c.city}, about $${c.all_in_daily}/day all-in`)
    return {
      text: `Here are a few that fit: ${top.join('; ')}. All-in means rate, trip fee and Plus coverage, before tax. Tap one for exact dates and the full price.`,
      carSlugs: run.carSlugs,
      mode: 'offline',
    }
  }

  return {
    text: `I can find cars ("an SUV in Denver under $90"), explain coverage, the young driver fee, deposits, cancellation or verification. What do you need?`,
    carSlugs: [],
    mode: 'offline',
  }
}
