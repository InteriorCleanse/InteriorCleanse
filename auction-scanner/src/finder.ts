/**
 * The deal finder: give it a budget, it returns the cars worth a look.
 *
 * A car is a deal here only when all of this is true:
 * - it is a real lot (LIVE), still open, with a price showing;
 * - the title is clean, damage is none (or minor, if allowed), and nobody
 *   says it does not run;
 * - Gavel can price it: at least `config.scoring.minComps` similar cars;
 * - everything it costs to get it home (price + buyer fee + tax and title
 *   when known + transport + a cushion) fits inside the budget;
 * - the price today is under the plan's ceiling, so there is room to bid.
 *
 * The profit shown is an estimate and says so: what similar cars go for, minus
 * the all-in cost at today's price, before selling costs. Bids usually rise, so
 * the ceiling (the most to bid while keeping a flip margin) is shown with it.
 * Nothing is invented: a car without enough similar cars is counted as
 * "could not price", never given a guessed value.
 */
import type { Estimate, Listing, Score } from './types.ts'
import { config } from '../config.ts'
import { buyerFee } from './fees.ts'
import { buildPlan } from './bidplan.ts'
import { askingPrice } from './valuation.ts'

export type DealCard = { listing: Listing; estimate: Estimate; score: Score }

export type FinderOptions = {
  budgetUsd: number
  /** Most damage allowed. Default: minor. */
  maxDamage?: 'none' | 'minor'
  /** Fee percents the member looked up, by house. */
  feeOverrides?: Record<string, number>
  /** Sales tax plus title, as a percent of the price, when the member has set it. */
  taxTitlePct?: number
  /** Include SAMPLE cars (practice only, when no source is connected). */
  allowSample?: boolean
  now?: number
}

export type Deal = DealCard & {
  priceUsd: number
  buyerFeeUsd: number
  /** False when the house uses a sliding scale nobody has typed in: the fee is not in the totals. */
  feeKnown: boolean
  taxTitleUsd?: number
  transportUsd: number
  cushionUsd: number
  /** Everything it takes to get the car home at today's price. */
  allInUsd: number
  /** What similar cars go for (the estimate). */
  resaleUsd: number
  /** Resale minus all-in, before selling costs. An estimate. */
  spreadUsd: number
  spreadPct: number
  /** The most to bid while keeping a flip margin and staying inside the budget. */
  ceilingUsd: number
  comps: number
  /** "firmer" at 6 or more similar cars, "thin" below. */
  confidence: 'firmer' | 'thin'
  /** "confirmed" when the value rests on enough sold or asking prices; "bids only" when mostly on bids still running. */
  evidence: 'confirmed' | 'bids only'
  cautions: string[]
}

export type ExclusionReason = 'sample' | 'ended' | 'sold' | 'no price' | 'title' | 'damage' | 'does not run' | 'could not price' | 'over budget' | 'no room'

export type FinderResult = {
  /** Every check passed and the value rests on sold or asking prices. */
  deals: Deal[]
  /** Every check passed, but the value rests mostly on bids still running: a lead to check, not a deal. */
  leads: Deal[]
  considered: number
  excluded: Record<ExclusionReason, number>
}

const DAMAGE_OK: Record<'none' | 'minor', Set<string>> = {
  none: new Set(['none']),
  minor: new Set(['none', 'minor']),
}

export function findDeals(cards: DealCard[], opts: FinderOptions): FinderResult {
  const now = opts.now ?? Date.now()
  const budget = Number.isFinite(opts.budgetUsd) && opts.budgetUsd > 0 ? opts.budgetUsd : 0
  const damageOk = DAMAGE_OK[opts.maxDamage ?? 'minor']
  const excluded: Record<ExclusionReason, number> = { sample: 0, ended: 0, sold: 0, 'no price': 0, title: 0, damage: 0, 'does not run': 0, 'could not price': 0, 'over budget': 0, 'no room': 0 }
  const deals: Deal[] = []
  const leads: Deal[] = []
  for (const card of cards) {
    const l = card.listing
    const est = card.estimate
    if (l.kind === 'SAMPLE' && !opts.allowSample) { excluded.sample++; continue }
    if (l.soldUsd !== undefined) { excluded.sold++; continue }
    if (l.endsAt !== undefined && l.endsAt <= now) { excluded.ended++; continue }
    const price = askingPrice(l)
    if (price === undefined || price <= 0) { excluded['no price']++; continue }
    if (l.titleStatus !== 'clean') { excluded.title++; continue }
    if (!damageOk.has(l.damage)) { excluded.damage++; continue }
    if (l.runsAndDrives === false) { excluded['does not run']++; continue }
    if (!est.ok) { excluded['could not price']++; continue }

    const feeOverride = opts.feeOverrides?.[l.source]
    const fee = buyerFee(l.source, price, feeOverride)
    const feeKnown = !fee.basis.startsWith('unknown')
    const taxTitleUsd = opts.taxTitlePct !== undefined ? Math.round((opts.taxTitlePct / 100) * price) : undefined
    const transportUsd = Math.round(config.plan.defaultDistanceMiles * config.plan.transportPerMileUsd)
    const cushionUsd = config.plan.surpriseReserveUsd
    const allInUsd = price + fee.usd + (taxTitleUsd ?? 0) + transportUsd + cushionUsd
    if (allInUsd > budget) { excluded['over budget']++; continue }

    const plan = buildPlan(l, est, { goal: 'flip', cashUsd: budget, taxTitlePct: opts.taxTitlePct, feePct: feeOverride, houseId: l.source })
    // At or past the ceiling there is no room to bid and keep a margin.
    if (l.saleType !== 'buy-now' && price >= plan.maxBidUsd) { excluded['no room']++; continue }
    const spreadUsd = est.valueUsd - allInUsd
    if (spreadUsd <= 0) { excluded['no room']++; continue }

    const cautions: string[] = []
    if (!feeKnown) cautions.push(`Buyer fee not counted: ${l.source} uses a sliding scale. Look it up before you bid.`)
    if (taxTitleUsd === undefined) cautions.push('Tax and title not counted: set your percent in Settings.')
    if (l.damage === 'minor') cautions.push('Minor damage listed: price the repair before you bid.')
    if (l.runsAndDrives === undefined) cautions.push('The listing does not say it runs and drives.')
    if (l.saleType !== 'buy-now') cautions.push(`Current bid, not the final price. Stop at ${moneyText(plan.maxBidUsd)}.`)
    cautions.push(`Transport assumed for ${config.plan.defaultDistanceMiles} miles; get a quote.`)

    // Bids on auctions still running finish higher, so they cannot confirm a resale value on their own.
    const firm = est.basis ? est.basis.sold + est.basis.asks : est.comps
    const evidence: Deal['evidence'] = firm >= config.scoring.minComps ? 'confirmed' : 'bids only'
    if (evidence === 'bids only') cautions.unshift(`Value rests mostly on bids still running (${est.basis?.bids ?? 0} of ${est.comps}); they usually finish higher. Check sold prices before you trust the profit.`)
    ;(evidence === 'confirmed' ? deals : leads).push({
      ...card,
      priceUsd: price,
      buyerFeeUsd: fee.usd,
      feeKnown,
      taxTitleUsd,
      transportUsd,
      cushionUsd,
      allInUsd,
      resaleUsd: est.valueUsd,
      spreadUsd,
      spreadPct: spreadUsd / allInUsd,
      ceilingUsd: plan.maxBidUsd,
      comps: est.comps,
      confidence: est.comps >= 6 ? 'firmer' : 'thin',
      evidence,
      cautions,
    })
  }
  // Biggest estimated profit first; a firmer estimate wins a tie.
  const order = (a: Deal, b: Deal) => b.spreadUsd - a.spreadUsd || (a.confidence === b.confidence ? 0 : a.confidence === 'firmer' ? -1 : 1)
  deals.sort(order)
  leads.sort(order)
  return { deals, leads, considered: cards.length, excluded }
}

function moneyText(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}
