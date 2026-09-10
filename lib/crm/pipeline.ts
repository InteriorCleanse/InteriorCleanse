/**
 * Reading a CRM pipeline without turning it into a forecast.
 *
 * `crm_deals` is kept apart from `orders` because pipeline is money that has
 * not happened. This module summarises it for a page the same way the
 * assistant's tool does — per currency, never across currencies, never
 * weighted by probability — so the two can never disagree about what an open
 * pipeline is "worth". The vendor's probability is shown beside each deal as
 * the vendor's opinion; multiplying it through would produce a number nobody
 * measured and this product does not invent numbers.
 */

export type PipelineDeal = {
  id: string
  name: string
  stage: string
  outcome: 'open' | 'won' | 'lost'
  amountMinor: number | null
  currency: string | null
  /** The vendor's own figure, 0–100, or null when it reports none. */
  probability: number | null
  /** ISO date, or null. */
  expectedCloseOn: string | null
  owner: string | null
  source: string
  /** When the row last changed at the vendor or here; ISO timestamp or null. */
  updatedAt: string | null
}

export type CurrencyTotal = { currency: string; minor: number; deals: number }

export type StageGroup = {
  stage: string
  deals: PipelineDeal[]
  totals: CurrencyTotal[]
  withoutAmount: number
  /** Median of the vendor's probabilities in this stage, for ordering only. */
  probability: number | null
}

export type OutcomeSummary = {
  count: number
  totals: CurrencyTotal[]
  /** Deals that could not be totalled because they carry no amount or currency. */
  withoutAmount: number
}

export type PipelineSummary = {
  open: OutcomeSummary & { stages: StageGroup[] }
  won: OutcomeSummary
  lost: OutcomeSummary
  /** Open deals whose expected close is already behind us. */
  overdue: number
  /** Open deals expected to close within the next 30 days, today included. */
  closingSoon: number
}

export const CLOSING_SOON_DAYS = 30

/**
 * Summarises deals for display.
 *
 * `today` is an ISO date. `closedSince`, when given, is an ISO timestamp:
 * won and lost deals last updated before it are left out of the closed
 * counts, so "won recently" means what it says rather than "won ever".
 */
export function summarisePipeline(
  deals: readonly PipelineDeal[],
  today: string,
  closedSince?: string,
): PipelineSummary {
  const open = deals.filter((d) => d.outcome === 'open')
  const recentlyClosed = (outcome: 'won' | 'lost') =>
    deals.filter(
      (d) =>
        d.outcome === outcome &&
        (!closedSince || (d.updatedAt !== null && d.updatedAt >= closedSince)),
    )

  const soonCutoff = addDays(today, CLOSING_SOON_DAYS)
  let overdue = 0
  let closingSoon = 0
  for (const deal of open) {
    if (!deal.expectedCloseOn) continue
    if (deal.expectedCloseOn < today) overdue += 1
    else if (deal.expectedCloseOn <= soonCutoff) closingSoon += 1
  }

  return {
    open: { ...outcomeSummary(open), stages: groupByStage(open) },
    won: outcomeSummary(recentlyClosed('won')),
    lost: outcomeSummary(recentlyClosed('lost')),
    overdue,
    closingSoon,
  }
}

function outcomeSummary(deals: readonly PipelineDeal[]): OutcomeSummary {
  const { totals, withoutAmount } = totalByCurrency(deals)
  return { count: deals.length, totals, withoutAmount }
}

/** Totals per currency. A deal with no amount or no currency is counted, not summed. */
export function totalByCurrency(deals: readonly PipelineDeal[]): {
  totals: CurrencyTotal[]
  withoutAmount: number
} {
  const byCurrency = new Map<string, CurrencyTotal>()
  let withoutAmount = 0
  for (const deal of deals) {
    if (deal.amountMinor === null || !deal.currency) {
      withoutAmount += 1
      continue
    }
    const current = byCurrency.get(deal.currency) ?? { currency: deal.currency, minor: 0, deals: 0 }
    current.minor += deal.amountMinor
    current.deals += 1
    byCurrency.set(deal.currency, current)
  }
  // Largest total first so the headline is the currency the business mostly
  // trades in; ties broken by code so the order is stable between renders.
  const totals = [...byCurrency.values()].sort(
    (a, b) => b.minor - a.minor || a.currency.localeCompare(b.currency),
  )
  return { totals, withoutAmount }
}

/**
 * Groups open deals by the vendor's stage label.
 *
 * The vendor's stage *order* is not stored — every CRM lets a customer rename
 * and reorder stages — so stages are ordered by the median of the vendor's
 * own probabilities, highest first, which tracks progression through any
 * pipeline that reports one. Stages with no probability go last, by name.
 * Within a stage, the deal closing soonest comes first; undated deals last.
 */
export function groupByStage(deals: readonly PipelineDeal[]): StageGroup[] {
  const groups = new Map<string, PipelineDeal[]>()
  for (const deal of deals) {
    const list = groups.get(deal.stage) ?? []
    list.push(deal)
    groups.set(deal.stage, list)
  }

  const stages: StageGroup[] = [...groups].map(([stage, list]) => {
    const { totals, withoutAmount } = totalByCurrency(list)
    return {
      stage,
      deals: [...list].sort(byCloseDate),
      totals,
      withoutAmount,
      probability: median(list.map((d) => d.probability).filter((p): p is number => p !== null)),
    }
  })

  return stages.sort((a, b) => {
    if (a.probability === null && b.probability === null) return a.stage.localeCompare(b.stage)
    if (a.probability === null) return 1
    if (b.probability === null) return -1
    return b.probability - a.probability || a.stage.localeCompare(b.stage)
  })
}

function byCloseDate(a: PipelineDeal, b: PipelineDeal): number {
  if (a.expectedCloseOn === b.expectedCloseOn) return a.name.localeCompare(b.name)
  if (a.expectedCloseOn === null) return 1
  if (b.expectedCloseOn === null) return -1
  return a.expectedCloseOn < b.expectedCloseOn ? -1 : 1
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** ISO date arithmetic in UTC, so a page rendered at 23:59 does not drift a day. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
