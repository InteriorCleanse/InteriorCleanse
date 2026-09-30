/**
 * THE IMPORTER — how a member brings in a lot from any auction, including
 * the ones with no public API (Copart, IAA, Manheim, Cars & Bids, Bring a
 * Trailer…), without Gavel ever scraping them:
 *
 *   • the "Send to Gavel" button (a bookmarklet): on a lot page the member is
 *     already viewing, it hands the page's visible text and URL to Gavel;
 *   • pasting the lot's text or its key facts;
 *   • a CSV the member exported from their own auction account.
 *
 * Everything here reads text the member supplied. Fields are found by the
 * labels auctions print next to them ("Odometer", "Primary Damage", "Title
 * Code", "Current Bid"…). A field that is not there stays blank, and the
 * import screen shows what was found and what is missing before it is saved.
 */
import type { Damage, Listing, SaleType, TitleStatus } from '../types.ts'
import { canonicalMake, isKnownMake, looksLikeVin, parseDamage, parseMileage, parseMoney, parseTitleStatus, splitTitle } from './normalize.ts'
import { createHash } from 'node:crypto'

const HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)copart\.com$/i, 'copart'],
  [/(^|\.)iaai\.com$/i, 'iaa'],
  [/(^|\.)ebay\.com$/i, 'ebay'],
  [/(^|\.)carsandbids\.com$/i, 'carsandbids'],
  [/(^|\.)bringatrailer\.com$/i, 'bat'],
  [/(^|\.)manheim\.com$/i, 'manheim'],
  [/(^|\.)(openlane|adesa)\.com$/i, 'adesa'],
  [/(^|\.)acvauctions\.com$/i, 'acv'],
  [/(^|\.)govdeals\.com$/i, 'govdeals'],
  [/(^|\.)gsaauctions\.gov$/i, 'gsa'],
  [/(^|\.)(mecum|barrett-jackson)\.com$/i, 'collector'],
]

/** Which house a lot URL belongs to; 'other' for anything else. */
export function houseFromUrl(url: string | undefined): string {
  if (!url) return 'other'
  try {
    const host = new URL(url).hostname
    return HOSTS.find(([re]) => re.test(host))?.[1] ?? 'other'
  } catch {
    return 'other'
  }
}

export type ImportFields = {
  title?: string
  year?: number
  make?: string
  model?: string
  vin?: string
  mileage?: number
  titleStatus?: TitleStatus
  damage?: Damage
  runsAndDrives?: boolean
  hasKeys?: boolean
  currentBidUsd?: number
  buyNowUsd?: number
  endsAt?: number
  lotNumber?: string
  city?: string
  state?: string
  url?: string
  source?: string
  /** A finished sale: its price and date. Saved as a sold price (a comparable), not a car for sale. */
  soldUsd?: number
  soldAt?: number
}

/**
 * The value printed after a label, on the same line or the next one. Only
 * spaces and tabs are skipped around a label, never newlines: `\s*` there
 * made a page of blank lines take minutes to read and froze the server.
 */
function field(text: string, labels: string[]): string | undefined {
  for (const raw of labels) {
    const label = raw.replaceAll('\\s', '[ \\t]')
    const re = new RegExp(`(?:^|\\n)[ \\t]*${label}[ \\t]*[:#]?[ \\t]*(?:\\n[ \\t]*)?([^\\n]{1,160})`, 'i')
    const m = re.exec(text)
    if (m && m[1].trim() && !/^[:#]$/.test(m[1].trim())) return m[1].trim()
  }
  return undefined
}

function yesNo(v: string | undefined): boolean | undefined {
  if (!v) return undefined
  if (/^(yes|y|present|true|available|1)\b/i.test(v)) return true
  if (/^(no|n|missing|none|false|not present|0)\b/i.test(v)) return false
  return undefined
}

function runs(v: string | undefined, whole: string): boolean | undefined {
  const t = `${v ?? ''}`
  if (/(does not|doesn'?t|won'?t|will not)\s+(start|run)|non[- ]?runner|inoperable|engine does not start/i.test(t)) return false
  if (/run\s*(&|and)\s*drive|runs and drives|starts?\s*(&|and)\s*runs?|engine starts/i.test(t)) return true
  if (/\brun\s*(&|and)\s*drive\b/i.test(whole)) return true
  return undefined
}

const US_STATE = /\b(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/

function dateFrom(v: string | undefined): number | undefined {
  if (!v) return undefined
  const cleaned = v.replace(/\b(CDT|CST|EDT|EST|MDT|MST|PDT|PST)\b/g, '').replace(/\s+/g, ' ').trim()
  const n = Date.parse(cleaned)
  return Number.isFinite(n) ? n : undefined
}

/** "Sold for USD $52,000 on 9/12/26" → the date after "on", when there is one. */
function dateAfterOn(v: string): number | undefined {
  const m = /\bon\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(v)
  return m ? dateFrom(m[1]) : undefined
}

/**
 * Read a pasted or button-sent lot page. Returns the fields found; nothing is
 * guessed. A page that says what the car sold for, and has not got a future
 * end time, is read as a sold result.
 */
export function parseLotText(text: string, url?: string, now = Date.now()): { fields: ImportFields; found: string[]; missing: string[] } {
  const t = text.replace(/\r/g, '').slice(0, 60_000)
  const f: ImportFields = { url: url && /^https?:\/\//i.test(url) ? url : undefined, source: houseFromUrl(url) }
  const heading = t.split('\n').map((l) => l.trim()).find((l) => /^(19[5-9]\d|20[0-4]\d)\s+[A-Za-z]/.test(l) && l.length < 120)
  if (heading) {
    const st = splitTitle(heading)
    f.title = heading.replace(/\s+/g, ' ')
    f.year = st.year
    f.make = st.make
    f.model = st.model
  }
  const vinText = field(t, ['VIN(?:\\s*\\(Status\\))?', 'Vehicle Identification Number', 'Chassis']) ?? ''
  const vin = /\b([A-HJ-NPR-Z0-9]{17})\b/.exec(vinText.toUpperCase())?.[1] ?? /\b([A-HJ-NPR-Z0-9]{17})\b/.exec(t.toUpperCase())?.[1]
  if (vin && looksLikeVin(vin)) f.vin = vin
  const odo = field(t, ['Odometer', 'Mileage', 'Miles'])
  if (odo) f.mileage = parseMileage(odo)
  const title = field(t, ['Title Code', 'Sale Title Type', 'Title\\s*/\\s*Sale Doc', 'Title Status', 'Title Type', 'Title', 'Doc Type'])
  if (title) f.titleStatus = parseTitleStatus(title)
  const dmg = field(t, ['Primary Damage', 'Damage Description', 'Loss Type', 'Damage'])
  if (dmg) f.damage = parseDamage(dmg)
  const cond = field(t, ['Highlights', 'Start Code', 'Condition', 'Run\\s*(?:&|and)\\s*Drive', 'Runs\\s*/\\s*Drives'])
  const r = runs(cond, t)
  if (r !== undefined) f.runsAndDrives = r
  const keys = field(t, ['Keys?', 'Key Present', 'Has Keys'])
  const k = yesNo(keys)
  if (k !== undefined) f.hasKeys = k
  const bid = field(t, ['Current Bid', 'High Bid', 'Bid'])
  if (bid) f.currentBidUsd = parseMoney(bid)
  const bin = field(t, ['Buy It Now', 'Buy Now(?: Price)?'])
  if (bin) f.buyNowUsd = parseMoney(bin)
  const sale = field(t, ['Sale Date', 'Auction Date', 'Auction Ends', 'Ends', 'Sale Time'])
  if (sale) f.endsAt = dateFrom(sale)
  const lot = field(t, ['Lot(?:\\s*(?:#|No\\.?|Number))?', 'Stock(?:\\s*(?:#|No\\.?|Number))?', 'Item(?:\\s*#)'])
  if (lot) f.lotNumber = /[A-Z0-9-]{4,}/i.exec(lot)?.[0]
  const loc = field(t, ['Location', 'Selling Branch', 'Sale Location', 'Yard'])
  if (loc) {
    const st = US_STATE.exec(loc.toUpperCase())
    if (st) f.state = st[1]
    const city = /^([A-Za-z .'-]{2,40})\s*[,-]/.exec(loc.replace(/^[A-Z]{2}\s*-\s*/, ''))?.[1]
    if (city) f.city = city.trim()
  }
  const soldText = field(t, ['Sold\\s+(?:for|price)', 'Sale Price', 'Final (?:Price|Bid)', 'Winning Bid', 'Hammer Price'])
  const soldUsd = soldText ? parseMoney(soldText) : undefined
  // A live auction page can mention other cars' sale prices; a future end time means this one is still for sale.
  if (soldUsd !== undefined && soldUsd > 0 && !(f.endsAt !== undefined && f.endsAt > now)) {
    f.soldUsd = soldUsd
    const on = (soldText ? dateAfterOn(soldText) : undefined) ?? dateFrom(field(t, ['Sold on', 'Date Sold', 'Sold Date', 'Ended', 'Auction Ended']))
    f.soldAt = on ?? (f.endsAt !== undefined && f.endsAt <= now ? f.endsAt : undefined)
    delete f.currentBidUsd
    delete f.buyNowUsd
    delete f.endsAt
  }
  const found = Object.entries(f).filter(([k, v]) => v !== undefined && k !== 'source').map(([k]) => k)
  const wanted: Array<keyof ImportFields> = f.soldUsd !== undefined
    ? ['title', 'vin', 'mileage', 'titleStatus', 'soldUsd', 'soldAt']
    : ['title', 'vin', 'mileage', 'titleStatus', 'damage', 'runsAndDrives', 'currentBidUsd', 'endsAt']
  const missing = wanted.filter((k) => f[k] === undefined)
  return { fields: f, found, missing }
}

/** A tiny CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function readCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim() !== '')) out.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) out.push(row)
  return out
}

const COLUMNS: Record<keyof Omit<ImportFields, 'source'>, string[]> = {
  title: ['title', 'description', 'vehicle', 'name', 'item name'],
  year: ['year', 'model year'],
  make: ['make'],
  model: ['model group', 'model', 'model detail'],
  vin: ['vin'],
  mileage: ['odometer', 'mileage', 'miles'],
  titleStatus: ['sale title type', 'title type', 'title code', 'title status', 'title', 'sale doc'],
  damage: ['damage description', 'primary damage', 'damage'],
  runsAndDrives: ['runs/drives', 'run and drive', 'runs drives', 'start code', 'highlights'],
  hasKeys: ['has keys-yes or no', 'has keys', 'keys', 'key'],
  currentBidUsd: ['high bid =non-vix,sealed=vix', 'high bid', 'current bid', 'bid'],
  buyNowUsd: ['buy-it-now price', 'buy it now price', 'buy now price', 'buy now'],
  endsAt: ['sale date m/d/cy', 'sale date', 'auction date', 'end date'],
  lotNumber: ['lot number', 'lot', 'stock #', 'stock number', 'item #'],
  city: ['location city', 'city', 'yard name'],
  state: ['location state', 'state'],
  url: ['url', 'link', 'lot url'],
  soldUsd: ['sold price', 'sale price', 'final price', 'final bid', 'winning bid', 'hammer price', 'sold for', 'price sold', 'sold amount'],
  soldAt: ['sold date', 'date sold', 'sold on', 'sale end date', 'end date sold'],
}

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Read an exported CSV. Unknown columns are ignored; the result names the
 * columns it used. With `sold`, every row is a finished sale: its price is the
 * sold-price column, else the high bid or buy-now, and its date the sold-date
 * column, else the sale date.
 */
export function parseCsvImport(text: string, fallbackSource = 'other', opts: { sold?: boolean } = {}): { rows: ImportFields[]; used: Record<string, string>; skipped: number } {
  const table = readCsv(text)
  if (table.length < 2) return { rows: [], used: {}, skipped: 0 }
  const header = table[0].map(norm)
  const idx: Partial<Record<keyof ImportFields, number>> = {}
  const used: Record<string, string> = {}
  for (const [key, names] of Object.entries(COLUMNS) as Array<[keyof ImportFields, string[]]>) {
    const i = names.map((n) => header.indexOf(n)).find((x) => x >= 0)
    if (i !== undefined && i >= 0) { idx[key] = i; used[key] = table[0][i].trim() }
  }
  const rows: ImportFields[] = []
  let skipped = 0
  for (const line of table.slice(1, 1001)) {
    const get = (k: keyof ImportFields) => (idx[k] !== undefined ? (line[idx[k]!] ?? '').trim() : '')
    const f: ImportFields = { source: houseFromUrl(get('url')) === 'other' ? fallbackSource : houseFromUrl(get('url')) }
    const y = Number(get('year'))
    if (Number.isInteger(y) && y > 1950 && y < 2050) f.year = y
    if (get('make')) f.make = get('make')
    if (get('model')) f.model = get('model')
    f.title = get('title') || [f.year, f.make, f.model].filter(Boolean).join(' ') || undefined
    const vin = get('vin').toUpperCase()
    if (looksLikeVin(vin)) f.vin = vin
    if (get('mileage')) f.mileage = parseMileage(get('mileage'))
    if (get('titleStatus')) f.titleStatus = parseTitleStatus(get('titleStatus'))
    if (get('damage')) f.damage = parseDamage(get('damage'))
    const rd = runs(get('runsAndDrives'), '')
    if (rd !== undefined) f.runsAndDrives = rd
    const k = yesNo(get('hasKeys'))
    if (k !== undefined) f.hasKeys = k
    const bid = parseMoney(get('currentBidUsd'))
    if (bid !== undefined && bid > 0) f.currentBidUsd = bid
    const bin = parseMoney(get('buyNowUsd'))
    if (bin !== undefined && bin > 0) f.buyNowUsd = bin
    if (get('endsAt')) f.endsAt = dateFrom(get('endsAt'))
    if (get('lotNumber')) f.lotNumber = get('lotNumber')
    if (get('city')) f.city = get('city')
    if (get('state') && /^[A-Za-z]{2}$/.test(get('state'))) f.state = get('state').toUpperCase()
    if (/^https?:\/\//i.test(get('url'))) f.url = get('url')
    const sold = parseMoney(get('soldUsd'))
    if (sold !== undefined && sold > 0) f.soldUsd = sold
    else if (opts.sold) f.soldUsd = f.currentBidUsd ?? f.buyNowUsd
    if (f.soldUsd !== undefined) {
      f.soldAt = dateFrom(get('soldAt')) ?? f.endsAt
      delete f.currentBidUsd
      delete f.buyNowUsd
      delete f.endsAt
    }
    if (!f.title) { skipped++; continue }
    rows.push(f)
  }
  return { rows, used, skipped: skipped + Math.max(0, table.length - 1001) }
}

const SOURCES = new Set(['copart', 'iaa', 'ebay', 'carsandbids', 'bat', 'manheim', 'adesa', 'acv', 'govdeals', 'gsa', 'collector', 'local', 'other'])

/** Lot pages shout (PORSCHE); keep the catalog's spelling so filters and the demand list match. */
function catalogMake(m: string | undefined): string | undefined {
  if (!m) return undefined
  return isKnownMake(m) ? canonicalMake(m) : m
}

/** Validate member-edited fields and build the listing. Title is required; everything else may be blank. */
export function listingFromImport(input: unknown, now = Date.now()): Listing {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const money = (v: unknown, name: string) => {
    if (v === undefined || v === null || v === '') return undefined
    const n = typeof v === 'number' ? v : parseMoney(String(v))
    if (n === undefined || !Number.isFinite(n) || n < 0 || n > 10_000_000) throw new Error(`${name} must be a dollar amount.`)
    return n > 0 ? n : undefined
  }
  const yr = p.year === undefined || p.year === '' || p.year === null ? undefined : Number(p.year)
  if (yr !== undefined && (!Number.isInteger(yr) || yr < 1950 || yr > 2050)) throw new Error('The year must be between 1950 and 2050.')
  const make = text(p.make, 40)
  const model = text(p.model, 60)
  const title = text(p.title, 140) ?? [yr, make, model].filter(Boolean).join(' ')
  if (!title) throw new Error('Give the car a name, or its year, make and model.')
  const vin = text(p.vin, 17)?.toUpperCase()
  if (vin && !looksLikeVin(vin)) throw new Error('A VIN is 17 letters and digits, with no I, O or Q.')
  const miles = p.mileage === undefined || p.mileage === '' || p.mileage === null ? undefined : parseMileage(typeof p.mileage === 'number' ? p.mileage : String(p.mileage))
  const ts = text(p.titleStatus, 20)
  const titleStatus: TitleStatus = ts && ['clean', 'salvage', 'rebuilt', 'flood', 'lemon', 'parts-only', 'unknown'].includes(ts) ? (ts as TitleStatus) : 'unknown'
  const dm = text(p.damage, 20)
  const damage: Damage = dm && ['none', 'minor', 'moderate', 'severe', 'unknown'].includes(dm) ? (dm as Damage) : 'unknown'
  const bool = (v: unknown) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined)
  const url = text(p.url, 500)
  const src = text(p.source, 20) ?? houseFromUrl(url)
  const source = SOURCES.has(src) ? src : 'other'
  const endsRaw = p.endsAt
  const endsAt = typeof endsRaw === 'number' ? endsRaw : typeof endsRaw === 'string' && endsRaw ? Date.parse(endsRaw) : undefined
  const sold = money(p.soldUsd, 'The sold price')
  const soldRaw = p.soldAt
  const soldAt = sold === undefined ? undefined : typeof soldRaw === 'number' ? soldRaw : typeof soldRaw === 'string' && soldRaw ? Date.parse(soldRaw) : undefined
  if (sold !== undefined) {
    if (soldAt === undefined || !Number.isFinite(soldAt)) throw new Error('Add the date it sold. Gavel only uses sold prices from the last two years, so it needs the date.')
    if (soldAt > now + 86_400_000) throw new Error('The sold date is in the future. A car that has not sold yet belongs in Current bid or Buy now.')
    if (soldAt < Date.UTC(1990, 0, 1)) throw new Error('The sold date must be after 1990.')
  }
  const bid = sold === undefined ? money(p.currentBidUsd, 'The current bid') : undefined
  const bin = sold === undefined ? money(p.buyNowUsd, 'The buy-now price') : undefined
  const st = text(p.state, 2)?.toUpperCase()
  const lot = text(p.lotNumber, 40)
  // Two sold prices for the same model with no lot number or link are two sales, not one: the price, date and miles tell them apart.
  const ext = lot ?? vin ?? createHash('sha256').update(`${title}|${url ?? ''}${sold !== undefined ? `|${sold}|${soldAt}|${miles ?? ''}` : ''}`).digest('hex').slice(0, 12)
  const t = splitTitle(title)
  const saleType: SaleType = bid !== undefined && bin !== undefined ? 'auction-or-buy-now' : bin !== undefined && bid === undefined ? 'buy-now' : 'auction'
  return {
    id: `${sold === undefined ? 'import' : 'sold'}:${source}:${ext}`,
    source,
    externalId: ext,
    lotNumber: lot,
    url: url && /^https?:\/\//i.test(url) ? url : '#imported',
    title,
    year: yr ?? t.year,
    make: catalogMake(make ?? t.make),
    model: model ?? t.model,
    vin,
    mileage: miles,
    titleStatus,
    damage,
    runsAndDrives: bool(p.runsAndDrives),
    hasKeys: bool(p.hasKeys),
    location: { city: text(p.city, 60), state: st && /^[A-Z]{2}$/.test(st) ? st : undefined, country: 'US' },
    saleType,
    currentBidUsd: bid,
    buyNowUsd: bin,
    endsAt: sold === undefined && endsAt !== undefined && Number.isFinite(endsAt) ? endsAt : undefined,
    soldUsd: sold,
    soldAt: sold === undefined ? undefined : soldAt,
    sellerType: source === 'copart' || source === 'iaa' ? 'insurance' : 'unknown',
    photos: [],
    description: text(p.notes, 2000),
    kind: 'LIVE',
    origin: 'import',
    fetchedAt: now,
  }
}

/** A stored import or sold price back to the fields a member typed, so a restored backup is checked like new input. */
export function importFieldsOf(l: Listing): Record<string, unknown> {
  return {
    title: l.title, year: l.year, make: l.make, model: l.model, vin: l.vin, mileage: l.mileage,
    titleStatus: l.titleStatus, damage: l.damage, runsAndDrives: l.runsAndDrives, hasKeys: l.hasKeys,
    currentBidUsd: l.currentBidUsd, buyNowUsd: l.buyNowUsd, endsAt: l.endsAt, lotNumber: l.lotNumber,
    city: l.location?.city, state: l.location?.state, url: l.url === '#imported' ? undefined : l.url,
    source: l.source, notes: l.description, soldUsd: l.soldUsd, soldAt: l.soldAt,
  }
}
