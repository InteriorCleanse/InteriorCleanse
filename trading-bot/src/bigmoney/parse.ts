/**
 * BIG MONEY: turn raw public filings into plain rows. Pure functions: no
 * network, no clock, no store.
 *
 * Three kinds of record, each with where it came from and how late it is:
 * - CONGRESS: trades members of Congress must disclose under the STOCK Act,
 *   up to 45 days after the trade, as a dollar RANGE, never an exact amount.
 * - INSIDER: SEC Form 4, filed by officers, directors and 10% owners within
 *   two business days. Only open-market purchases (code P) and sales (code S)
 *   are counted as buying or selling; grants, option exercises and tax
 *   withholding are shown for what they are.
 * - OFF-EXCHANGE: the share of a stock's volume traded away from the public
 *   exchanges (dark pools and wholesalers), as reported to FINRA.
 *
 * Nothing here predicts anything, and nothing here reaches the engine.
 */

export type Side = 'buy' | 'sell' | 'other'
export type Source = 'QUIVER' | 'SEC EDGAR'

export type CongressTrade = {
  source: Source
  who: string
  chamber: 'House' | 'Senate' | null
  party: string | null
  ticker: string
  side: Side
  transaction: string
  /** The disclosed range, as filed: "$1,001 - $15,000". */
  range: string | null
  low: number | null
  high: number | null
  traded: string | null
  reported: string | null
  /** Days between the trade and the report; the law allows up to 45. */
  lagDays: number | null
}

export type InsiderTrade = {
  source: Source
  ticker: string
  who: string
  role: string | null
  date: string | null
  filed: string | null
  code: string
  codeText: string
  side: Side
  shares: number | null
  price: number | null
  value: number | null
  ownedAfter: number | null
  /** Made under a pre-arranged 10b5-1 trading plan, when the filing says so. */
  plan: boolean
  accession: string | null
}

export type OffExchange = {
  source: Source
  ticker: string
  date: string | null
  /** Share of volume traded off the public exchanges, 0–1. */
  offShare: number | null
  shortShare: number | null
  totalVolume: number | null
}

/** Form 4 transaction codes, in words. Only P and S are open-market buying and selling. */
export const FORM4_CODES: Record<string, { text: string; side: Side }> = {
  P: { text: 'Open-market purchase', side: 'buy' },
  S: { text: 'Open-market sale', side: 'sell' },
  A: { text: 'Grant or award from the company', side: 'other' },
  M: { text: 'Option exercise or conversion', side: 'other' },
  F: { text: 'Shares withheld to pay tax', side: 'other' },
  G: { text: 'Gift', side: 'other' },
  C: { text: 'Conversion of a derivative', side: 'other' },
  D: { text: 'Sold back to the company', side: 'other' },
  X: { text: 'Exercise of an in- or at-the-money option', side: 'other' },
  J: { text: 'Other acquisition or disposition', side: 'other' },
}

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v).trim() || null)
const num = (v: unknown): number | null => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null }
const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined }
/**
 * A filing date as a US calendar day (New York), which is how the SEC and
 * Congress date them. A date already written "YYYY-MM-DD" is kept as filed;
 * anything with a time is converted in New York time, never cut at UTC midnight.
 */
export const calendarDay = (ms: number): string => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const day = (v: unknown): string | null => { const s = str(v); if (!s) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const t = Date.parse(s); return Number.isFinite(t) ? calendarDay(t) : null }
const daysBetween = (a: string | null, b: string | null): number | null => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) : null)
const ticker = (v: unknown): string => String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12)

/** "$1,001 - $15,000" → [1001, 15000]; "Over $50,000,000" → [50000000, null]. */
export function parseRange(r: string | null): { low: number | null; high: number | null } {
  if (!r) return { low: null, high: null }
  const nums = [...r.matchAll(/\$?\s*([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter(Number.isFinite)
  if (!nums.length) return { low: null, high: null }
  if (/over|more than|\+/i.test(r) && nums.length === 1) return { low: nums[0], high: null }
  return { low: nums[0], high: nums.length > 1 ? nums[1] : nums[0] }
}

const sideOfWords = (t: string): Side => (/purchase|buy|bought/i.test(t) ? 'buy' : /sale|sell|sold/i.test(t) ? 'sell' : 'other')

/** Quiver congress rows. Field names vary between their endpoints, so each is read from its known spellings. */
export function parseQuiverCongress(body: unknown): CongressTrade[] {
  if (!Array.isArray(body)) return []
  const out: CongressTrade[] = []
  for (const r of body as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue
    const t = ticker(pick(r, 'Ticker', 'ticker'))
    if (!t) continue
    const transaction = str(pick(r, 'Transaction', 'transaction', 'Type')) ?? ''
    const range = str(pick(r, 'Range', 'range', 'Amount'))
    const { low, high } = parseRange(range)
    const traded = day(pick(r, 'TransactionDate', 'Traded', 'Date'))
    const reported = day(pick(r, 'ReportDate', 'Filed', 'DisclosureDate'))
    const house = str(pick(r, 'House', 'Chamber'))
    out.push({
      source: 'QUIVER', who: str(pick(r, 'Representative', 'Name', 'Senator', 'Politician')) ?? 'Unnamed member', chamber: house ? (/senate/i.test(house) ? 'Senate' : 'House') : null,
      party: str(pick(r, 'Party')), ticker: t, side: sideOfWords(transaction), transaction: transaction || 'Unstated', range, low, high, traded, reported, lagDays: daysBetween(traded, reported),
    })
  }
  return out
}

/** Quiver insider rows (Form 4 data they have already parsed). */
export function parseQuiverInsiders(body: unknown): InsiderTrade[] {
  if (!Array.isArray(body)) return []
  const out: InsiderTrade[] = []
  for (const r of body as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue
    const t = ticker(pick(r, 'Ticker', 'ticker'))
    if (!t) continue
    const code = (str(pick(r, 'TransactionCode', 'Code')) ?? '').toUpperCase().slice(0, 1)
    const info = FORM4_CODES[code] ?? { text: code ? `Code ${code}` : 'Unstated', side: 'other' as Side }
    const shares = num(pick(r, 'Shares', 'shares'))
    const price = num(pick(r, 'PricePerShare', 'Price'))
    out.push({
      source: 'QUIVER', ticker: t, who: str(pick(r, 'Name', 'Insider')) ?? 'Unnamed insider', role: str(pick(r, 'Title', 'Role', 'officerTitle')),
      date: day(pick(r, 'Date', 'TransactionDate')), filed: day(pick(r, 'fileDate', 'FilingDate', 'Filed')), code: code || '?', codeText: info.text, side: info.side,
      shares, price, value: shares !== null && price !== null ? Math.round(shares * price) : null, ownedAfter: num(pick(r, 'SharesOwnedFollowing', 'OwnedAfter')), plan: false, accession: null,
    })
  }
  return out
}

/** Quiver off-exchange rows: DPI is the off-exchange share of volume. */
export function parseQuiverOffExchange(body: unknown): OffExchange[] {
  if (!Array.isArray(body)) return []
  const out: OffExchange[] = []
  for (const r of body as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue
    const t = ticker(pick(r, 'Ticker', 'ticker'))
    if (!t) continue
    const total = num(pick(r, 'OTC_Total', 'Total'))
    const short = num(pick(r, 'OTC_Short', 'Short'))
    const dpi = num(pick(r, 'DPI', 'dpi'))
    out.push({ source: 'QUIVER', ticker: t, date: day(pick(r, 'Date')), offShare: dpi !== null ? (dpi > 1 ? dpi / 100 : dpi) : null, shortShare: short !== null && total ? short / total : null, totalVolume: total })
  }
  return out
}

/* ------------------------------ SEC Form 4 XML ------------------------------ */

const tag = (xml: string, name: string): string | null => { const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? m[1] : null }
const val = (xml: string | null, name: string): string | null => { if (!xml) return null; const inner = tag(xml, name); if (inner === null) return null; const v = tag(inner, 'value'); return decode((v ?? inner).trim()) || null }
const blocks = (xml: string, name: string): string[] => [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'gi'))].map((m) => m[1])
const decode = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim()

/**
 * One Form 4 (the raw XML, not the rendered page) → its non-derivative
 * transactions: common-stock buys, sales, grants, exercises, withholding.
 */
export function parseForm4Xml(xml: string, meta: { filed?: string | null; accession?: string | null } = {}): InsiderTrade[] {
  if (typeof xml !== 'string' || !/<ownershipDocument/i.test(xml)) return []
  const issuer = tag(xml, 'issuer') ?? ''
  const t = ticker(val(issuer, 'issuerTradingSymbol'))
  if (!t) return []
  const owners = blocks(xml, 'reportingOwner')
  const first = owners[0] ?? ''
  const name = val(first, 'rptOwnerName') ?? 'Unnamed insider'
  const rel = tag(first, 'reportingOwnerRelationship') ?? ''
  const isOn = (k: string) => /^(1|true)$/i.test(val(rel, k) ?? '')
  const role = val(rel, 'officerTitle') || [isOn('isDirector') ? 'Director' : '', isOn('isTenPercentOwner') ? '10% owner' : '', isOn('isOther') ? (val(rel, 'otherText') || 'Other') : ''].filter(Boolean).join(', ') || null
  const plan = /^(1|true)$/i.test(val(xml, 'aff10b5One') ?? '') || /10b5-1/i.test(tag(xml, 'footnotes') ?? '')
  const out: InsiderTrade[] = []
  for (const tx of blocks(xml, 'nonDerivativeTransaction')) {
    const code = (val(tx, 'transactionCode') ?? '').toUpperCase().slice(0, 1)
    const info = FORM4_CODES[code] ?? { text: code ? `Code ${code}` : 'Unstated', side: 'other' as Side }
    const shares = num(val(tx, 'transactionShares'))
    const price = num(val(tx, 'transactionPricePerShare'))
    out.push({
      source: 'SEC EDGAR', ticker: t, who: name.replace(/\s+/g, ' '), role, date: day(val(tx, 'transactionDate')), filed: meta.filed ?? null,
      code: code || '?', codeText: info.text, side: info.side, shares, price, value: shares !== null && price !== null && price > 0 ? Math.round(shares * price) : null,
      ownedAfter: num(val(tx, 'sharesOwnedFollowingTransaction')), plan, accession: meta.accession ?? null,
    })
  }
  return out
}

/** EDGAR submissions JSON → the most recent Form 4 filings: accession, date and the raw XML file name. */
export function form4FilingsFrom(body: unknown, { since, max = 8 }: { since: string; max?: number }): Array<{ accession: string; filed: string; xmlFile: string }> {
  const r = (body as { filings?: { recent?: Record<string, unknown[]> } })?.filings?.recent
  if (!r || !Array.isArray(r.form)) return []
  const out: Array<{ accession: string; filed: string; xmlFile: string }> = []
  for (let i = 0; i < r.form.length && out.length < max; i++) {
    if (r.form[i] !== '4') continue
    const filed = String(r.filingDate?.[i] ?? '')
    if (filed < since) break // newest first: everything after this is older
    const doc = String(r.primaryDocument?.[i] ?? '')
    const accession = String(r.accessionNumber?.[i] ?? '')
    if (!doc || !accession) continue
    // "xslF345X05/form4.xml" is the rendered page; the raw XML has the same name without the style folder.
    out.push({ accession, filed, xmlFile: doc.includes('/') ? doc.slice(doc.lastIndexOf('/') + 1) : doc })
  }
  return out
}

/* ------------------------------ The board ------------------------------ */

export type TickerBoard = {
  ticker: string
  congress: { buys: number; sells: number; lowSum: number; members: string[]; latest: string | null }
  insiders: { buys: number; sells: number; buyValue: number; sellValue: number; planSells: number; latest: string | null }
  offShare: number | null
  volumeRank: number | null
  notes: string[]
}

/** One row per ticker: what the disclosed record shows, in counts and dollars, with the caveats that matter. */
export function buildBoard(input: { congress: CongressTrade[]; insiders: InsiderTrade[]; offExchange: OffExchange[]; mostActive: Array<{ symbol: string }> }): TickerBoard[] {
  const by = new Map<string, TickerBoard>()
  const get = (t: string) => { let b = by.get(t); if (!b) { b = { ticker: t, congress: { buys: 0, sells: 0, lowSum: 0, members: [], latest: null }, insiders: { buys: 0, sells: 0, buyValue: 0, sellValue: 0, planSells: 0, latest: null }, offShare: null, volumeRank: null, notes: [] }; by.set(t, b) } return b }
  const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)
  for (const c of input.congress) {
    const b = get(c.ticker)
    if (c.side === 'buy') b.congress.buys++
    else if (c.side === 'sell') b.congress.sells++
    if (c.low !== null && c.side !== 'other') b.congress.lowSum += c.low
    if (!b.congress.members.includes(c.who)) b.congress.members.push(c.who)
    b.congress.latest = later(b.congress.latest, c.reported ?? c.traded)
  }
  for (const i of input.insiders) {
    if (i.side === 'other') continue
    const b = get(i.ticker)
    if (i.side === 'buy') { b.insiders.buys++; b.insiders.buyValue += i.value ?? 0 } else { b.insiders.sells++; b.insiders.sellValue += i.value ?? 0; if (i.plan) b.insiders.planSells++ }
    b.insiders.latest = later(b.insiders.latest, i.date)
  }
  const latestOff = new Map<string, OffExchange>()
  for (const o of input.offExchange) { const p = latestOff.get(o.ticker); if (!p || (o.date ?? '') > (p.date ?? '')) latestOff.set(o.ticker, o) }
  for (const [t, o] of latestOff) if (by.has(t) || o.offShare !== null) get(t).offShare = o.offShare
  input.mostActive.forEach((m, i) => { const t = ticker(m.symbol); if (by.has(t)) get(t).volumeRank = i + 1 })
  for (const b of by.values()) {
    if (b.insiders.buys > 0) b.notes.push(`${b.insiders.buys} open-market insider purchase${b.insiders.buys === 1 ? '' : 's'}. Insiders buy with their own cash far less often than they sell.`)
    if (b.insiders.sells > 0 && b.insiders.planSells === b.insiders.sells) b.notes.push('Every insider sale here was made under a pre-arranged 10b5-1 plan, set up months in advance.')
    if (b.congress.members.length >= 3) b.notes.push(`${b.congress.members.length} different members of Congress disclosed trades.`)
    if (b.offShare !== null && b.offShare >= 0.5) b.notes.push(`${Math.round(b.offShare * 100)}% of the latest reported volume traded off-exchange.`)
  }
  const weight = (b: TickerBoard) => b.congress.buys + b.congress.sells + b.insiders.buys * 3 + b.insiders.sells + (b.volumeRank ? 1 : 0)
  return [...by.values()].sort((a, b) => weight(b) - weight(a) || a.ticker.localeCompare(b.ticker))
}

/** A plain-language write-up of what the filings say. Counts and dates only; no opinion on what to do. */
export function digest(input: { congress: CongressTrade[]; insiders: InsiderTrade[]; board: TickerBoard[]; days: number }): string[] {
  const lines: string[] = []
  const buys = input.congress.filter((c) => c.side === 'buy'), sells = input.congress.filter((c) => c.side === 'sell')
  if (input.congress.length) {
    const top = [...new Set(buys.map((c) => c.ticker))].slice(0, 5)
    lines.push(`Congress: ${buys.length} purchase${buys.length === 1 ? '' : 's'} and ${sells.length} sale${sells.length === 1 ? '' : 's'} disclosed in the last ${input.days} days${top.length ? `; bought most often: ${top.join(', ')}` : ''}. Disclosures can arrive up to 45 days after the trade.`)
  }
  const pBuys = input.insiders.filter((i) => i.side === 'buy'), pSells = input.insiders.filter((i) => i.side === 'sell')
  if (input.insiders.length) {
    const biggest = [...pBuys].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]
    lines.push(`Insiders: ${pBuys.length} open-market purchase${pBuys.length === 1 ? '' : 's'} and ${pSells.length} open-market sale${pSells.length === 1 ? '' : 's'}${biggest && biggest.value ? `; the largest purchase was ${biggest.who} (${biggest.ticker}), about $${Math.round(biggest.value).toLocaleString('en-US')}` : ''}. Grants, exercises and tax withholding are not counted as buying or selling.`)
    const planned = pSells.filter((i) => i.plan).length
    if (pSells.length) lines.push(`${planned} of ${pSells.length} insider sales were under pre-arranged 10b5-1 plans, which are scheduled in advance and say little about the insider's view today.`)
  }
  const multi = input.board.filter((b) => b.congress.members.length >= 2 || (b.insiders.buys >= 1 && b.congress.buys >= 1)).map((b) => b.ticker).slice(0, 5)
  if (multi.length) lines.push(`Where records overlap: ${multi.join(', ')}. Overlap is worth a closer look, not a reason to trade.`)
  if (!lines.length) lines.push('NOT ENOUGH DATA: no filings in the window from the connected sources.')
  return lines
}
