/**
 * THE P/L ESTIMATOR — what one car makes or loses, line by line, before you
 * buy it or while you own it.
 *
 * Every line says where its number came from: one you typed ("yours"), an
 * auction's published fee, an estimate from similar cars, or one of Gavel's
 * working figures (transport per mile, the materials ranges, the cushion).
 * A line Gavel cannot know is left out and named, never guessed. The answer
 * is an estimate and says so; nothing here promises a sale price.
 */
import { config } from '../config.ts'
import { buyerFee } from './fees.ts'

export type PnlBasis = 'yours' | 'published fee' | 'estimate' | 'working figure' | 'spent'
export type PnlLine = { key: string; label: string; usd: number; basis: PnlBasis; note?: string }

export type PnlInput = {
  /** Price paid, or the bid you plan to win at. */
  buyUsd: number
  houseId?: string
  /** Buyer fee as a percent, when the member looked it up. */
  feePct?: number
  /** The buyer fee in dollars, when known exactly (overrides the schedule). */
  buyerFeeUsd?: number
  transportUsd?: number
  distanceMiles?: number
  taxTitlePct?: number
  materialsUsd?: number
  /** True when materialsUsd is Gavel's working range, not the member's figure. */
  materialsFromRanges?: boolean
  partsUsd?: number
  labourUsd?: number
  /** Insurance, storage, registration while you hold it. */
  holdingUsd?: number
  /** Listing fees, ads, a consignment or marketplace cut. */
  sellingUsd?: number
  otherUsd?: number
  /** Include the surprise cushion as a cost (default: yes before you buy). */
  cushion?: boolean
  /** The price you expect to sell at. */
  saleUsd?: number
  /** The range similar cars sell in, when an estimate supplied one. */
  saleLowUsd?: number
  saleHighUsd?: number
  /** Money already spent on this car (from the books); replaces the planned purchase lines. */
  spentUsd?: number
}

export type PnlVerdict = 'big' | 'good' | 'thin' | 'loss' | 'unknown'
export type Pnl = {
  lines: PnlLine[]
  costUsd: number
  saleUsd?: number
  profitUsd?: number
  /** Profit over the sale price. */
  marginPct?: number
  /** Profit over the money put in. */
  roiPct?: number
  /** The sale price that returns every dollar and no more. */
  breakEvenUsd: number
  /** The sale price needed for the profit Gavel calls big. */
  bigProfitSaleUsd: number
  scenarios: Array<{ label: string; saleUsd: number; profitUsd: number }>
  verdict: PnlVerdict
  verdictText: string
  missing: string[]
}

/** Profit Gavel calls big (and the share of the money in) — the owner's "great, not just good". */
export const BIG_PROFIT_USD = 2_500
export const BIG_ROI = 0.3
export const GOOD_PROFIT_USD = 1_000
export const GOOD_ROI = 0.15

function n(v: unknown): number | undefined {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[$,\s]/g, '')) : NaN
  return Number.isFinite(x) && x >= 0 && x <= 50_000_000 ? x : undefined
}

/** Read a P/L request body. Unknown or negative numbers are dropped, never coerced. */
export function pnlInputFrom(body: Record<string, unknown>): PnlInput {
  const buy = n(body.buyUsd)
  if (buy === undefined || buy <= 0) throw new Error('Give the price you paid or plan to bid, in dollars.')
  const out: PnlInput = { buyUsd: buy }
  const keys = ['feePct', 'buyerFeeUsd', 'transportUsd', 'distanceMiles', 'taxTitlePct', 'materialsUsd', 'partsUsd', 'labourUsd', 'holdingUsd', 'sellingUsd', 'otherUsd', 'saleUsd', 'saleLowUsd', 'saleHighUsd', 'spentUsd'] as const
  for (const k of keys) {
    const v = n(body[k])
    if (v !== undefined) out[k] = v
  }
  if (out.feePct !== undefined && out.feePct > 100) delete out.feePct
  if (out.taxTitlePct !== undefined && out.taxTitlePct > 30) delete out.taxTitlePct
  if (typeof body.houseId === 'string' && /^[a-z0-9-]{1,40}$/.test(body.houseId)) out.houseId = body.houseId
  if (typeof body.cushion === 'boolean') out.cushion = body.cushion
  if (body.materialsFromRanges === true) out.materialsFromRanges = true
  return out
}

export function estimatePnl(p: PnlInput): Pnl {
  const lines: PnlLine[] = []
  const missing: string[] = []

  if (p.spentUsd !== undefined) {
    lines.push({ key: 'spent', label: 'Spent so far (from your books)', usd: p.spentUsd, basis: 'spent' })
  } else {
    lines.push({ key: 'buy', label: 'Purchase price', usd: p.buyUsd, basis: 'yours' })
    if (p.buyerFeeUsd !== undefined) lines.push({ key: 'fee', label: 'Buyer fee', usd: p.buyerFeeUsd, basis: 'yours' })
    else if (p.houseId) {
      const fee = buyerFee(p.houseId, p.buyUsd, p.feePct)
      if (fee.basis.startsWith('unknown')) missing.push('The buyer fee: this house uses a sliding scale. Look it up and type it in.')
      else lines.push({ key: 'fee', label: 'Buyer fee', usd: fee.usd, basis: p.feePct !== undefined ? 'yours' : 'published fee', note: fee.basis })
    } else missing.push('The buyer fee: pick the auction or type the fee.')
    if (p.transportUsd !== undefined) lines.push({ key: 'transport', label: 'Transport', usd: p.transportUsd, basis: 'yours' })
    else {
      const miles = p.distanceMiles ?? config.plan.defaultDistanceMiles
      lines.push({ key: 'transport', label: 'Transport', usd: Math.round(miles * config.plan.transportPerMileUsd), basis: 'working figure', note: `${miles.toLocaleString('en-US')} miles at $${config.plan.transportPerMileUsd.toFixed(2)}; get a real quote` })
    }
    if (p.taxTitlePct !== undefined) lines.push({ key: 'tax', label: 'Tax and title', usd: Math.round((p.taxTitlePct / 100) * p.buyUsd), basis: 'yours', note: `${p.taxTitlePct}% of the price` })
    else missing.push('Tax and title: set your percent in Settings or type it here.')
  }
  if (p.materialsUsd !== undefined) lines.push({ key: 'materials', label: 'Materials', usd: p.materialsUsd, basis: p.materialsFromRanges ? 'working figure' : 'yours', note: p.materialsFromRanges ? "the middle of Gavel's working ranges for this car" : undefined })
  if (p.partsUsd !== undefined) lines.push({ key: 'parts', label: 'Parts', usd: p.partsUsd, basis: 'yours' })
  if (p.labourUsd !== undefined) lines.push({ key: 'labour', label: 'Labour', usd: p.labourUsd, basis: 'yours' })
  if (p.holdingUsd !== undefined) lines.push({ key: 'holding', label: 'Insurance, storage, registration while you hold it', usd: p.holdingUsd, basis: 'yours' })
  if (p.sellingUsd !== undefined) lines.push({ key: 'selling', label: 'Selling costs (listing, ads, fees)', usd: p.sellingUsd, basis: 'yours' })
  if (p.otherUsd !== undefined) lines.push({ key: 'other', label: 'Other', usd: p.otherUsd, basis: 'yours' })
  if (p.cushion ?? p.spentUsd === undefined) lines.push({ key: 'cushion', label: 'Cushion for surprises', usd: config.plan.surpriseReserveUsd, basis: 'working figure', note: 'for what you only find after the car arrives' })

  const costUsd = Math.round(lines.reduce((s, l) => s + l.usd, 0))
  const breakEvenUsd = costUsd
  const bigProfitSaleUsd = Math.max(costUsd + BIG_PROFIT_USD, Math.round(costUsd * (1 + BIG_ROI)))
  const out: Pnl = { lines, costUsd, breakEvenUsd, bigProfitSaleUsd, scenarios: [], verdict: 'unknown', verdictText: '', missing }

  if (p.saleUsd === undefined || p.saleUsd <= 0) {
    out.verdictText = `Type the price you expect to sell at. You break even at ${usd(breakEvenUsd)} and clear a big profit at ${usd(bigProfitSaleUsd)}.`
    return out
  }
  const sale = p.saleUsd
  const profit = Math.round(sale - costUsd)
  out.saleUsd = sale
  out.profitUsd = profit
  out.marginPct = profit / sale
  out.roiPct = costUsd > 0 ? profit / costUsd : undefined
  const at = (label: string, s: number) => ({ label, saleUsd: Math.round(s), profitUsd: Math.round(s - costUsd) })
  if (p.saleLowUsd !== undefined && p.saleLowUsd < sale) out.scenarios.push(at('At the low end of similar cars', p.saleLowUsd))
  out.scenarios.push(at('If it sells 10% under your price', sale * 0.9))
  if (p.saleHighUsd !== undefined && p.saleHighUsd > sale) out.scenarios.push(at('At the high end of similar cars', p.saleHighUsd))

  const roi = out.roiPct ?? 0
  out.verdict = profit <= 0 ? 'loss' : profit >= BIG_PROFIT_USD && roi >= BIG_ROI ? 'big' : profit >= GOOD_PROFIT_USD && roi >= GOOD_ROI ? 'good' : 'thin'
  out.verdictText = {
    big: `Big margin: about ${usd(profit)} (${Math.round(roi * 100)}% on the money in), an estimate with every listed cost counted.`,
    good: `Good margin: about ${usd(profit)} (${Math.round(roi * 100)}%). A big one needs a sale near ${usd(bigProfitSaleUsd)} or a lower buy.`,
    thin: `Thin: about ${usd(profit)}. One surprise repair takes it. A big margin needs a sale near ${usd(bigProfitSaleUsd)}.`,
    loss: `Loss of about ${usd(-profit)} at this sale price. You break even at ${usd(breakEvenUsd)}.`,
    unknown: '',
  }[out.verdict]
  return out
}

function usd(x: number): string {
  return (x < 0 ? '−$' : '$') + Math.abs(Math.round(x)).toLocaleString('en-US')
}
