/**
 * VinAudit Market Value — an official API that prices one car by its VIN from
 * the sales VinAudit has recorded for that vehicle.
 *
 *   GET https://marketvalue.vinaudit.com/getmarketvalue.php?key=…&vin=…&format=json&period=90&mileage=…
 *
 * The answer, as VinAudit documents it: success, vin, vehicle, mileage,
 * count (sales used), mean, stdev, certainty, period [from, to] and
 * prices { average, below, above }. Gavel uses it only when the scan has too
 * few comparables for a car, and only when count reaches the same minimum as
 * any other estimate, so it never shows a number built on one or two sales.
 * Values are public facts about a VIN, so one cache serves every member.
 */
import type { Estimate } from '../types.ts'
import { env } from '../env.ts'
import { config } from '../../config.ts'
import { money } from '../ui.ts'

const BASE = 'https://marketvalue.vinaudit.com/getmarketvalue.php'
const CACHE_MS = 24 * 3600_000
const CACHE_MAX = 2000

export function vinauditConfigured(): boolean {
  return !!env('GAVEL_VINAUDIT_API_KEY')
}

export type MarketValue = { averageUsd: number; belowUsd: number; aboveUsd: number; count: number; certainty?: number; from?: string; to?: string; vehicle?: string; mileage?: number }

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/[$,\s]/g, '')) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** VinAudit's answer to a market value, or undefined when it has none. */
export function parseVinaudit(body: unknown): MarketValue | undefined {
  if (!body || typeof body !== 'object') return undefined
  const b = body as Record<string, unknown>
  if (b.success !== true && b.success !== 'true') return undefined
  const prices = b.prices && typeof b.prices === 'object' ? (b.prices as Record<string, unknown>) : {}
  const averageUsd = num(prices.average) ?? num(b.mean)
  const count = num(b.count)
  if (averageUsd === undefined || averageUsd <= 0 || count === undefined) return undefined
  const period = Array.isArray(b.period) ? b.period.filter((x): x is string => typeof x === 'string') : []
  return {
    averageUsd: Math.round(averageUsd),
    belowUsd: Math.round(num(prices.below) ?? averageUsd),
    aboveUsd: Math.round(num(prices.above) ?? averageUsd),
    count: Math.round(count),
    certainty: num(b.certainty),
    from: period[0],
    to: period[1],
    vehicle: typeof b.vehicle === 'string' ? b.vehicle : undefined,
    mileage: num(b.mileage),
  }
}

/** The market value as a Gavel estimate, when it rests on enough sales. */
export function vinauditEstimate(mv: MarketValue | undefined, minComps = config.scoring.minComps): Estimate | undefined {
  if (!mv || mv.count < minComps) return undefined
  const when = mv.from && mv.to ? ` between ${mv.from} and ${mv.to}` : ''
  const miles = mv.mileage !== undefined ? `, at ${Math.round(mv.mileage).toLocaleString('en-US')} miles` : ''
  return {
    ok: true,
    valueUsd: mv.averageUsd,
    low: Math.min(mv.belowUsd, mv.averageUsd),
    high: Math.max(mv.aboveUsd, mv.averageUsd),
    comps: mv.count,
    method: `VinAudit market value from ${mv.count} recorded sales${when}${miles}; below market ${money(mv.belowUsd)}, above ${money(mv.aboveUsd)}`,
  }
}

const cache = new Map<string, { at: number; value: MarketValue | undefined }>()

/** The market value for a VIN at a mileage (rounded to 5,000 so near-identical asks share a cache entry). */
export async function vinauditValue(vin: string, mileage: number | undefined, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<MarketValue | undefined> {
  if (!vinauditConfigured() || !/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return undefined
  const miles = mileage !== undefined && Number.isFinite(mileage) ? Math.round(mileage / 5000) * 5000 : undefined
  const key = `${vin.toUpperCase()}|${miles ?? ''}`
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  const qs = new URLSearchParams({ key: env('GAVEL_VINAUDIT_API_KEY'), vin: vin.toUpperCase(), format: 'json', period: '90' })
  if (miles !== undefined) qs.set('mileage', String(miles))
  const res = await fetchImpl(`${BASE}?${qs}`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`VinAudit answered HTTP ${res.status}.`)
  const value = parseVinaudit(await res.json())
  cache.delete(key)
  cache.set(key, { at: now, value })
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
  return value
}

/** Tests only. */
export function resetVinauditCache(): void {
  cache.clear()
}
