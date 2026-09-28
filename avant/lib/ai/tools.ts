/**
 * The concierge's tools. Each reads AVANT's own data and returns JSON; none
 * can change anything, so a manipulated tool call can at worst return a
 * search result.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { BODY_TYPES, DEFAULT_COVERAGE, FUELS, getPlan } from '../catalog'
import { carTitle, cars, cities, cityName, getCar, getCity } from '../data'
import { billableDays, isIsoDate, todayIso } from '../dates'
import { youngDriverFee } from '../eligibility'
import { allInDaily, quote } from '../pricing'
import { EMPTY_SEARCH, applySearch } from '../search'
import type { CoverageId } from '../types'
import { COVERAGE_SUMMARY, POLICIES, POLICY_TOPICS } from './knowledge'

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_cars',
    description:
      'Search AVANT inventory. Use for any request to find, compare or recommend cars. Returns up to 6 cars with all-in daily price (rate + trip fee + default coverage, before tax).',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        city: { type: 'string', enum: cities.map((c) => c.slug), description: 'City slug.' },
        start: { type: 'string', description: 'Pickup date YYYY-MM-DD.' },
        end: { type: 'string', description: 'Return date YYYY-MM-DD.' },
        max_price_per_day: { type: 'number', description: 'Maximum base daily rate in US dollars.' },
        body: { type: 'string', enum: BODY_TYPES.map((b) => b.id) },
        fuel: { type: 'string', enum: FUELS.map((f) => f.id) },
        seats_min: { type: 'integer', minimum: 2, maximum: 9 },
        instant_book: { type: 'boolean' },
        query: { type: 'string', description: 'Free text such as a make or model.' },
      },
    },
  },
  {
    name: 'quote_trip',
    description: 'Exact itemised price for one car and date range, including coverage, fees, taxes and any young driver fee.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['slug', 'start', 'end'],
      properties: {
        slug: { type: 'string', description: 'Car slug from search_cars.' },
        start: { type: 'string', description: 'YYYY-MM-DD' },
        end: { type: 'string', description: 'YYYY-MM-DD' },
        coverage: { type: 'string', enum: ['zero', 'plus', 'essential'] },
        driver_age: { type: 'integer', minimum: 16, maximum: 100, description: 'Only if the guest volunteered it.' },
      },
    },
  },
  {
    name: 'explain_coverage',
    description: 'The three coverage plans in plain English.',
    input_schema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'policy',
    description: 'AVANT policy on one topic. Use before answering any policy question so the answer matches the site exactly.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['topic'],
      properties: { topic: { type: 'string', enum: [...POLICY_TOPICS] } },
    },
  },
]

const SearchInput = z.object({
  city: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  max_price_per_day: z.number().positive().max(10_000).optional(),
  body: z.enum(BODY_TYPES.map((b) => b.id) as [string, ...string[]]).optional(),
  fuel: z.enum(['gas', 'hybrid', 'electric']).optional(),
  seats_min: z.number().int().min(2).max(9).optional(),
  instant_book: z.boolean().optional(),
  query: z.string().max(80).optional(),
})

const QuoteInput = z.object({
  slug: z.string().max(120),
  start: z.string(),
  end: z.string(),
  coverage: z.enum(['zero', 'plus', 'essential']).optional(),
  driver_age: z.number().int().min(16).max(100).optional(),
})

export interface ToolRun {
  output: string
  carSlugs: string[]
  isError: boolean
}

export function runTool(name: string, rawInput: unknown): ToolRun {
  const plan = getPlan(DEFAULT_COVERAGE)
  try {
    if (name === 'search_cars') {
      const i = SearchInput.parse(rawInput)
      const dated = i.start && i.end && isIsoDate(i.start) && isIsoDate(i.end)
      const results = applySearch(
        cars,
        {
          ...EMPTY_SEARCH,
          city: i.city && getCity(i.city) ? i.city : '',
          start: dated ? i.start! : '',
          end: dated ? i.end! : '',
          maxCents: i.max_price_per_day ? Math.round(i.max_price_per_day * 100) : null,
          bodies: i.body ? [i.body as never] : [],
          fuels: i.fuel ? [i.fuel] : [],
          minSeats: i.seats_min ?? null,
          instantBook: Boolean(i.instant_book),
          q: i.query ?? '',
          sort: 'relevance',
        },
        cityName,
        todayIso(),
      ).slice(0, 6)
      return {
        output: JSON.stringify({
          count: results.length,
          cars: results.map((c) => ({
            slug: c.slug,
            title: carTitle(c),
            city: cityName(c.city),
            neighborhood: c.neighborhood,
            daily_rate: c.dailyRateCents / 100,
            all_in_daily: Math.round(allInDaily(c.dailyRateCents, plan.pctOfTrip, plan.minPerDayCents) / 100),
            seats: c.seats,
            fuel: c.fuel,
            rating: c.rating,
            trips: c.tripCount,
            instant_book: c.instantBook,
            delivery: c.delivery.offered,
            class: c.valueTier,
          })),
        }),
        carSlugs: results.map((c) => c.slug),
        isError: false,
      }
    }
    if (name === 'quote_trip') {
      const i = QuoteInput.parse(rawInput)
      const car = getCar(i.slug)
      if (!car) return { output: 'No car with that slug. Use search_cars first.', carSlugs: [], isError: true }
      if (!isIsoDate(i.start) || !isIsoDate(i.end) || i.end < i.start) {
        return { output: 'Dates must be YYYY-MM-DD with the return on or after pickup.', carSlugs: [], isError: true }
      }
      const days = billableDays(i.start, '10:00', i.end, '10:00')
      const coverage = getPlan((i.coverage ?? DEFAULT_COVERAGE) as CoverageId)
      const q = quote({
        dailyRateCents: car.dailyRateCents,
        days,
        weeklyDiscountPct: car.weeklyDiscountPct,
        monthlyDiscountPct: car.monthlyDiscountPct,
        plan: coverage,
        delivery: false,
        deliveryFeeCents: 0,
        extras: [],
        taxRate: getCity(car.city)?.taxRate ?? 0,
        youngDriverFeeCents: youngDriverFee(i.driver_age ?? null, days, false),
      })
      return {
        output: JSON.stringify({
          car: carTitle(car),
          days,
          coverage: coverage.name,
          lines: q.lines.map((l) => ({ item: l.label, usd: l.cents / 100 })),
          total_usd: q.totalCents / 100,
          refundable_deposit_usd: q.depositCents / 100,
          min_driver_age: car.valueTier === 'everyday' ? 18 : car.valueTier === 'premium' ? 21 : 25,
        }),
        carSlugs: [car.slug],
        isError: false,
      }
    }
    if (name === 'explain_coverage') return { output: COVERAGE_SUMMARY, carSlugs: [], isError: false }
    if (name === 'policy') {
      const topic = z.object({ topic: z.enum(POLICY_TOPICS) }).parse(rawInput).topic
      return { output: POLICIES[topic], carSlugs: [], isError: false }
    }
    return { output: `Unknown tool ${name}`, carSlugs: [], isError: true }
  } catch (err) {
    return { output: `Invalid input: ${err instanceof Error ? err.message.slice(0, 300) : 'unknown'}`, carSlugs: [], isError: true }
  }
}
