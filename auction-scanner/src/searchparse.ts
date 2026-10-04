/**
 * THE SEARCH PARSER — plain English in, filters out. Rules only; no AI.
 *
 *   "2015+ camry under 8k no damage in tx"
 *     → Toyota Camry · 2015 or newer · under $8,000 · no damage · Texas
 *
 * Every phrase it understood comes back as a chip, so the member sees what
 * was applied; what it did not understand stays as search text. Nothing is
 * guessed: "low miles" becomes a stated number (under 80,000) and says so.
 */
import { CATALOG } from './catalog.ts'

export type ParsedSearch = {
  /** What is left to search for (make and model words, or anything not understood). */
  text: string
  make?: string
  model?: string
  minYear?: number
  maxYear?: number
  maxPriceUsd?: number
  maxMileage?: number
  damage?: 'none' | 'minor'
  state?: string
  /** One short phrase per filter applied, in the member's order. */
  understood: string[]
}

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
}
const CODES = new Set(Object.values(STATES))
const NAME_OF = Object.fromEntries(Object.entries(STATES).map(([n, c]) => [c, n.replace(/\b\w/g, (x) => x.toUpperCase())]))

function dollars(n: string, k?: string): number {
  const v = Number(n.replace(/[$,]/g, ''))
  return Math.round(k && /k/i.test(k) ? v * 1000 : v)
}
const fmt = (n: number) => '$' + n.toLocaleString('en-US')
const thisYear = () => new Date().getUTCFullYear()

export function parseSearch(input: string): ParsedSearch {
  let s = ` ${String(input ?? '').toLowerCase().replace(/\s+/g, ' ').slice(0, 160)} `
  const out: ParsedSearch = { text: '', understood: [] }
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void): void => {
    const m = s.match(re)
    if (!m) return
    fn(m)
    s = s.replace(m[0], ' ')
  }
  const year = (y: string) => { const n = Number(y.length === 2 ? '20' + y : y); return n >= 1950 && n <= thisYear() + 1 ? n : undefined }

  // Years: "2015+", "2015 or newer", "newer than 2015", "2012-2016", "2012 to 2016", "older than 2010".
  take(/\b(19[5-9]\d|20[0-4]\d)\s*(?:-|–|to)\s*(19[5-9]\d|20[0-4]\d)\b/, (m) => { const a = year(m[1]); const b = year(m[2]); if (a && b) { out.minYear = Math.min(a, b); out.maxYear = Math.max(a, b); out.understood.push(`${out.minYear} to ${out.maxYear}`) } })
  take(/\b(19[5-9]\d|20[0-4]\d)\s*(?:\+|and up|or newer|or later|and newer)/, (m) => { const y = year(m[1]); if (y) { out.minYear = y; out.understood.push(`${y} or newer`) } })
  take(/\b(?:newer than|after|since|from)\s+(19[5-9]\d|20[0-4]\d)\b/, (m) => { const y = year(m[1]); if (y) { out.minYear = m[0].startsWith('newer than') || m[0].startsWith('after') ? y + 1 : y; out.understood.push(`${out.minYear} or newer`) } })
  take(/\b(?:older than|before)\s+(19[5-9]\d|20[0-4]\d)\b/, (m) => { const y = year(m[1]); if (y) { out.maxYear = y - 1; out.understood.push(`${y - 1} or older`) } })

  // Miles before price, so "under 100k miles" is never read as a price.
  take(/\b(?:under|below|less than|max|<)\s*\$?(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:miles|mi|mileage)\b/, (m) => { out.maxMileage = dollars(m[1], m[2]); out.understood.push(`under ${out.maxMileage.toLocaleString('en-US')} miles`) })
  take(/\blow (?:miles|mileage)\b/, () => { out.maxMileage = 80_000; out.understood.push('under 80,000 miles ("low miles")') })

  // Price: "under 8k", "below $8,000", "max 8000", "<8k", "8k budget".
  take(/\b(?:under|below|less than|max|up to|<)\s*\$?(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/, (m) => { out.maxPriceUsd = dollars(m[1], m[2]); out.understood.push(`under ${fmt(out.maxPriceUsd)}`) })
  take(/\$?(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*budget\b/, (m) => { out.maxPriceUsd = dollars(m[1], m[2]); out.understood.push(`under ${fmt(out.maxPriceUsd)}`) })

  // Damage and title words.
  take(/\b(?:no damage|undamaged|zero damage|damage[- ]free)\b/, () => { out.damage = 'none'; out.understood.push('no damage') })
  take(/\bminor damage(?: ok| okay| fine)?\b/, () => { out.damage = 'minor'; out.understood.push('minor damage ok') })
  take(/\bclean(?: title)?\b/, () => { out.understood.push('clean title (always on in Starter mode)') })

  // State: "in texas", "in tx".
  take(/\bin ((?:new|north|south|west|rhode|district of) ?\w+|\w+)\b/, (m) => {
    const w = m[1].trim()
    const code = STATES[w] ?? (w.length === 2 && CODES.has(w.toUpperCase()) ? w.toUpperCase() : undefined)
    if (code) { out.state = code; out.understood.push(NAME_OF[code] ?? code) } else s = s.replace(m[0], ` ${m[0]} `)
  })

  // Make and model from the catalogue; a model alone ("camry") finds its make.
  const words = s.trim()
  for (const c of [...CATALOG].sort((a, b) => b.make.length - a.make.length)) {
    const re = new RegExp(`\\b${c.make.toLowerCase().replace(/[-]/g, '[- ]?')}\\b`)
    if (re.test(words)) { out.make = c.make; s = s.replace(re, ' '); break }
  }
  const pool = out.make ? CATALOG.filter((c) => c.make === out.make) : CATALOG
  let best: { make: string; model: string } | undefined
  for (const c of pool) for (const m of c.models) {
    const re = new RegExp(`\\b${m.toLowerCase().replace(/[-\s]/g, '[- ]?')}\\b`)
    if (re.test(s) && (!best || m.length > best.model.length)) best = { make: c.make, model: m }
  }
  if (best) {
    out.model = best.model
    if (!out.make) out.make = best.make
    s = s.replace(new RegExp(`\\b${best.model.toLowerCase().replace(/[-\s]/g, '[- ]?')}\\b`), ' ')
  }
  if (out.make) out.understood.unshift(out.model ? `${out.make} ${out.model}` : out.make)

  const rest = s.replace(/\b(?:a|an|the|cars?|for|with|and|me|find|show|looking|want|i)\b/g, ' ').replace(/\s+/g, ' ').trim()
  out.text = [out.make, out.model, rest].filter(Boolean).join(' ').trim()
  return out
}
