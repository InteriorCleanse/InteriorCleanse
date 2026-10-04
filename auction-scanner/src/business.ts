/**
 * THE BUSINESS REPORT — profit per company and overall, from the Garage and
 * the companies' overhead. Pure arithmetic on what the member typed in:
 * nothing estimated, nothing filled in.
 *
 *   profit    = net on the cars already sold
 *               + income − running costs on the cars still owned
 *               − overhead
 *               (a car still owned is held at what was paid for it, not
 *               counted as a loss; no depreciation is guessed)
 *   held      = what was paid for the cars still owned
 *   cash flow = every dollar in − every dollar out (the bank's view)
 *   realised  = net on the cars already sold
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
  /** Cash flow: every dollar in minus every dollar out. */
  netUsd: number
  /** Profit: sold cars in full, owned cars' income and running costs, minus overhead. */
  profitUsd: number
  /** What was paid for the cars still owned (held at cost). */
  heldUsd: number
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
  const s: Stats = { cars: cars.length, active: 0, sold: 0, carSpendUsd: 0, overheadUsd: 0, incomeUsd: 0, salesUsd: 0, rentalIncomeUsd: 0, netUsd: 0, profitUsd: 0, heldUsd: 0, realisedNetUsd: 0, cashInCarsUsd: 0 }
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
      s.heldUsd += c.purchaseUsd
      s.profitUsd += t.incomeUsd - (t.spentUsd - c.purchaseUsd)
    }
    if (!s.best || t.netUsd > s.best.netUsd) s.best = { id: c.id, title: c.title, netUsd: t.netUsd }
    if (!s.worst || t.netUsd < s.worst.netUsd) s.worst = { id: c.id, title: c.title, netUsd: t.netUsd }
  }
  s.overheadUsd = overhead.reduce((a, o) => a + o.usd, 0)
  s.netUsd = s.incomeUsd - s.carSpendUsd - s.overheadUsd
  s.profitUsd += s.realisedNetUsd - s.overheadUsd
  if (s.sold) {
    s.avgDaysToSell = Math.round(soldDays / s.sold)
    s.avgProfitPerSaleUsd = r2(s.realisedNetUsd / s.sold)
    s.roiPct = soldSpend > 0 ? s.realisedNetUsd / soldSpend : undefined
  }
  if (rentalCarMonths > 0) s.rentalPerCarMonthUsd = r2(s.rentalIncomeUsd / rentalCarMonths)
  for (const k of ['carSpendUsd', 'overheadUsd', 'incomeUsd', 'salesUsd', 'rentalIncomeUsd', 'netUsd', 'profitUsd', 'heldUsd', 'realisedNetUsd', 'cashInCarsUsd'] as const) s[k] = r2(s[k])
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


/** A spreadsheet cell: quoted, and a leading = + - @ in text is defused so a spreadsheet never runs it as a formula. */
function cell(v: string | number): string {
  if (typeof v === 'number') return String(Math.round(v * 100) / 100)
  const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return `"${t.replace(/"/g, '""')}"`
}

/**
 * The books as a CSV, one row per dollar that moved: purchases, car costs,
 * income, and each company's business costs. Money out is negative. For an
 * accountant, a spreadsheet, or a tax adviser. `only` limits it to one
 * company id, or 'none' for cars in no company.
 */
export function ledgerCsv(cars: GarageCar[], companies: Company[], only?: string): string {
  const name = new Map(companies.map((c) => [c.id, c.name]))
  const rows: Array<{ date: number; cols: Array<string | number> }> = []
  const want = (companyId?: string) => !only || (only === 'none' ? !companyId || !name.has(companyId) : companyId === only)
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  for (const c of cars) {
    if (!want(c.companyId)) continue
    const co = c.companyId ? name.get(c.companyId) ?? '' : ''
    rows.push({ date: c.boughtAt, cols: [day(c.boughtAt), co, c.title, c.vin ?? '', 'Purchase', c.boughtFrom ? `Bought from ${c.boughtFrom}` : 'Purchase', -c.purchaseUsd, c.status] })
    for (const m of c.costs) rows.push({ date: m.date, cols: [day(m.date), co, c.title, c.vin ?? '', 'Car cost', m.label, -m.usd, c.status] })
    for (const m of c.income) rows.push({ date: m.date, cols: [day(m.date), co, c.title, c.vin ?? '', /^sale$/i.test(m.label) ? 'Sale' : 'Income', m.label, m.usd, c.status] })
  }
  for (const co of companies) {
    if (only && only !== co.id) continue
    for (const o of co.overhead) rows.push({ date: o.date, cols: [day(o.date), co.name, '', '', 'Business cost', o.label, -o.usd, ''] })
  }
  rows.sort((a, b) => a.date - b.date)
  const head = ['Date', 'Company', 'Car', 'VIN', 'Type', 'What for', 'Amount (USD)', 'Car status now']
  return [head.map(cell).join(','), ...rows.map((r) => r.cols.map(cell).join(','))].join('\r\n') + '\r\n'
}
