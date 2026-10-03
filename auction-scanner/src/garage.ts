/**
 * THE GARAGE — the business ledger. Cars you actually bought, every dollar
 * that went into each one, and every dollar that came out: a sale, or rental
 * income. Net per car and overall.
 *
 * Only what the member types in. Gavel never fills in a price, a cost or an
 * income; a blank is a blank. Kept per member in garage.json.
 */
import { randomUUID } from 'node:crypto'
import { readJson, userFile, writeJson } from './store.ts'
import { companyExists } from './companies.ts'

export type Money = { id: string; date: number; usd: number; label: string }
export type CarStatus = 'owned' | 'fixing' | 'listed' | 'rented' | 'sold'

export type GarageCar = {
  id: string
  title: string
  year?: number
  make?: string
  model?: string
  vin?: string
  /** The company whose books it belongs in (companies.json); none yet when absent. */
  companyId?: string
  /** What you planned to sell it for, for the P/L. */
  targetSaleUsd?: number
  /** Materials ticked done on its checklist (ids from src/materials.ts). */
  materialsDone?: string[]
  mileage?: number
  /** Where it was bought: an auction house id or free text. */
  boughtFrom?: string
  boughtAt: number
  purchaseUsd: number
  /** Buyer fee, transport, parts, labour, registration, insurance, storage… */
  costs: Money[]
  /** Rental payouts, or the sale itself (label "Sale"). */
  income: Money[]
  status: CarStatus
  soldAt?: number
  /** Where it is listed or rented, free text (Turo, Facebook Marketplace…). */
  channel?: string
  notes?: string
  createdAt: number
  updatedAt: number
}

export type CarTotals = { spentUsd: number; incomeUsd: number; netUsd: number; daysOwned: number }
export type GarageSummary = { cars: number; active: number; sold: number; spentUsd: number; incomeUsd: number; netUsd: number; bestNetUsd?: number; bestTitle?: string }

const FILE = 'garage.json'
const STATUSES = new Set<CarStatus>(['owned', 'fixing', 'listed', 'rented', 'sold'])
const DAY = 86_400_000

function read(): GarageCar[] {
  const v = readJson<unknown>(userFile(FILE), [])
  return Array.isArray(v) ? (v as GarageCar[]) : []
}

function write(cars: GarageCar[]): void {
  writeJson(userFile(FILE), cars)
}

function money(v: unknown, name: string, min = 0, max = 10_000_000): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a dollar amount between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`)
  return Math.round(n * 100) / 100
}

function text(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
}

function company(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !companyExists(v)) throw new Error('That company does not exist. Add it under Business first.')
  return v
}

function date(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === '') return fallback
  const n = typeof v === 'number' ? v : Date.parse(String(v))
  if (!Number.isFinite(n) || n < Date.UTC(1990, 0, 1) || n > Date.now() + 366 * DAY) throw new Error('That date does not look right. Use a date like 2026-09-28.')
  return n
}

export function listGarage(): GarageCar[] {
  return read().sort((a, b) => b.boughtAt - a.boughtAt)
}

export function totalsFor(c: GarageCar, now = Date.now()): CarTotals {
  const spent = c.purchaseUsd + c.costs.reduce((s, m) => s + m.usd, 0)
  const income = c.income.reduce((s, m) => s + m.usd, 0)
  const end = c.status === 'sold' && c.soldAt ? c.soldAt : now
  return { spentUsd: Math.round(spent * 100) / 100, incomeUsd: Math.round(income * 100) / 100, netUsd: Math.round((income - spent) * 100) / 100, daysOwned: Math.max(0, Math.floor((end - c.boughtAt) / DAY)) }
}

export function garageSummary(now = Date.now()): GarageSummary {
  const cars = read()
  const out: GarageSummary = { cars: cars.length, active: 0, sold: 0, spentUsd: 0, incomeUsd: 0, netUsd: 0 }
  for (const c of cars) {
    const t = totalsFor(c, now)
    if (c.status === 'sold') out.sold++
    else out.active++
    out.spentUsd += t.spentUsd
    out.incomeUsd += t.incomeUsd
    out.netUsd += t.netUsd
    if (c.status === 'sold' && (out.bestNetUsd === undefined || t.netUsd > out.bestNetUsd)) {
      out.bestNetUsd = t.netUsd
      out.bestTitle = c.title
    }
  }
  out.spentUsd = Math.round(out.spentUsd * 100) / 100
  out.incomeUsd = Math.round(out.incomeUsd * 100) / 100
  out.netUsd = Math.round(out.netUsd * 100) / 100
  return out
}

/** Add a car you bought. Title and purchase price are required; everything else is optional. */
export function addCar(input: unknown, now = Date.now()): GarageCar {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const title = text(p.title, 120)
  if (!title) throw new Error('Give the car a name, for example "2017 Toyota Camry SE".')
  const yearN = p.year === undefined || p.year === '' ? undefined : Number(p.year)
  if (yearN !== undefined && (!Number.isInteger(yearN) || yearN < 1950 || yearN > 2050)) throw new Error('The year must be between 1950 and 2050.')
  const vin = text(p.vin, 17)?.toUpperCase()
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new Error('A VIN is 17 letters and digits, with no I, O or Q.')
  const car: GarageCar = {
    id: randomUUID(),
    title,
    year: yearN,
    make: text(p.make, 40),
    model: text(p.model, 60),
    vin,
    boughtFrom: text(p.boughtFrom, 80),
    companyId: company(p.companyId),
    mileage: p.mileage === undefined || p.mileage === '' ? undefined : money(p.mileage, 'The miles', 0, 2_000_000),
    targetSaleUsd: p.targetSaleUsd === undefined || p.targetSaleUsd === '' ? undefined : money(p.targetSaleUsd, 'The target sale price', 1),
    boughtAt: date(p.boughtAt, now),
    purchaseUsd: money(p.purchaseUsd, 'The purchase price', 1),
    costs: [],
    income: [],
    status: 'owned',
    channel: text(p.channel, 80),
    notes: text(p.notes, 2000),
    createdAt: now,
    updatedAt: now,
  }
  const cars = read()
  if (cars.length >= 200) throw new Error('The garage holds 200 cars. Remove a sold one first.')
  write([...cars, car])
  return car
}

function mutate(id: string, fn: (c: GarageCar) => void, now = Date.now()): GarageCar {
  const cars = read()
  const car = cars.find((c) => c.id === id)
  if (!car) throw new Error('No car with that id in your garage.')
  fn(car)
  car.updatedAt = now
  write(cars)
  return car
}

/** Change the status, channel, notes or sale date. */
export function updateCar(id: string, input: unknown, now = Date.now()): GarageCar {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return mutate(id, (c) => {
    if ('status' in p) {
      if (typeof p.status !== 'string' || !STATUSES.has(p.status as CarStatus)) throw new Error('Status must be owned, fixing, listed, rented or sold.')
      c.status = p.status as CarStatus
      if (c.status === 'sold' && !c.soldAt) c.soldAt = now
      if (c.status !== 'sold') delete c.soldAt
    }
    if ('soldAt' in p && c.status === 'sold') c.soldAt = date(p.soldAt, now)
    if ('channel' in p) c.channel = text(p.channel, 80)
    if ('notes' in p) c.notes = text(p.notes, 2000)
    if ('purchaseUsd' in p) c.purchaseUsd = money(p.purchaseUsd, 'The purchase price', 1)
    if ('companyId' in p) c.companyId = company(p.companyId)
    if ('targetSaleUsd' in p) c.targetSaleUsd = p.targetSaleUsd === null || p.targetSaleUsd === '' ? undefined : money(p.targetSaleUsd, 'The target sale price', 1)
    if ('mileage' in p) c.mileage = p.mileage === null || p.mileage === '' ? undefined : money(p.mileage, 'The miles', 0, 2_000_000)
    if ('materialsDone' in p) {
      if (!Array.isArray(p.materialsDone) || p.materialsDone.length > 50 || !p.materialsDone.every((x) => typeof x === 'string' && /^[a-zA-Z]{1,24}$/.test(x))) throw new Error('The checklist must be a list of material ids.')
      c.materialsDone = [...new Set(p.materialsDone as string[])]
    }
  }, now)
}

function entry(input: unknown, now: number, what: string): Money {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const label = text(p.label, 80)
  if (!label) throw new Error(`Say what the ${what} was for, for example "Tyres" or "Turo payout".`)
  return { id: randomUUID(), date: date(p.date, now), usd: money(p.usd, 'The amount', 0.01), label }
}

export function addCost(id: string, input: unknown, now = Date.now()): GarageCar {
  return mutate(id, (c) => { c.costs.push(entry(input, now, 'cost')) }, now)
}

/** Add income. A label of "Sale" also marks the car sold on that date. */
export function addIncome(id: string, input: unknown, now = Date.now()): GarageCar {
  return mutate(id, (c) => {
    const m = entry(input, now, 'income')
    c.income.push(m)
    if (/^sale$/i.test(m.label)) {
      c.status = 'sold'
      c.soldAt = m.date
    }
  }, now)
}

export function removeEntry(id: string, entryId: string, now = Date.now()): GarageCar {
  return mutate(id, (c) => {
    const before = c.costs.length + c.income.length
    c.costs = c.costs.filter((m) => m.id !== entryId)
    c.income = c.income.filter((m) => m.id !== entryId)
    if (c.costs.length + c.income.length === before) throw new Error('No entry with that id on this car.')
  }, now)
}

/** A company was removed: its cars stay, with no company. */
export function unassignCompany(companyId: string): number {
  const cars = read()
  let n = 0
  for (const c of cars) if (c.companyId === companyId) { delete c.companyId; n++ }
  if (n) write(cars)
  return n
}

export function removeCar(id: string): boolean {
  const cars = read()
  const next = cars.filter((c) => c.id !== id)
  if (next.length === cars.length) return false
  write(next)
  return true
}

/** Check a garage file from a backup. Throws on the first bad car. */
export function validateGarageFile(v: unknown): GarageCar[] {
  if (!Array.isArray(v)) throw new Error('garage must be a list.')
  return v.map((c, i) => {
    if (!c || typeof c !== 'object') throw new Error(`garage[${i}] is not a car.`)
    const car = c as GarageCar
    if (typeof car.id !== 'string' || typeof car.title !== 'string' || typeof car.purchaseUsd !== 'number' || !Array.isArray(car.costs) || !Array.isArray(car.income) || !STATUSES.has(car.status)) throw new Error(`garage[${i}] is missing a field.`)
    return car
  })
}
