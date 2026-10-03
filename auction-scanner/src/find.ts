/**
 * `npm run find -- --budget 15000 [--damage none|minor] [--makes "Toyota,Honda"] [--top 25]`
 *
 * Reads every connected live source now, prices each car against similar cars
 * from the same scan, and prints the deals that fit the budget: clean title,
 * no damage (or minor), not said to be broken, priced, all-in cost inside the
 * budget, and room under the ceiling. SAMPLE cars are never included.
 *
 * Every figure is from a live listing or worked out from them, and the output
 * says which. Runs on GitHub too (Actions → Gavel deal finder), where the
 * auction APIs are reachable.
 */
import { loadEnv } from './env.ts'
import type { Listing } from './types.ts'
import { scanAll, sourceStatuses } from './sources/registry.ts'
import { estimateValue } from './valuation.ts'
import { scoreListing } from './scoring.ts'
import { demandFor } from './demand.ts'
import { findDeals } from './finder.ts'
import type { DealCard } from './finder.ts'
import { money } from './ui.ts'

loadEnv()

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const budget = Number(arg('budget') ?? process.env.BUDGET ?? '')
if (!Number.isFinite(budget) || budget < 500) {
  process.stdout.write('Give a budget of at least $500: npm run find -- --budget 15000\n')
  process.exit(2)
}
const maxDamage = (arg('damage') ?? process.env.DAMAGE ?? 'minor') === 'none' ? 'none' : 'minor'
const top = Math.max(1, Math.min(100, Number(arg('top') ?? 25) || 25))
// Searched one make at a time so each car meets enough of its own kind to be priced.
const DEFAULT_MAKES = ['Toyota', 'Honda', 'Lexus', 'Ford', 'Chevrolet', 'Jeep', 'Subaru', 'Mazda', 'Nissan', 'Hyundai', 'Kia', 'BMW', 'Mercedes-Benz', 'Audi', 'Porsche', 'Tesla', 'Ram', 'GMC', 'Dodge', 'Volkswagen']
const makes = (arg('makes') ?? process.env.MAKES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const queries = makes.length ? makes : DEFAULT_MAKES

function out(line = ''): void {
  process.stdout.write(line + '\n')
}

const live = sourceStatuses().filter((s) => s.kind === 'api' && s.connected).map((s) => s.name)
out(`Gavel deal finder · budget ${money(budget)} · damage: ${maxDamage === 'none' ? 'none' : 'none or minor'} · ${new Date().toISOString()}`)
out(`Live sources: ${live.length ? live.join(', ') : 'none connected'}`)
if (!live.length) {
  out('No live source is connected, so there are no real cars to rank. Set GAVEL_GSA=1 (free) or add eBay keys, then run again.')
  process.exit(1)
}

const listings = new Map<string, Listing>()
const pool = new Map<string, Listing>()
const notes = new Set<string>()
for (const make of queries) {
  const r = await scanAll({ text: make, limit: 200 }, { allowSample: false })
  if (r.kind !== 'LIVE') continue
  for (const l of r.listings) listings.set(l.id, l)
  for (const c of r.comps) pool.set(c.id, c)
  for (const e of r.errors) notes.add(e.split('.')[0])
}
const comps = [...pool.values()]
const cards: DealCard[] = [...listings.values()].map((l) => {
  const estimate = estimateValue(l, comps)
  return { listing: l, estimate, score: scoreListing(l, estimate, demandFor(l.make, l.model)) }
})
const r = findDeals(cards, { budgetUsd: budget, maxDamage })

out(`Read ${listings.size} live cars and ${comps.length} prices to compare against.${notes.size ? ` Notes: ${[...notes].join(' | ')}` : ''}`)
const ex = Object.entries(r.excluded).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ')
out(`Left out: ${ex || 'nothing'}.`)
out()
function print(list: typeof r.deals, start = 1): void {
  list.slice(0, top).forEach((d, i) => {
    const l = d.listing
    const where = [l.location?.city, l.location?.state].filter(Boolean).join(', ') || 'location not stated'
    const ends = l.endsAt ? (l.endsAtDateOnly ? `closes ${new Date(l.endsAt).toISOString().slice(0, 10)}` : `ends ${new Date(l.endsAt).toISOString().replace('T', ' ').slice(0, 16)} UTC`) : l.saleType === 'buy-now' ? 'buy now' : 'no end time'
    const basis = d.estimate.ok && d.estimate.basis ? `${d.estimate.basis.sold} sold, ${d.estimate.basis.asks} asking, ${d.estimate.basis.bids} open bids` : `${d.comps} cars`
    out(`${String(start + i).padStart(2)}. ${l.title}`)
    out(`    ${l.mileage !== undefined ? l.mileage.toLocaleString('en-US') + ' mi' : 'miles not stated'} · ${where} · ${l.source} · ${ends}`)
    out(`    Price now ${money(d.priceUsd)} · all-in ${money(d.allInUsd)}${d.feeKnown ? '' : ' (fee not counted)'} · similar cars ${money(d.resaleUsd)} (${basis})`)
    out(`    Est. profit ${money(d.spreadUsd)} (${Math.round(d.spreadPct * 100)}%) at today's price · never bid above ${money(d.ceilingUsd)}`)
    out(`    Title clean · damage ${l.damage} · runs: ${l.runsAndDrives === true ? 'yes (seller)' : 'not stated'} · ${l.url}`)
    if (d.evidence === 'bids only') out(`    ⚠ ${d.cautions[0]}`)
  })
}
out('Profit = what similar cars go for, minus price + buyer fee + transport + $750 cushion, before selling costs. An estimate, not a promise.')
out()
if (r.deals.length) {
  out(`DEALS: ${r.deals.length} fit ${money(budget)}, valued on sold or asking prices. Biggest estimated profit first.`)
  print(r.deals)
} else {
  out(`DEALS: none confirmed at ${money(budget)} right now. A confirmed deal needs at least 3 sold or asking prices for the same car; connect eBay (free) or auto.dev (free tier) for asking prices.`)
}
if (r.leads.length) {
  out()
  out(`LEADS: ${r.leads.length} passed every check, but their value rests mostly on bids still running. Check sold prices before you bid.`)
  print(r.leads)
}
