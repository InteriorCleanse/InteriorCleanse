/**
 * THE BUSINESS REPORT — profit per company and overall, from the Garage and
 * the companies' overhead. Pure arithmetic on what the member typed in:
 * nothing estimated, nothing filled in.
 *
 *   net       = income − (purchases + car costs) − overhead
 *   realised  = net on the cars already sold (the money that came back)
 *   in cars   = what is still out in cars not sold yet (spent − income, per car)
 *
 * Money is counted on the date it moved, so the months add up to the total.
 */
import type { Company } from './companies.ts'
import type { GarageCar } from './garage.ts'
import { totalsFor } from './garage.ts'

export type Stats = {
  cars: number
  active: number
  sold: number
  carSpendUsd: number
  overheadUsd: number
  incomeUsd: number
  salesUsd: number
  rentalIncomeUsd: number
  netUsd: number
  realisedNetUsd: number
  cashInCarsUsd: number
  avgDaysToSell?: number
  avgProfitPerSaleUsd?: number
  /** Realised profit over the money that went into the sold cars. */
  roiPct?: number
  /** Rental income per car per 30 days, on cars that earned rental income. */
  rentalPerCarMonthUsd?: number
  best?: { id: string; title: string; netUsd: number }
  worst?: { id: string; title: string; netUsd: number }
}
export type Month = { month: string; inUsd: number; outUsd: number; netUsd: number }
export type CompanyReport = { company: Pick<Company, 'id' | 'name' | 'kind'>; stats: Stats; months: Month[] }
export type BusinessReport = {
  overall: Stats
  months: Month[]
  companies: CompanyReport[]
  /** Cars that belong to no company yet; null when there are none. */
  unassigned: Stats | null
  thisMonth: Month
  lastMonth: Month
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isSale = (label: string) => /^sale$/i.test(label)

function monthKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The last `count` months, oldest first, ending with the month of `now`. */
function monthKeys(now: number, count = 12): string[] {
  const d = new Date(now)
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))
    out.push(monthKey(m.getTime()))
  }
  return out
}

export function statsFor(cars: GarageCar[], overhead: Array<{ usd: number }>, now = Date.now()): Stats {
  const s: Stats = { cars: cars.length, active: 0, sold: 0, carSpendUsd: 0, overheadUsd: 0, incomeUsd: 0, salesUsd: 0, rentalIncomeUsd: 0, netUsd: 0, realisedNetUsd: 0, cashInCarsUsd: 0 }
  let soldDays = 0
  let soldSpend = 0
  let rentalCarMonths = 0
  for (const c of cars) {
    const t = totalsFor(c, now)
    s.carSpendUsd += t.spentUsd
    s.incomeUsd += t.incomeUsd
    const sales = c.income.filter((m) => isSale(m.label)).reduce((a, m) => a + m.usd, 0)
    const rent = t.incomeUsd - sales
    s.salesUsd += sales
    s.rentalIncomeUsd += rent
    if (rent > 0) rentalCarMonths += Math.max(1, t.daysOwned) / 30
    if (c.status === 'sold') {
      s.sold++
      s.realisedNetUsd += t.netUsd
      soldDays += t.daysOwned
      soldSpend += t.spentUsd
    } else {
      s.active++
      s.cashInCarsUsd += Math.max(0, t.spentUsd - t.incomeUsd)
    }
    if (!s.best || t.netUsd > s.best.netUsd) s.best = { id: c.id, title: c.title, netUsd: t.netUsd }
    if (!s.worst || t.netUsd < s.worst.netUsd) s.worst = { id: c.id, title: c.title, netUsd: t.netUsd }
  }
  s.overheadUsd = overhead.reduce((a, o) => a + o.usd, 0)
  s.netUsd = s.incomeUsd - s.carSpendUsd - s.overheadUsd
  if (s.sold) {
    s.avgDaysToSell = Math.round(soldDays / s.sold)
    s.avgProfitPerSaleUsd = r2(s.realisedNetUsd / s.sold)
    s.roiPct = soldSpend > 0 ? s.realisedNetUsd / soldSpend : undefined
  }
  if (rentalCarMonths > 0) s.rentalPerCarMonthUsd = r2(s.rentalIncomeUsd / rentalCarMonths)
  for (const k of ['carSpendUsd', 'overheadUsd', 'incomeUsd', 'salesUsd', 'rentalIncomeUsd', 'netUsd', 'realisedNetUsd', 'cashInCarsUsd'] as const) s[k] = r2(s[k])
  if (cars.length < 2) { delete s.worst; if (!cars.length) delete s.best }
  return s
}

export function monthsFor(cars: GarageCar[], overhead: Array<{ usd: number; date: number }>, now = Date.now(), count = 12): Month[] {
  const keys = monthKeys(now, count)
  const m = new Map(keys.map((k) => [k, { month: k, inUsd: 0, outUsd: 0, netUsd: 0 }]))
  const add = (ms: number, usd: number, dir: 'in' | 'out') => {
    const row = m.get(monthKey(ms))
    if (!row) return
    if (dir === 'in') row.inUsd += usd
    else row.outUsd += usd
  }
  for (const c of cars) {
    add(c.boughtAt, c.purchaseUsd, 'out')
    for (const x of c.costs) add(x.date, x.usd, 'out')
    for (const x of c.income) add(x.date, x.usd, 'in')
  }
  for (const o of overhead) add(o.date, o.usd, 'out')
  return keys.map((k) => {
    const row = m.get(k)!
    return { month: k, inUsd: r2(row.inUsd), outUsd: r2(row.outUsd), netUsd: r2(row.inUsd - row.outUsd) }
  })
}

export function businessReport(cars: GarageCar[], companies: Company[], now = Date.now()): BusinessReport {
  const known = new Set(companies.map((c) => c.id))
  const allOverhead = companies.flatMap((c) => c.overhead)
  const months = monthsFor(cars, allOverhead, now)
  const loose = cars.filter((c) => !c.companyId || !known.has(c.companyId))
  return {
    overall: statsFor(cars, allOverhead, now),
    months,
    companies: companies.map((co) => {
      const mine = cars.filter((c) => c.companyId === co.id)
      return { company: { id: co.id, name: co.name, kind: co.kind }, stats: statsFor(mine, co.overhead, now), months: monthsFor(mine, co.overhead, now) }
    }),
    unassigned: loose.length ? statsFor(loose, [], now) : null,
    thisMonth: months[months.length - 1],
    lastMonth: months[months.length - 2],
  }
}

