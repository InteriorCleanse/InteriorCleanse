/**
 * THE BUSINESS PARTNER — Gavel reads the member's own books, watch list and
 * Sniper and says what to do next, most urgent first.
 *
 * Rule-based and offline. Every item is marked as one of:
 *   FACT            straight from the member's books or a live listing;
 *   ESTIMATE        worked out from those (a pace, a projection);
 *   INTERPRETATION  Gavel's reading of the facts, which the member may weigh differently;
 *   NEXT            a step to take.
 * No promise words, and nothing is invented: an item that needs a number the
 * member never typed asks for it instead.
 */
import type { BusinessReport } from './business.ts'
import type { Company } from './companies.ts'
import type { CarTotals, GarageCar } from './garage.ts'
import { BIG_PROFIT_USD } from './pnl.ts'

export type AdviceKind = 'FACT' | 'ESTIMATE' | 'INTERPRETATION' | 'NEXT'
export type AdviceTone = 'best' | 'go' | 'wait' | 'hot' | ''
export type Advice = { id: string; kind: AdviceKind; tone: AdviceTone; title: string; body: string; href?: string; action?: string }
export type Briefing = { headline: string; sub: string; items: Advice[] }

export type BriefingInput = {
  report: BusinessReport
  cars: Array<GarageCar & { totals: CarTotals }>
  companies: Company[]
  cashUsd?: number
  goal?: string
  taxTitlePctSet: boolean
  endingSoon: Array<{ listingId: string; title: string; endsAt: number; maxBidUsd: number }>
  unreadAlerts: number
  paperBids: number
  liveSource: boolean
  now: number
}

const DAY = 86_400_000

function usd(x: number): string {
  return (x < 0 ? '−$' : '$') + Math.abs(Math.round(x)).toLocaleString('en-US')
}
function signed(x: number): string {
  return (x > 0 ? '+' : '') + usd(x)
}
function within(ms: number): string {
  const h = Math.max(0, Math.round(ms / 3_600_000))
  return h < 1 ? 'under an hour' : h < 48 ? `${h} hour${h === 1 ? '' : 's'}` : `${Math.round(h / 24)} days`
}

export function briefing(i: BriefingInput): Briefing {
  const items: Advice[] = []
  const { report, cars, now } = i
  const o = report.overall
  const push = (a: Advice) => items.push(a)

  // 1. Money leaking now.
  for (const c of cars) {
    const t = c.totals
    if (c.status === 'sold' && t.netUsd < 0 && c.soldAt && now - c.soldAt < 120 * DAY) {
      const top = [...c.costs].sort((a, b) => b.usd - a.usd)[0]
      push({ id: `loss-${c.id}`, kind: 'FACT', tone: 'hot', title: `${c.title} lost ${usd(-t.netUsd)}`, body: `${top ? `The biggest cost after the purchase was ${top.label} at ${usd(top.usd)}. ` : ''}Look at what you would do differently before the next bid: a lower ceiling, a closer car, or a cheaper fix.`, href: '#business', action: 'Open the books' })
    }
  }
  for (const c of cars) {
    const t = c.totals
    if (c.status === 'listed' && t.daysOwned >= 45) push({ id: `slow-${c.id}`, kind: 'FACT', tone: 'wait', title: `${c.title}: ${t.daysOwned} days and not sold`, body: `${usd(Math.max(0, t.spentUsd - t.incomeUsd))} is still in it. Every week it sits costs insurance and ties up cash for the next car. Check the price against similar cars; a small cut that sells it this week usually beats waiting.`, href: '#business', action: 'Review the price' })
    if (c.status === 'fixing' && t.daysOwned >= 21) push({ id: `fix-${c.id}`, kind: 'FACT', tone: 'wait', title: `${c.title} has been in repair ${t.daysOwned} days`, body: 'Ask for a finish date. A car in the shop earns nothing and keeps the cash for your next buy out of reach.', href: '#business' })
    if (c.status === 'rented') {
      const last = Math.max(0, ...c.income.filter((m) => !/^sale$/i.test(m.label)).map((m) => m.date))
      if (now - (last || c.boughtAt) > 30 * DAY) push({ id: `rent-${c.id}`, kind: 'FACT', tone: 'wait', title: `No rental income on ${c.title} in 30 days`, body: 'Log the payouts you received, or look at its calendar and price. A rental car that sits is a cost, not an asset.', href: '#business', action: 'Add income' })
    }
    if (c.status !== 'sold' && c.costs.length === 0 && now - c.boughtAt > 3 * DAY) push({ id: `costs-${c.id}`, kind: 'NEXT', tone: '', title: `Log the costs on ${c.title}`, body: 'No costs are logged yet. The buyer fee and transport alone are usually hundreds; without them the profit reads high.', href: '#business', action: 'Add a cost' })
  }

  // 2. Opportunities with a clock on them.
  for (const p of i.endingSoon.slice(0, 2)) {
    if (p.endsAt <= now) continue
    push({ id: `ending-${p.listingId}`, kind: 'FACT', tone: 'best', title: `${p.title} ends in ${within(p.endsAt - now)}`, body: `A Sniper pick. Never bid above ${usd(p.maxBidUsd)}; the plan shows where every dollar goes.`, href: `#plan/${encodeURIComponent(p.listingId)}`, action: 'Open the plan' })
  }
  if (i.unreadAlerts > 0) push({ id: 'alerts', kind: 'FACT', tone: 'best', title: `${i.unreadAlerts} new Sniper alert${i.unreadAlerts === 1 ? '' : 's'}`, body: 'Cars that matched your targets since you last looked.', href: '#sniper', action: 'See alerts' })

  // 3. How the companies compare.
  const withSales = report.companies.filter((c) => c.stats.sold > 0 || c.stats.rentalIncomeUsd > 0)
  if (withSales.length >= 2) {
    const perMonth = withSales.map((c) => {
      const s = c.stats
      const flip = s.sold && s.avgProfitPerSaleUsd !== undefined && s.avgDaysToSell ? (s.avgProfitPerSaleUsd / Math.max(1, s.avgDaysToSell)) * 30 : undefined
      const rate = s.rentalPerCarMonthUsd ?? flip
      return { name: c.company.name, rate }
    }).filter((x): x is { name: string; rate: number } => x.rate !== undefined).sort((a, b) => b.rate - a.rate)
    if (perMonth.length >= 2) push({ id: 'compare', kind: 'ESTIMATE', tone: 'go', title: `${perMonth[0].name} earns the most per car per month`, body: `${perMonth.map((x) => `${x.name}: about ${usd(x.rate)}`).join(' · ')}. Worked out from your books (rental income per car-month; a flip's profit spread over the days it took to sell). Put the next dollar where it works hardest.` })
  }
  for (const c of report.companies) {
    if (c.stats.profitUsd < 0 && c.stats.sold >= 2) push({ id: `co-${c.company.id}`, kind: 'FACT', tone: 'hot', title: `${c.company.name} is ${usd(-c.stats.profitUsd)} down overall`, body: `After ${c.stats.sold} sales and ${usd(c.stats.overheadUsd)} of overhead. Check whether the buys, the fixes or the overhead are doing it.`, href: '#business' })
  }

  // 4. The shape of the books.
  if (report.unassigned && report.companies.length) push({ id: 'unassigned', kind: 'NEXT', tone: '', title: `${report.unassigned.cars} car${report.unassigned.cars === 1 ? '' : 's'} in no company`, body: 'Put each car in the company that paid for it, so each company\'s profit is its own.', href: '#business', action: 'Assign' })
  if (!i.companies.length && cars.length) push({ id: 'companies', kind: 'NEXT', tone: '', title: 'Set up your companies', body: 'A flip company and a rental company keep separate books. Gavel then shows profit per company and overall.', href: '#business', action: 'Add a company' })
  if (o.sold > 0 && o.best && o.best.netUsd > 0) push({ id: 'best', kind: 'FACT', tone: 'go', title: `Your best car so far: ${o.best.title}, ${signed(o.best.netUsd)}`, body: 'Find more like it: the same make and model, the same kind of auction, the same price band.', href: '#deals', action: 'Find deals' })
  if (i.cashUsd && o.cashInCarsUsd > 0) {
    const free = i.cashUsd - o.cashInCarsUsd
    push({ id: 'cash', kind: 'FACT', tone: free > 0 ? '' : 'wait', title: `${usd(o.cashInCarsUsd)} is in cars you have not sold`, body: free > 0 ? `Against your ${usd(i.cashUsd)} budget that leaves about ${usd(free)} for the next buy, if your budget is your total cash.` : `That is your whole ${usd(i.cashUsd)} budget. Sell or rent one before you buy again, or raise the budget in Settings if you have more.` })
  }
  const tm = report.thisMonth
  const lm = report.lastMonth
  if (cars.length && (tm.inUsd || tm.outUsd || lm.inUsd || lm.outUsd)) push({ id: 'month', kind: 'FACT', tone: tm.netUsd >= 0 ? 'go' : '', title: `This month: ${signed(tm.netUsd)} cash`, body: `In ${usd(tm.inUsd)}, out ${usd(tm.outUsd)}. Last month: ${signed(lm.netUsd)}. Buying a car shows as cash out in the month you buy it; the profit arrives when it sells or rents.` })

  // 5. The next step when the books are young.
  if (!cars.length) {
    push({ id: 'first', kind: 'NEXT', tone: 'best', title: 'Find your first car with a big margin', body: `Open Deals, set your budget and "Profit at least ${usd(BIG_PROFIT_USD)}". Only clean titles with little or no damage, every cost counted.`, href: '#deals', action: 'Open Deals' })
    if (i.paperBids < 3) push({ id: 'paper', kind: 'NEXT', tone: '', title: 'Practise with three paper bids first', body: 'Set your number, watch how the auction ends, and see whether you would have won at your price. It costs nothing.', href: '#feed', action: 'Open the Feed' })
  }
  if (!i.taxTitlePctSet) push({ id: 'tax', kind: 'NEXT', tone: '', title: 'Set your tax and title percent', body: 'Every all-in cost and P/L leaves tax and title out until you do. Your state\'s DMV publishes it.', href: '#settings', action: 'Settings' })
  if (!i.liveSource) push({ id: 'source', kind: 'INTERPRETATION', tone: '', title: 'No live auction source is connected', body: 'Without one Gavel can only show practice cars and the lots you import.', href: '#settings' })

  const order: Record<AdviceTone, number> = { hot: 0, best: 1, wait: 2, go: 3, '': 4 }
  items.sort((a, b) => order[a.tone] - order[b.tone])
  const headline = cars.length ? `${signed(o.profitUsd)} profit across ${o.cars} car${o.cars === 1 ? '' : 's'}${i.companies.length ? ` and ${i.companies.length} compan${i.companies.length === 1 ? 'y' : 'ies'}` : ''}` : 'Your business starts with one good car'
  const sub = cars.length ? `${usd(o.realisedNetUsd)} realised on ${o.sold} sold · ${usd(o.heldUsd)} held in ${o.active} car${o.active === 1 ? '' : 's'} you still own` : 'Gavel watches the auctions, your books and your cash, and tells you what to do next.'
  return { headline, sub, items: items.slice(0, 12) }
}

/**
 * Answer a question from the member's own numbers, without AI. Matches the
 * question to what the books can answer; anything else gets the top of the
 * briefing and a pointer to turn on the AI.
 */
export function answerFromBooks(q: string, i: BriefingInput, b: Briefing): { answer: string; source: 'rules' } {
  const s = q.toLowerCase()
  const o = i.report.overall
  const cos = i.report.companies
  const lines: string[] = []
  if (/\b(tax(es)?|irs|deduct\w*|llc|legal|lawyers?|licen[cs]es?)\b|\bwrit\w*.{0,12}\boff\b/.test(s)) {
    lines.push('That is a question for a tax adviser or your state, and Gavel will not guess at the law. Keep every receipt in the books here so whoever you ask has the numbers. The Intel screen links each state\'s dealer-licence rules.')
  } else if (/\b(compan(y|ies)|which business|compar\w*|best business)\b/.test(s)) {
    if (!cos.length) lines.push('You have no companies yet. Add them under Business and put each car in one; then this answer compares them.')
    else lines.push(...[...cos].sort((a, b) => b.stats.profitUsd - a.stats.profitUsd).map((c) => `${c.company.name} (${c.company.kind}): ${signed(c.stats.profitUsd)} profit on ${c.stats.cars} car${c.stats.cars === 1 ? '' : 's'}, ${usd(c.stats.overheadUsd)} overhead${c.stats.avgProfitPerSaleUsd !== undefined ? `, ${usd(c.stats.avgProfitPerSaleUsd)} a sale` : ''}${c.stats.rentalPerCarMonthUsd !== undefined ? `, ${usd(c.stats.rentalPerCarMonthUsd)} rent per car-month` : ''}.`))
  } else if (/\b(profits?|made|net|earn\w*|money|doing|how am i)\b/.test(s)) {
    lines.push(o.cars ? `Profit so far: ${signed(o.profitUsd)}. That is ${signed(o.realisedNetUsd)} on ${o.sold} sold car${o.sold === 1 ? '' : 's'}, plus income less running costs on the ${o.active} you still own, less ${usd(o.overheadUsd)} overhead. The ${usd(o.heldUsd)} you paid for cars you still own is held, not lost; it comes back when they sell. Cash flow, every dollar in less every dollar out: ${signed(o.netUsd)}.` : 'No cars in the books yet, so there is no profit to report. Add your first car under Business when you buy it.')
    if (o.avgProfitPerSaleUsd !== undefined) lines.push(`Each sale has made ${usd(o.avgProfitPerSaleUsd)} on average, in ${o.avgDaysToSell} days.`)
  } else if (/\b(cash|afford|budget|spend|how much)\b/.test(s)) {
    lines.push(i.cashUsd ? `Your budget is ${usd(i.cashUsd)}. ${usd(o.cashInCarsUsd)} is in cars not sold yet.` : 'Set your budget in Settings and this answer works out what is free for the next car.')
    lines.push('On Deals the all-in figure includes the fee, transport, likely materials and a cushion, so it is the number to hold against your cash.')
  } else if (/\b(sell|price|list|asking)\b/.test(s)) {
    const open = i.cars.filter((c) => c.status !== 'sold')
    if (!open.length) lines.push('Nothing in the books is waiting to sell.')
    for (const c of open.slice(0, 4)) {
      const inIt = Math.max(0, c.totals.spentUsd - c.totals.incomeUsd)
      lines.push(`${c.title}: ${usd(inIt)} in it, so ${usd(inIt)} breaks even and ${usd(inIt + BIG_PROFIT_USD)} clears ${usd(BIG_PROFIT_USD)}. Price it against similar cars, not against what you paid.`)
    }
  } else if (/\b(buy|deal|find|next car|steal|bargain)\b/.test(s)) {
    lines.push(`Open Deals with your budget and "Profit at least ${usd(BIG_PROFIT_USD)}". Every car there is a clean title, no or minor damage, and priced against similar cars, with fees, transport, materials and a cushion counted.`)
  }
  if (!lines.length) lines.push(...b.items.slice(0, 3).map((x) => `${x.title}. ${x.body}`))
  return { answer: lines.join('\n\n'), source: 'rules' }
}
