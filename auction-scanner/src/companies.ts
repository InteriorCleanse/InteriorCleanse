/**
 * COMPANIES — the member's businesses, so each one keeps its own books: a
 * flip company, a rental company, or one that does both. A car in the Garage
 * belongs to one company (or none yet). Each company also carries overhead,
 * the costs that belong to the business and not to any one car: a dealer
 * licence, an insurance policy, a lot, software.
 *
 * Only what the member types in. Kept per member in companies.json.
 */
import { randomUUID } from 'node:crypto'
import { readJson, userFile, writeJson } from './store.ts'

export type CompanyKind = 'flip' | 'rental' | 'mixed'
export type Overhead = { id: string; date: number; usd: number; label: string }
export type Company = { id: string; name: string; kind: CompanyKind; overhead: Overhead[]; notes?: string; createdAt: number; updatedAt: number }

const FILE = 'companies.json'
const KINDS = new Set<CompanyKind>(['flip', 'rental', 'mixed'])
const DAY = 86_400_000
export const MAX_COMPANIES = 20

function read(): Company[] {
  const v = readJson<unknown>(userFile(FILE), [])
  return Array.isArray(v) ? (v as Company[]) : []
}
function write(list: Company[]): void { writeJson(userFile(FILE), list) }

function text(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
}

export function listCompanies(): Company[] { return read().sort((a, b) => a.createdAt - b.createdAt) }
export function companyExists(id: string): boolean { return read().some((c) => c.id === id) }

function kindOf(v: unknown): CompanyKind {
  if (v === undefined || v === '') return 'mixed'
  if (typeof v !== 'string' || !KINDS.has(v as CompanyKind)) throw new Error('A company is a flip, rental or mixed business.')
  return v as CompanyKind
}

export function addCompany(input: unknown, now = Date.now()): Company {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const name = text(p.name, 60)
  if (!name) throw new Error('Give the company a name, for example "Northside Flips LLC".')
  const list = read()
  if (list.length >= MAX_COMPANIES) throw new Error(`Gavel keeps books for up to ${MAX_COMPANIES} companies.`)
  if (list.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error('You already have a company with that name.')
  const c: Company = { id: randomUUID(), name, kind: kindOf(p.kind), overhead: [], notes: text(p.notes, 1000), createdAt: now, updatedAt: now }
  write([...list, c])
  return c
}

function mutate(id: string, fn: (c: Company) => void, now: number): Company {
  const list = read()
  const c = list.find((x) => x.id === id)
  if (!c) throw new Error('No company with that id.')
  fn(c)
  c.updatedAt = now
  write(list)
  return c
}

export function updateCompany(id: string, input: unknown, now = Date.now()): Company {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return mutate(id, (c) => {
    if ('name' in p) {
      const name = text(p.name, 60)
      if (!name) throw new Error('A company needs a name.')
      c.name = name
    }
    if ('kind' in p) c.kind = kindOf(p.kind)
    if ('notes' in p) c.notes = text(p.notes, 1000)
  }, now)
}

export function addOverhead(id: string, input: unknown, now = Date.now()): Company {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const label = text(p.label, 80)
  if (!label) throw new Error('Say what the cost was for, for example "Dealer licence" or "Insurance".')
  const usd = typeof p.usd === 'number' ? p.usd : Number(String(p.usd ?? '').replace(/[$,\s]/g, ''))
  if (!Number.isFinite(usd) || usd < 0.01 || usd > 10_000_000) throw new Error('The amount must be a dollar amount between 0.01 and 10,000,000.')
  const d = p.date === undefined || p.date === '' ? now : typeof p.date === 'number' ? p.date : Date.parse(String(p.date))
  if (!Number.isFinite(d) || d < Date.UTC(1990, 0, 1) || d > now + 366 * DAY) throw new Error('That date does not look right. Use a date like 2026-09-28.')
  return mutate(id, (c) => { c.overhead.push({ id: randomUUID(), date: d, usd: Math.round(usd * 100) / 100, label }) }, now)
}

export function removeOverhead(id: string, entryId: string, now = Date.now()): Company {
  return mutate(id, (c) => {
    const before = c.overhead.length
    c.overhead = c.overhead.filter((o) => o.id !== entryId)
    if (c.overhead.length === before) throw new Error('No entry with that id on this company.')
  }, now)
}

export function removeCompany(id: string): boolean {
  const list = read()
  const next = list.filter((c) => c.id !== id)
  if (next.length === list.length) return false
  write(next)
  return true
}

/** Check a companies file from a backup. Throws on the first bad company. */
export function validateCompaniesFile(v: unknown): Company[] {
  if (!Array.isArray(v)) throw new Error('companies must be a list.')
  if (v.length > MAX_COMPANIES) throw new Error(`companies holds up to ${MAX_COMPANIES}.`)
  return v.map((c, i) => {
    const x = c as Company
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || typeof x.name !== 'string' || !KINDS.has(x.kind) || !Array.isArray(x.overhead)) throw new Error(`companies[${i}] is missing a field.`)
    for (const [j, o] of x.overhead.entries()) if (!o || typeof o.usd !== 'number' || typeof o.label !== 'string' || typeof o.date !== 'number') throw new Error(`companies[${i}].overhead[${j}] is not a cost.`)
    return x
  })
}
